import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import {
  connectIsolatedTestDatabase,
  disconnectIsolatedTestDatabase,
} from "./helpers/isolatedMongo.js";
import { User } from "../src/models/user.model.js";
import { SmsPreferences } from "../src/models/smsPreferences.model.js";
import { SmsNotificationLog } from "../src/models/smsNotificationLog.model.js";
import { SmsQuotaReservation } from "../src/models/smsQuotaReservation.model.js";
import { SmsOutbox } from "../src/models/smsOutbox.model.js";
import { enqueueSmsAlert } from "../src/services/sms/smsOutbox.service.js";
import { processSmsOutboxBatch } from "../src/services/sms/smsOutboxWorker.service.js";
import { readSmsOutboxLiveConfig } from "../src/config/smsOutboxLive.config.js";
import { configureSmsGatewayFromEnv } from "../src/services/sms/configureSmsGateway.js";
import { sendSms, resetSmsGatewayForTests } from "../src/services/sms/smsSender.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";

/** REAL DB + MOCKED Alpha HTTP. BLOCKED without MONGODB_TEST_URI. */
const dbAvailable = Boolean(process.env.MONGODB_TEST_URI);
const BLOCKED = "BLOCKED: no isolated MongoDB test instance (set MONGODB_TEST_URI to a kb_test_ database)";
const integration = (name, fn) => test(name, { skip: dbAvailable ? false : BLOCKED }, fn);

const COLLECTIONS = [User, SmsPreferences, SmsNotificationLog, SmsQuotaReservation, SmsOutbox];
let databaseName = null;
const KEY = Buffer.from("abcdef0123456789abcdef0123456789", "utf8").toString("base64");
const NOW = new Date("2026-11-24T10:00:00.000Z");
const PHONE = "+8801712345678";
const TEXT = "KrishiBondhu TEST SMS only - not a real weather warning.";
const SOURCE = {
  smsProvider: "alpha_sms",
  smsLive: true,
  alphaSmsApiKey: "mock-alpha-key",
  alphaSmsEndpoint: "https://api.sms.net.bd/sendsms",
  alphaSmsSenderId: "",
};
const RAW = { SMS_LIVE: "1", SMS_OUTBOX_LIVE_ENABLED: "1" };

if (dbAvailable) {
  before(async () => {
    databaseName = await connectIsolatedTestDatabase("sms_outbox_live");
    await SmsOutbox.init();
  });
  beforeEach(async () => {
    await Promise.all(COLLECTIONS.map((model) => model.deleteMany({})));
    resetSmsGatewayForTests();
  });
  after(async () => {
    resetSmsGatewayForTests();
    if (databaseName) {
      await Promise.all(COLLECTIONS.map((model) => model.deleteMany({})));
      await disconnectIsolatedTestDatabase(databaseName);
    }
  });
}

async function seedFarmer({ consent = true, verified = true } = {}) {
  const user = await User.create({
    name: "Live Outbox Farmer",
    phone: PHONE,
    phoneVerifiedAt: verified ? "2026-11-20T10:00:00.000Z" : null,
    preferredDistrict: "cumilla",
    role: "farmer",
    passwordHash: "test-only-hash",
  });
  const prefs = toModelPatch(updateCategoryConsent(null, "weather", consent, { now: NOW }));
  const preferences = await SmsPreferences.create({
    userId: user._id, ...prefs, phoneLast4: "5678",
  });
  return { user: user.toObject(), preferences };
}

async function enqueue({ user, preferences, key = "weather:farmer:HEAVY_RAINFALL:2026-11-24", observedAt = NOW } = {}) {
  const result = await enqueueSmsAlert({
    user, preferences, category: "weather", text: TEXT, dedupeKey: key,
    now: NOW, encryptionKey: KEY,
    sourceObservedAt: observedAt.toISOString(), freshnessMaxAgeMs: 6 * 3_600_000,
  });
  assert.equal(result.enqueued, true);
  return result.outbox.id;
}

function mockFetch(result) {
  let calls = 0;
  let capturedBody = null;
  return {
    calls: () => calls,
    body: () => capturedBody,
    fetch: async (url, options) => {
      calls += 1;
      capturedBody = options.body;
      return result;
    },
  };
}

function runWorker(mockedFetch) {
  return processSmsOutboxBatch({
    now: NOW,
    model: SmsOutbox,
    userModel: User,
    preferencesModel: SmsPreferences,
    notificationLogModel: SmsNotificationLog,
    quotaModel: SmsQuotaReservation,
    envConfig: { smsOutboxEncryptionKey: KEY },
    encryptionKey: KEY,
    rawEnv: RAW,
    liveConfig: readSmsOutboxLiveConfig(RAW),
    configureGateway: () => configureSmsGatewayFromEnv({ source: SOURCE, fetchImpl: mockedFetch.fetch }),
    send: sendSms,
  });
}

integration("accepted Alpha submission => outbox submitted, log submitted, never delivered", async () => {
  const farmer = await seedFarmer();
  const jobId = await enqueue(farmer);
  const mock = mockFetch({
    ok: true, status: 200,
    text: async () => '{"error":0,"msg":"Request successfully submitted","data":{"request_id":9911}}',
  });
  const summary = await runWorker(mock);

  assert.equal(mock.calls(), 1);
  assert.equal(summary.liveSubmissions, 1);
  assert.equal(summary.dryRuns, 0);
  const job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.status, "submitted");
  assert.equal(job.deliveryConfirmed, false);
  assert.equal(job.providerStatus, "submitted");
  assert.equal(String(job.providerRequestId), "9911");
  const log = await SmsNotificationLog.findOne({ dedupeKey: { $regex: "^weather:" } }).lean();
  assert.equal(log.status, "submitted");
  assert.equal(log.metadata.deliveryConfirmed, false);
  assert.equal(JSON.stringify(log).includes(PHONE), false);
});

integration("ambiguous timeout is terminal; no retry and no duplicate submission", async () => {
  const farmer = await seedFarmer();
  const jobId = await enqueue(farmer);
  const mock = mockFetch({ fetch: async () => { const e = new Error("timeout"); e.name = "TimeoutError"; throw e; } });
  const summary = await runWorker(mock);

  assert.equal(summary.ambiguousSubmissions, 1);
  assert.equal(summary.retryScheduled, 0);
  const job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.status, "failed");
  assert.equal(job.nextAttemptAt, null);
  assert.equal(job.ambiguous, true);
  const logs = await SmsNotificationLog.find({}).lean();
  assert.equal(logs.length, 1, "one failed audit log is written, no duplicate submission");
  assert.equal(logs[0].status, "failed");
  assert.equal(logs[0].metadata.ambiguous, true);
  assert.equal(await SmsNotificationLog.countDocuments({ status: "submitted" }), 0);
  assert.equal(mock.calls(), 1);
});

integration("consent revoked before delivery cancels the job without provider call", async () => {
  const farmer = await seedFarmer();
  const stored = await SmsPreferences.findOne({ userId: farmer.user._id });
  stored.consent.revokedAt = new Date();
  await stored.save();
  const jobId = await enqueue(farmer);
  const mock = mockFetch({ ok: true, status: 200, text: async () => '{"error":0,"data":{"request_id":1}}' });
  const summary = await runWorker(mock);

  assert.equal(mock.calls(), 0);
  assert.equal(summary.cancelled, 1);
  assert.equal((await SmsOutbox.findById(jobId).lean()).status, "cancelled");
});

integration("stale alert is cancelled at delivery; terminal dry_run never revived", async () => {
  const farmer = await seedFarmer();
  const staleId = await enqueue({
    ...farmer,
    observedAt: new Date(NOW.getTime() - 40 * 86_400_000),
    key: "weather:stale",
  });
  const mock = mockFetch({ ok: true, status: 200, text: async () => '{"error":0,"data":{"request_id":1}}' });
  await runWorker(mock);
  assert.equal((await SmsOutbox.findById(staleId).lean()).status, "cancelled");
  assert.equal(mock.calls(), 0);
});

integration("two concurrent workers cannot submit the same job twice", async () => {
  const farmer = await seedFarmer();
  const jobId = await enqueue(farmer);
  const mock = mockFetch({
    ok: true, status: 200,
    text: async () => '{"error":0,"data":{"request_id":77}}',
  });
  await Promise.all([runWorker(mock), runWorker(mock)]);
  assert.equal(mock.calls(), 1);
  assert.equal((await SmsOutbox.findById(jobId).lean()).status, "submitted");
  assert.equal(await SmsNotificationLog.countDocuments({}), 1);
});

integration("gate refuses live when a scheduler flag is active", async () => {
  const farmer = await seedFarmer();
  await enqueue(farmer);
  const mock = mockFetch({ ok: true, status: 200, text: async () => '{"error":0,"data":{"request_id":1}}' });
  const blocked = await processSmsOutboxBatch({
    now: NOW,
    model: SmsOutbox,
    userModel: User,
    preferencesModel: SmsPreferences,
    notificationLogModel: SmsNotificationLog,
    quotaModel: SmsQuotaReservation,
    envConfig: { smsOutboxEncryptionKey: KEY },
    encryptionKey: KEY,
    rawEnv: { ...RAW, WEATHER_ALERT_SCHEDULER_ENABLED: "1" },
    configureGateway: () => configureSmsGatewayFromEnv({ source: SOURCE, fetchImpl: mock.fetch }),
    send: sendSms,
  });
  assert.equal(blocked.refused, true);
  assert.equal(mock.calls(), 0);
  assert.equal(await SmsOutbox.countDocuments({ status: "submitted" }), 0);
});
