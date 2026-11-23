import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import {
  connectIsolatedTestDatabase,
  disconnectIsolatedTestDatabase,
} from "./helpers/isolatedMongo.js";
import { SmsOutbox } from "../src/models/smsOutbox.model.js";
import { SmsNotificationLog } from "../src/models/smsNotificationLog.model.js";
import { SmsQuotaReservation } from "../src/models/smsQuotaReservation.model.js";
import { enqueueSmsAlert } from "../src/services/sms/smsOutbox.service.js";
import { decryptOutboxMessage, MESSAGE_ALGORITHM } from "../src/services/sms/smsOutboxCrypto.service.js";
import { migrateOutboxEncryption } from "../src/jobs/migrate-outbox-encryption.js";
import { applySmsRetention } from "../src/services/sms/smsOutboxRetention.service.js";
import { reserveSmsQuota } from "../src/services/sms/smsOutboxQuota.service.js";
import { runSmsLiveTest, checkLiveTestGuards } from "../src/jobs/sms-live-test.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";

/** REAL DB hardening verification. BLOCKED without MONGODB_TEST_URI. */
const dbAvailable = Boolean(process.env.MONGODB_TEST_URI);
const BLOCKED = "BLOCKED: no isolated MongoDB test instance (set MONGODB_TEST_URI to a kb_test_ database)";
const integration = (name, fn) => test(name, { skip: dbAvailable ? false : BLOCKED }, fn);

const COLLECTIONS = [SmsOutbox, SmsNotificationLog, SmsQuotaReservation];
let databaseName = null;
const KEY = Buffer.from("abcdef0123456789abcdef0123456789", "utf8").toString("base64");
const NOW = new Date("2026-11-24T10:00:00.000Z");
const MESSAGE = "কুমিল্লা: ভারী বৃষ্টি সতর্কতা। কৃষিবন্ধু।";
const USER = { _id: "507f1f77bcf86cd799439011", phone: "+8801712345678", phoneVerifiedAt: "2026-11-20T10:00:00.000Z" };
const PREFS = toModelPatch(updateCategoryConsent(null, "weather", true, { now: NOW }));

if (dbAvailable) {
  before(async () => {
    databaseName = await connectIsolatedTestDatabase("sms_hardening");
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

integration("message content is encrypted at rest in MongoDB", async () => {
  const result = await enqueueSmsAlert({
    user: USER, preferences: PREFS, category: "weather", text: MESSAGE,
    dedupeKey: "weather:farmer-1:cumilla:HEAVY_RAINFALL:2026-11-24",
    now: NOW, encryptionKey: KEY,
  });
  assert.equal(result.enqueued, true);

  const stored = await SmsOutbox.findById(result.outbox.id).select("+message").lean();
  assert.equal(stored.messageProtected, true);
  assert.equal(stored.messageAlgorithm, MESSAGE_ALGORITHM);
  assert.equal(stored.message.includes(MESSAGE), false);
  assert.equal(decryptOutboxMessage(stored.message, { key: KEY }), MESSAGE);

  const defaultRead = await SmsOutbox.findById(result.outbox.id).lean();
  assert.equal(defaultRead.message, undefined, "default reads never return message content");
});

integration("legacy plaintext is migrated in place without deletion", async () => {
  const legacy = await SmsOutbox.create({
    userId: USER._id, category: "weather", dedupeKey: "legacy:1",
    message: MESSAGE, messageRef: "legacy-ref", messageProtected: false, status: "pending", parts: 1,
  });
  const preview = await migrateOutboxEncryption({ key: KEY, apply: false });
  assert.equal(preview.scanned, 1);
  assert.equal(preview.encrypted, 1);
  assert.equal((await SmsOutbox.findById(legacy._id)).messageProtected, false);

  const applied = await migrateOutboxEncryption({ key: KEY, apply: true });
  assert.equal(applied.encrypted, 1);
  const migrated = await SmsOutbox.findById(legacy._id).select("+message").lean();
  assert.equal(migrated.messageProtected, true);
  assert.equal(decryptOutboxMessage(migrated.message, { key: KEY }), MESSAGE);
  assert.equal(await SmsOutbox.countDocuments({}), 1, "no records deleted");
});

integration("retention removes only terminal jobs and aged logs", async () => {
  const old = new Date(NOW.getTime() - 40 * 86_400_000);
  await SmsOutbox.create([
    { userId: USER._id, category: "weather", dedupeKey: "old-dry", messageRef: "r1", status: "dry_run", createdAt: old },
    { userId: USER._id, category: "weather", dedupeKey: "old-pending", messageRef: "r2", status: "pending", createdAt: old },
    { userId: USER._id, category: "weather", dedupeKey: "old-processing", messageRef: "r3", status: "processing", createdAt: old },
  ]);
  await SmsNotificationLog.create([
    { category: "weather", status: "dry_run", phoneLast4: "5678", occurredAt: old, createdAt: old },
    { category: "weather", status: "dry_run", phoneLast4: "5678", occurredAt: NOW, createdAt: NOW },
  ]);
  const report = await applySmsRetention({ now: NOW, retentionDays: 30, apply: true });
  assert.equal(report.jobsDeleted, 1);
  assert.equal(report.logsDeleted, 1);
  assert.deepEqual(await SmsOutbox.distinct("status"), ["pending", "processing"]);
});

integration("concurrent quota reservations never exceed the limit", async () => {
  const results = await Promise.all(Array.from({ length: 12 }, () => reserveSmsQuota({
    userId: USER._id, day: NOW.toISOString().slice(0, 10),
    farmerLimit: 3, globalLimit: 200, model: SmsQuotaReservation,
  })));
  assert.equal(results.filter((r) => r.allowed).length, 3);
  assert.equal(results.filter((r) => r.reason === "FARMER_DAILY_LIMIT").length, 9);
  const row = await SmsQuotaReservation.findOne({ _id: `farmer:${USER._id}:${NOW.toISOString().slice(0, 10)}` }).lean();
  assert.equal(row.count, 3);
});

integration("single-recipient test command refuses to act without full guard set", async () => {
  const guards = {
    source: {
      smsLiveTestEnabled: true, smsLive: true,
      smsLiveTestAllowedNumbers: "+8801712345678",
      smsOutboxEncryptionKey: KEY,
    },
    rawEnv: { ...process.env, SMS_LIVE: "1", MONGODB_TEST_URI: process.env.MONGODB_TEST_URI },
    number: "+8801712345678", now: NOW,
  };
  assert.equal(checkLiveTestGuards({ ...guards, apply: true }).ok, true);
  const dry = await runSmsLiveTest({ ...guards, apply: false, userId: USER._id, text: MESSAGE, connect: async () => {} });
  assert.equal(dry.attempted, false);
  assert.ok(dry.reasons.includes("MISSING_APPLY_FLAG"));

  const noConsent = await runSmsLiveTest({
    ...guards, apply: true, userId: "missing-user", text: MESSAGE, connect: async () => {},
  });
  assert.equal(noConsent.attempted, false);
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
});
