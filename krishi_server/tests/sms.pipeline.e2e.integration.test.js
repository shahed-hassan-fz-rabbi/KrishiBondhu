import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import {
  connectIsolatedTestDatabase,
  disconnectIsolatedTestDatabase,
} from "./helpers/isolatedMongo.js";
import { User } from "../src/models/user.model.js";
import { SmsPreferences } from "../src/models/smsPreferences.model.js";
import { SmsOutbox } from "../src/models/smsOutbox.model.js";
import { SmsNotificationLog } from "../src/models/smsNotificationLog.model.js";
import { WeatherAlertCycleLock } from "../src/models/weatherAlertCycleLock.model.js";
import { startWeatherAlertScheduler } from "../src/services/sms/weatherAlertScheduler.service.js";
import { startSmsOutboxScheduler } from "../src/services/sms/smsOutboxScheduler.service.js";
import { runWeatherAlertCycle } from "../src/services/sms/weatherAlertCycle.service.js";
import { processSmsOutboxBatch } from "../src/services/sms/smsOutboxWorker.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";
import { WEATHER_SOURCE } from "../src/services/sms/weatherAlertEngine.js";

/**
 * END-TO-END database-backed pipeline verification:
 * Weather Scheduler -> Weather Alert Engine -> SMS Outbox -> Outbox Scheduler
 * -> Dry-Run Worker. BLOCKED unless MONGODB_TEST_URI is a kb_test_ database.
 *
 * Both schedulers are enabled only here, inside the controlled test process.
 * Weather is a deterministic injected forecast; no external API is contacted.
 */
const dbAvailable = Boolean(process.env.MONGODB_TEST_URI);
const BLOCKED = "BLOCKED: no isolated MongoDB test instance (set MONGODB_TEST_URI to a kb_test_ database)";
const e2e = (name, fn) => test(name, { skip: dbAvailable ? false : BLOCKED }, fn);

const COLLECTIONS = [User, SmsPreferences, SmsOutbox, SmsNotificationLog, WeatherAlertCycleLock];
let databaseName = null;

if (dbAvailable) {
  before(async () => {
    databaseName = await connectIsolatedTestDatabase("sms_pipeline_e2e");
    await SmsOutbox.init();
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

function makeLogger() {
  const logs = { info: [], warn: [], error: [] };
  return {
    logs,
    info: (...args) => logs.info.push(args),
    warn: (...args) => logs.warn.push(args),
    error: (...args) => logs.error.push(args),
  };
}

function deterministicForecast() {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return {
    location: { nameEn: "Cumilla" },
    shortRangeForecast: [{ dayIndex: 1, date: tomorrow, precipitationSumMm: 90, weatherCode: 1 }],
    meta: {
      provider: WEATHER_SOURCE,
      dataStatus: "AVAILABLE",
      fetchTimestamp: new Date().toISOString(),
    },
  };
}

async function seedFarmer(id, { consent = true, verified = true } = {}) {
  const phone = `+88017100000${String(id).replace(/\D/g, "").padStart(2, "0")}`;
  const user = await User.create({
    name: `Pipeline Farmer ${id}`,
    phone,
    phoneVerifiedAt: verified ? new Date(Date.now() - 86_400_000) : null,
    preferredDistrict: "cumilla",
    role: "farmer",
    passwordHash: "integration-only-hash",
  });
  const prefs = toModelPatch(updateCategoryConsent(null, "weather", consent, { now: new Date() }));
  const preferences = await SmsPreferences.create({
    userId: user._id, ...prefs, phoneLast4: phone.slice(-4),
  });
  return { user, preferences, phone };
}

function buildPipeline() {
  const weatherTimers = makeTimers();
  const outboxTimers = makeTimers();
  const weatherLogger = makeLogger();
  const outboxLogger = makeLogger();
  let isLiveChecks = 0;
  const isLive = () => { isLiveChecks += 1; return false; };
  const ready = () => ({ readyState: 1 });

  const weather = startWeatherAlertScheduler({
    enabled: true,
    intervalMs: 60_000,
    timers: weatherTimers,
    logger: weatherLogger,
    isLive,
    getDbState: ready,
    runCycle: () => runWeatherAlertCycle({
      userModel: User,
      preferencesModel: SmsPreferences,
      lockModel: WeatherAlertCycleLock,
      getForecast: async () => deterministicForecast(),
      now: new Date(),
      logger: weatherLogger,
    }),
  });

  const outbox = startSmsOutboxScheduler({
    enabled: true,
    intervalMs: 60_000,
    timers: outboxTimers,
    logger: outboxLogger,
    isLive,
    getDbState: ready,
    runBatch: (options) => processSmsOutboxBatch(options),
  });

  return {
    weather, outbox, weatherTimers, outboxTimers, weatherLogger, outboxLogger,
    isLiveChecks: () => isLiveChecks,
    stop: async () => { await weather.stop(); await outbox.stop(); },
  };
}

async function tick(scheduler, timers) {
  let done = false;
  const promise = scheduler.tick().then((value) => { done = true; return value; });
  for (let i = 0; i < 10 && !done; i += 1) await timers.flush();
  await promise;
}

e2e("controlled process runs dry-run only (SMS_LIVE is never 1)", async () => {
  assert.notEqual(String(process.env.SMS_LIVE || ""), "1", "E2E must never run in live mode");
  const pipeline = buildPipeline();
  assert.equal(pipeline.weather.started, true);
  assert.equal(pipeline.outbox.started, true);
  await pipeline.stop();
});

e2e("full pipeline: pending outbox jobs become dry_run, never submitted", async () => {
  await seedFarmer(1);
  await seedFarmer(2);
  const pipeline = buildPipeline();

  await tick(pipeline.weather, pipeline.weatherTimers);
  let jobs = await SmsOutbox.find({}).lean();
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((job) => job.status === "pending"));
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);

  await tick(pipeline.outbox, pipeline.outboxTimers);
  jobs = await SmsOutbox.find({}).lean();
  assert.ok(jobs.every((job) => job.status === "dry_run"));
  assert.ok(jobs.every((job) => job.submittedAt === null && job.dryRunProvider === "dry-run"));
  const logs = await SmsNotificationLog.find({}).lean();
  assert.equal(logs.length, 2);
  assert.ok(logs.every((log) => log.status === "dry_run" && log.mode === "dry_run" && log.providerMessageId === null));
  assert.deepEqual(await SmsNotificationLog.distinct("status"), ["dry_run"]);

  const logged = JSON.stringify(pipeline.weatherLogger.logs.info) + JSON.stringify(pipeline.outboxLogger.logs.info);
  assert.equal(logged.includes("+880"), false);
  assert.ok(pipeline.isLiveChecks() >= 2, "live-mode guard must be checked at startup and on ticks");
  await pipeline.stop();
});

e2e("two farmers in one district get separate simulated alerts", async () => {
  await seedFarmer(1);
  await seedFarmer(2);
  const pipeline = buildPipeline();
  await tick(pipeline.weather, pipeline.weatherTimers);
  await tick(pipeline.outbox, pipeline.outboxTimers);

  const jobs = await SmsOutbox.find({}).lean();
  assert.equal(jobs.length, 2);
  assert.equal(new Set(jobs.map((job) => job.dedupeKey)).size, 2);
  assert.equal(new Set(jobs.map((job) => job.userId.toString())).size, 2);
  assert.equal(await SmsNotificationLog.countDocuments({}), 2);
  await pipeline.stop();
});

e2e("repeated cycles never duplicate jobs or delivery logs", async () => {
  await seedFarmer(1);
  await seedFarmer(2);
  const pipeline = buildPipeline();

  await tick(pipeline.weather, pipeline.weatherTimers);
  await tick(pipeline.outbox, pipeline.outboxTimers);
  await tick(pipeline.weather, pipeline.weatherTimers);
  await tick(pipeline.outbox, pipeline.outboxTimers);

  assert.equal(await SmsOutbox.countDocuments({}), 2);
  assert.equal(await SmsNotificationLog.countDocuments({}), 2);
  await pipeline.stop();
});

e2e("revoked consent blocks both enqueue and processing", async () => {
  const { preferences } = await seedFarmer(1, { consent: false });
  preferences.consent.revokedAt = new Date();
  await preferences.save();

  const pipeline = buildPipeline();
  await tick(pipeline.weather, pipeline.weatherTimers);
  await tick(pipeline.outbox, pipeline.outboxTimers);

  assert.equal(await SmsOutbox.countDocuments({}), 0);
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
  await pipeline.stop();
});

e2e("a retry is processed only after nextAttemptAt", async () => {
  await seedFarmer(1);
  const pipeline = buildPipeline();
  await tick(pipeline.weather, pipeline.weatherTimers);
  const jobId = (await SmsOutbox.findOne({}))._id;

  await SmsOutbox.updateOne({ _id: jobId }, { $set: { nextAttemptAt: new Date(Date.now() + 3_600_000) } });
  await tick(pipeline.outbox, pipeline.outboxTimers);
  assert.equal((await SmsOutbox.findById(jobId).lean()).status, "pending");
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);

  await SmsOutbox.updateOne({ _id: jobId }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
  await tick(pipeline.outbox, pipeline.outboxTimers);
  assert.equal((await SmsOutbox.findById(jobId).lean()).status, "dry_run");
  assert.equal(await SmsNotificationLog.countDocuments({}), 1);
  await pipeline.stop();
});

e2e("multiple workers cannot claim the same job", async () => {
  await seedFarmer(1);
  const pipeline = buildPipeline();
  await tick(pipeline.weather, pipeline.weatherTimers);

  const scheduled = pipeline.outbox.tick();
  const independent = processSmsOutboxBatch({ leaseOwner: "second-instance" });
  await pipeline.outboxTimers.flush();
  await Promise.all([scheduled, independent]);

  assert.equal((await SmsOutbox.findOne({}).lean()).status, "dry_run");
  assert.equal((await SmsNotificationLog.find({}).lean()).length, 1);
  await pipeline.stop();
});

e2e("shutdown clears both schedulers' timers and awaits in-flight work", async () => {
  await seedFarmer(1);
  const pipeline = buildPipeline();
  await tick(pipeline.weather, pipeline.weatherTimers);
  assert.equal((await SmsOutbox.findOne({}).lean()).status, "pending");

  const outboxTick = pipeline.outbox.tick();
  await pipeline.outboxTimers.flush();
  await pipeline.stop(); // stop while the outbox batch may still be in flight
  await outboxTick;

  assert.equal(pipeline.weatherTimers.intervalCount, 0);
  assert.equal(pipeline.outboxTimers.intervalCount, 0);
  assert.equal((await SmsOutbox.findOne({}).lean()).status, "dry_run");
});
