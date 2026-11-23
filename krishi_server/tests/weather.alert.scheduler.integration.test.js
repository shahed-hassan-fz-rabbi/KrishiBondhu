import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import {
  connectIsolatedTestDatabase,
  disconnectIsolatedTestDatabase,
} from "./helpers/isolatedMongo.js";
import { User } from "../src/models/user.model.js";
import { SmsPreferences } from "../src/models/smsPreferences.model.js";
import { SmsNotificationLog } from "../src/models/smsNotificationLog.model.js";
import {
  WeatherAlertCycleLock,
  WEATHER_CYCLE_LOCK_ID,
} from "../src/models/weatherAlertCycleLock.model.js";
import { SmsOutbox } from "../src/models/smsOutbox.model.js";
import {
  createDbCycleLock,
  runWeatherAlertCycle,
} from "../src/services/sms/weatherAlertCycle.service.js";
import { startWeatherAlertScheduler } from "../src/services/sms/weatherAlertScheduler.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";
import { WEATHER_SOURCE } from "../src/services/sms/weatherAlertEngine.js";

/**
 * REAL database-backed verification. These tests are BLOCKED (skipped) unless
 * MONGODB_TEST_URI points to a dedicated kb_test_ database. They never touch
 * MONGODB_URI and never call the live SMS gateway.
 */
const dbAvailable = Boolean(process.env.MONGODB_TEST_URI);
const BLOCKED = "BLOCKED: no isolated MongoDB test instance (set MONGODB_TEST_URI to a kb_test_ database)";
const integration = (name, fn) => test(name, { skip: dbAvailable ? false : BLOCKED }, fn);

let databaseName = null;
const COLLECTIONS = [User, SmsPreferences, SmsNotificationLog, SmsOutbox, WeatherAlertCycleLock];

if (dbAvailable) {
  before(async () => {
    databaseName = await connectIsolatedTestDatabase("weather_scheduler");
  });
  beforeEach(async () => {
    await Promise.all(COLLECTIONS.map((model) => model.deleteMany({})));
  });
  after(async () => {
    if (databaseName) {
      await Promise.all(COLLECTIONS.map((model) => model.deleteMany({})));
      await disconnectIsolatedTestDatabase(databaseName);
    }
  });
}

function validForecast(now = new Date()) {
  const date = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  return {
    location: { nameEn: "Cumilla" },
    shortRangeForecast: [{ dayIndex: 1, date, precipitationSumMm: 90, weatherCode: 1 }],
    meta: { provider: WEATHER_SOURCE, dataStatus: "AVAILABLE", fetchTimestamp: now.toISOString() },
  };
}

async function seedFarmers(count = 2) {
  const now = new Date();
  for (let index = 1; index <= count; index += 1) {
    const phone = `+880171000000${index}`;
    const user = await User.create({
      name: `Integration Farmer ${index}`,
      phone,
      phoneVerifiedAt: new Date(now.getTime() - 86_400_000),
      preferredDistrict: "cumilla",
      role: "farmer",
      passwordHash: "integration-only-hash",
    });
    const patch = updateCategoryConsent(null, "weather", true, { now });
    await SmsPreferences.create({
      userId: user._id,
      ...toModelPatch(patch),
      phoneLast4: phone.slice(-4),
    });
  }
}

function cycleOptions(extra = {}) {
  return {
    lockModel: WeatherAlertCycleLock,
    getForecast: async () => validForecast(),
    now: new Date(),
    ...extra,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

async function waitForLockOwner(runId, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const doc = await WeatherAlertCycleLock.findById(WEATHER_CYCLE_LOCK_ID).lean();
    if (doc?.status === "running" && doc.runId === runId) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`lock owner ${runId} was not observed`);
}

integration("lock acquisition and release against the real database", async () => {
  const lock = createDbCycleLock(WeatherAlertCycleLock);
  const acquired = await lock.acquire({ runId: "owner-1", now: new Date(), ttlMs: 60_000 });
  assert.equal(acquired, true);

  const held = await WeatherAlertCycleLock.findById(WEATHER_CYCLE_LOCK_ID).lean();
  assert.equal(held.status, "running");
  assert.equal(held.runId, "owner-1");

  await lock.release({ runId: "owner-1", now: new Date() });
  const released = await WeatherAlertCycleLock.findById(WEATHER_CYCLE_LOCK_ID).lean();
  assert.equal(released.status, "idle");
  assert.equal(released.runId, "owner-1");
});

integration("two concurrent workers cannot run the same cycle", async () => {
  await seedFarmers(2);
  const gate = deferred();
  const first = runWeatherAlertCycle(cycleOptions({
    runId: "worker-a",
    getForecast: () => gate.promise,
  }));
  await waitForLockOwner("worker-a");

  const second = await runWeatherAlertCycle(cycleOptions({ runId: "worker-b" }));
  assert.equal(second.locked, true);
  assert.equal(second.dryRunAlerts, 0);

  gate.resolve(validForecast());
  const firstSummary = await first;
  assert.equal(firstSummary.dryRunAlerts, 2);
});

integration("an expired lease can be recovered by a new worker", async () => {
  const lock = createDbCycleLock(WeatherAlertCycleLock);
  await WeatherAlertCycleLock.updateOne(
    { _id: WEATHER_CYCLE_LOCK_ID },
    { $set: { status: "running", runId: "crashed", expiresAt: new Date(Date.now() - 1000) } },
    { upsert: true }
  );

  const acquired = await lock.acquire({ runId: "recovered", now: new Date(), ttlMs: 60_000 });
  assert.equal(acquired, true);
  const doc = await WeatherAlertCycleLock.findById(WEATHER_CYCLE_LOCK_ID).lean();
  assert.equal(doc.runId, "recovered");
  await lock.release({ runId: "recovered", now: new Date() });
});

integration("only the lock owner can release it", async () => {
  const lock = createDbCycleLock(WeatherAlertCycleLock);
  assert.equal(await lock.acquire({ runId: "rightful-owner", now: new Date(), ttlMs: 60_000 }), true);

  await lock.release({ runId: "intruder", now: new Date() });
  const stillHeld = await WeatherAlertCycleLock.findById(WEATHER_CYCLE_LOCK_ID).lean();
  assert.equal(stillHeld.status, "running");
  assert.equal(stillHeld.runId, "rightful-owner");

  await lock.release({ runId: "rightful-owner", now: new Date() });
  const released = await WeatherAlertCycleLock.findById(WEATHER_CYCLE_LOCK_ID).lean();
  assert.equal(released.status, "idle");
});

integration("repeated cycles produce no duplicate outbox jobs", async () => {
  await seedFarmers(2);
  const first = await runWeatherAlertCycle(cycleOptions());
  const second = await runWeatherAlertCycle(cycleOptions());

  assert.equal(first.queued, 2);
  assert.equal(second.queued, 0);
  assert.equal(second.duplicate, 2);
  assert.equal(await SmsOutbox.countDocuments({}), 2);
  // The cycle only enqueues; no delivery log is written until a worker runs.
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
});

function makeTimers() {
  let time = 0;
  let sequence = 0;
  const intervals = new Map();
  const timeouts = new Map();
  return {
    now: () => time,
    setInterval(fn, ms) {
      const id = ++sequence;
      intervals.set(id, { fn, ms });
      return { id, unref() {} };
    },
    clearInterval(handle) { intervals.delete(handle?.id ?? handle); },
    setTimeout(fn, ms) {
      const id = ++sequence;
      timeouts.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) { timeouts.delete(id); },
    advance(ms) { time += ms; },
    async flush() {
      const due = [...timeouts.values()];
      timeouts.clear();
      time += 50;
      for (const entry of due) entry.fn();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    },
    get intervalCount() { return intervals.size; },
  };
}

integration("scheduler starts only after MongoDB becomes ready and shuts down cleanly", async () => {
  await seedFarmers(1);
  const timers = makeTimers();
  let ready = false;
  let cycles = 0;
  const logs = { info: [], warn: [], error: [] };
  const logger = {
    info: (...args) => logs.info.push(args),
    warn: (...args) => logs.warn.push(args),
    error: (...args) => logs.error.push(args),
  };
  const scheduler = startWeatherAlertScheduler({
    enabled: true,
    intervalMs: 1000,
    timers,
    logger,
    isLive: () => false,
    getDbState: () => ({ readyState: ready ? 1 : 0 }),
    dbWaitTimeoutMs: 2000,
    runCycle: async () => {
      cycles += 1;
      return runWeatherAlertCycle(cycleOptions());
    },
  });
  assert.equal(scheduler.started, true);

  let settled = false;
  const firstTick = scheduler.tick().then(() => { settled = true; });
  await timers.flush();
  assert.equal(cycles, 0, "cycle must wait for MongoDB readiness");

  ready = true;
  for (let i = 0; i < 10 && !settled; i += 1) await timers.flush();
  await firstTick;
  assert.equal(cycles, 1);
  assert.equal(logs.info.length, 1);
  assert.equal(JSON.stringify(logs.info[0]).includes("+880"), false);

  await scheduler.stop();
  assert.equal(timers.intervalCount, 0);
});
