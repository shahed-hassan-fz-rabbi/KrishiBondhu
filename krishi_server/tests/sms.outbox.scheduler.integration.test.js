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
import { enqueueSmsAlert } from "../src/services/sms/smsOutbox.service.js";
import { processSmsOutboxBatch } from "../src/services/sms/smsOutboxWorker.service.js";
import { startSmsOutboxScheduler } from "../src/services/sms/smsOutboxScheduler.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";

/** REAL database-backed outbox scheduler verification. BLOCKED without URI. */
const dbAvailable = Boolean(process.env.MONGODB_TEST_URI);
const BLOCKED = "BLOCKED: no isolated MongoDB test instance (set MONGODB_TEST_URI to a kb_test_ database)";
const integration = (name, fn) => test(name, { skip: dbAvailable ? false : BLOCKED }, fn);

const COLLECTIONS = [User, SmsPreferences, SmsOutbox, SmsNotificationLog];
let databaseName = null;

if (dbAvailable) {
  before(async () => {
    databaseName = await connectIsolatedTestDatabase("sms_outbox_scheduler");
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
      timeouts.set(id, { fn, ms, cancelled: false });
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

async function seedJob({ consent = true, key = "weather:farmer-1:cumilla:HEAVY_RAINFALL:2026-11-25" } = {}) {
  const user = await User.create({
    name: "Outbox Scheduler Farmer",
    phone: "+8801712345678",
    phoneVerifiedAt: "2026-11-20T10:00:00.000Z",
    preferredDistrict: "cumilla",
    role: "farmer",
    passwordHash: "integration-only-hash",
  });
  const prefs = toModelPatch(updateCategoryConsent(null, "weather", consent, { now: new Date() }));
  const preferences = await SmsPreferences.create({
    userId: user._id, ...prefs, phoneLast4: "5678",
  });
  const enqueued = await enqueueSmsAlert({
    user: user.toObject(), preferences, category: "weather",
    text: "কুমিল্লা: ভারী বৃষ্টি সতর্কতা। কৃষিবন্ধু।", dedupeKey: key, now: new Date(),
  });
  assert.equal(enqueued.enqueued, true);
  return { user, preferences, jobId: enqueued.outbox.id };
}

function startScheduler(extra = {}) {
  const timers = makeTimers();
  const logger = makeLogger();
  const scheduler = startSmsOutboxScheduler({
    enabled: true,
    intervalMs: 1000,
    timers,
    logger,
    isLive: () => false,
    getDbState: () => ({ readyState: 1 }),
    ...extra,
  });
  return { scheduler, timers, logger };
}

async function runTick(scheduler, timers) {
  let done = false;
  const promise = scheduler.tick().then((value) => { done = true; return value; });
  for (let i = 0; i < 10 && !done; i += 1) await timers.flush();
  await promise;
}

integration("enabled scheduler processes a pending job as dry_run", async () => {
  const { jobId } = await seedJob();
  const { scheduler, timers, logger } = startScheduler();
  await runTick(scheduler, timers);

  const job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.status, "dry_run");
  assert.equal(job.dryRunProvider, "dry-run");
  assert.equal(job.submittedAt, null);
  const logs = await SmsNotificationLog.find({}).lean();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, "dry_run");
  assert.equal(logs[0].mode, "dry_run");
  const logged = JSON.stringify(logger.logs.info[0]);
  assert.ok(logged.includes('"dryRun":1'));
  assert.equal(logged.includes("+880"), false);
  await scheduler.stop();
});

integration("retry timing is respected: a future nextAttemptAt is not processed", async () => {
  const { jobId } = await seedJob({ key: "weather:farmer-1:cumilla:HEAVY_RAINFALL:retry" });
  const future = new Date(Date.now() + 3_600_000);
  await SmsOutbox.updateOne({ _id: jobId }, { $set: { nextAttemptAt: future } });

  const { scheduler, timers } = startScheduler();
  await runTick(scheduler, timers);
  assert.equal((await SmsOutbox.findById(jobId).lean()).status, "pending");

  await SmsOutbox.updateOne(
    { _id: jobId },
    { $set: { nextAttemptAt: new Date(Date.now() - 1000) } }
  );
  await runTick(scheduler, timers);
  assert.equal((await SmsOutbox.findById(jobId).lean()).status, "dry_run");
  await scheduler.stop();
});

integration("concurrent scheduler and worker never duplicate a job", async () => {
  const { jobId } = await seedJob({ key: "weather:farmer-1:cumilla:HEAVY_RAINFALL:concurrent" });
  const { scheduler, timers } = startScheduler();

  const ticking = scheduler.tick();
  const direct = processSmsOutboxBatch({ leaseOwner: "separate-instance" });
  await timers.flush();
  await Promise.all([ticking, direct]);

  // The atomic claim means exactly one of the two callers processes the job.
  assert.equal((await SmsOutbox.findById(jobId).lean()).status, "dry_run");
  assert.equal(await SmsNotificationLog.countDocuments({}), 1);
  await scheduler.stop();
});

integration("consent revoked before processing cancels the job safely", async () => {
  const { preferences, jobId } = await seedJob({ key: "weather:farmer-1:cumilla:HEAVY_RAINFALL:revoked" });
  preferences.consent.revokedAt = new Date();
  await preferences.save();

  const { scheduler, timers } = startScheduler();
  await runTick(scheduler, timers);
  const job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.status, "cancelled");
  assert.equal(job.failureCategory, "permanent");
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
  await scheduler.stop();
});

integration("no batch runs before MongoDB is ready", async () => {
  const { jobId } = await seedJob({ key: "weather:farmer-1:cumilla:HEAVY_RAINFALL:notready" });
  let ready = false;
  const { scheduler, timers } = startScheduler({
    getDbState: () => ({ readyState: ready ? 1 : 0 }),
    dbWaitTimeoutMs: 2000,
  });

  let done = false;
  const ticking = scheduler.tick().then(() => { done = true; });
  await timers.flush();
  assert.equal((await SmsOutbox.findById(jobId).lean()).status, "pending");

  ready = true;
  for (let i = 0; i < 10 && !done; i += 1) await timers.flush();
  await ticking;
  assert.equal((await SmsOutbox.findById(jobId).lean()).status, "dry_run");
  await scheduler.stop();
});

integration("shutdown clears the timer and waits for an in-flight batch", async () => {
  await seedJob({ key: "weather:farmer-1:cumilla:HEAVY_RAINFALL:shutdown" });
  const { scheduler, timers } = startScheduler();
  const ticking = scheduler.tick();
  await timers.flush();

  const stopping = scheduler.stop();
  await stopping;
  await ticking;
  assert.equal(timers.intervalCount, 0);
  assert.equal((await SmsOutbox.findOne({}).lean()).status, "dry_run");
});
