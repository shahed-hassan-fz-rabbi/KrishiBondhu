import test from "node:test";
import assert from "node:assert/strict";

import {
  encryptOutboxMessage,
  decryptOutboxMessage,
  verifyOutboxMessageIntegrity,
  isOutboxEncryptionConfigured,
  encryptionRequirement,
  MESSAGE_ALGORITHM,
} from "../src/services/sms/smsOutboxCrypto.service.js";
import { enqueueSmsAlert } from "../src/services/sms/smsOutbox.service.js";
import { applySmsRetention, TERMINAL_OUTBOX_STATUSES } from "../src/services/sms/smsOutboxRetention.service.js";
import { checkLiveTestGuards } from "../src/jobs/sms-live-test.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";

const KEY = Buffer.from("0123456789abcdef0123456789abcdef", "utf8").toString("base64");
const NOW = new Date("2026-11-24T10:00:00.000Z");
const USER = {
  _id: "farmer-1", phone: "+8801712345678",
  phoneVerifiedAt: "2026-11-20T10:00:00.000Z",
};
const PREFS = toModelPatch(updateCategoryConsent(null, "weather", true, { now: NOW }));
const MESSAGE = "কুমিল্লা: ভারী বৃষ্টি সতর্কতা। কৃষিবন্ধু।";

function fakeOutbox() {
  const docs = [];
  return {
    docs,
    async create(doc) { const saved = { ...doc, _id: `job-${docs.length + 1}` }; docs.push(saved); return saved; },
  };
}

test("AES-256-GCM round trip, tamper detection and fail-closed key handling", () => {
  assert.equal(isOutboxEncryptionConfigured({ smsOutboxEncryptionKey: KEY }), true);
  assert.equal(isOutboxEncryptionConfigured({ smsOutboxEncryptionKey: "short" }), false);
  const cipher = encryptOutboxMessage(MESSAGE, { key: KEY });
  assert.ok(cipher.startsWith("enc:v1:"));
  assert.equal(cipher.includes(MESSAGE), false, "plaintext must not appear in storage");
  assert.equal(decryptOutboxMessage(cipher, { key: KEY }), MESSAGE);
  assert.equal(verifyOutboxMessageIntegrity(cipher, MESSAGE, { key: KEY }), true);
  const tamperedParts = cipher.split(":");
  tamperedParts[4] = (tamperedParts[4][0] === "A" ? "B" : "A") + tamperedParts[4].slice(1);
  assert.equal(verifyOutboxMessageIntegrity(tamperedParts.join(":"), MESSAGE, { key: KEY }), false);
  assert.throws(() => decryptOutboxMessage("plain text", { key: KEY }), /legacy_plaintext_not_decrypted/);
  assert.throws(() => encryptOutboxMessage(MESSAGE, { key: "" }), /missing or invalid/);
  assert.deepEqual(encryptionRequirement({ envConfig: { smsLive: true }, requireEncryption: true }), { ok: false, reason: "ENCRYPTION_NOT_CONFIGURED" });
});

test("enqueue encrypts content and refuses missing key when encryption is required", async () => {
  const model = fakeOutbox();
  const result = await enqueueSmsAlert({
    user: USER, preferences: PREFS, category: "weather", text: MESSAGE,
    dedupeKey: "weather:farmer-1:cumilla:HEAVY_RAINFALL:2026-11-24",
    now: NOW, model, encryptionKey: KEY,
    sourceObservedAt: NOW.toISOString(), freshnessMaxAgeMs: 6 * 3_600_000,
  });
  assert.equal(result.enqueued, true);
  assert.equal(model.docs[0].messageProtected, true);
  assert.equal(model.docs[0].messageAlgorithm, MESSAGE_ALGORITHM);
  assert.equal(model.docs[0].message.includes(MESSAGE), false);
  assert.equal(decryptOutboxMessage(model.docs[0].message, { key: KEY }), MESSAGE);
  assert.equal(model.docs[0].expiresAt.getTime(), NOW.getTime() + 6 * 3_600_000);

  const refused = await enqueueSmsAlert({
    user: USER, preferences: PREFS, category: "weather", text: MESSAGE,
    dedupeKey: "weather:farmer-1:other", now: NOW, model: fakeOutbox(), requireEncryption: true,
  });
  assert.equal(refused.reason, "ENCRYPTION_NOT_CONFIGURED");
});

test("retention expires only terminal jobs and dry-run logs", async () => {
  const old = new Date(NOW.getTime() - 40 * 86_400_000);
  const fresh = NOW;
  const jobs = [
    { _id: "1", status: "dry_run", createdAt: old },
    { _id: "2", status: "cancelled", createdAt: old },
    { _id: "3", status: "pending", createdAt: old },
    { _id: "4", status: "processing", createdAt: old },
    { _id: "5", status: "dry_run", createdAt: fresh },
  ];
  const logs = [
    { _id: "l1", status: "dry_run", createdAt: old },
    { _id: "l2", status: "dry_run", createdAt: fresh },
  ];
  const model = {
    countDocuments: async (f) => jobs.filter((j) => f.status.$in.includes(j.status) && j.createdAt < f.createdAt.$lt).length,
    deleteMany: async (f) => {
      const keep = jobs.filter((j) => !(f.status.$in.includes(j.status) && j.createdAt < f.createdAt.$lt));
      const removed = jobs.length - keep.length;
      jobs.length = 0; jobs.push(...keep);
      return { deletedCount: removed };
    },
  };
  const logModel = {
    countDocuments: async (f) => logs.filter((l) => l.createdAt < f.createdAt.$lt).length,
    deleteMany: async (f) => {
      const keep = logs.filter((l) => !(l.createdAt < f.createdAt.$lt));
      const removed = logs.length - keep.length;
      logs.length = 0; logs.push(...keep);
      return { deletedCount: removed };
    },
  };
  const dry = await applySmsRetention({ model, logModel, now: NOW, retentionDays: 30, apply: false });
  assert.equal(dry.jobsEligible, 2);
  assert.equal(jobs.length, 5);
  const applied = await applySmsRetention({ model, logModel, now: NOW, retentionDays: 30, apply: true });
  assert.equal(applied.jobsDeleted, 2);
  assert.equal(applied.logsDeleted, 1);
  assert.deepEqual(jobs.map((j) => j._id), ["3", "4", "5"], "pending/processing must never be expired");
  assert.deepEqual(TERMINAL_OUTBOX_STATUSES.includes("pending"), false);
});

test("live test command refuses every unsafe condition", () => {
  const base = {
    source: { smsLiveTestEnabled: true, smsLive: true, smsLiveTestAllowedNumbers: "+8801712345678", smsOutboxEncryptionKey: KEY },
    rawEnv: { MONGODB_TEST_URI: "mongodb://x/kb_test_live", SMS_LIVE: "1" },
    number: "+8801712345678", apply: true, now: NOW,
  };
  assert.equal(checkLiveTestGuards(base).ok, true);
  assert.ok(checkLiveTestGuards({ ...base, apply: false }).reasons.includes("MISSING_APPLY_FLAG"));
  assert.ok(checkLiveTestGuards({ ...base, source: { ...base.source, smsLive: false }, rawEnv: {} }).reasons.includes("LIVE_NOT_ENABLED"));
  assert.ok(checkLiveTestGuards({ ...base, rawEnv: { ...base.rawEnv, WEATHER_ALERT_SCHEDULER_ENABLED: "1" } }).reasons.some((r) => r.startsWith("SCHEDULER_ACTIVE")));
  assert.ok(checkLiveTestGuards({ ...base, number: "+8801712999999" }).reasons.includes("NUMBER_NOT_ALLOWLISTED"));
  assert.ok(checkLiveTestGuards({ ...base, rawEnv: {} }).reasons.includes("NO_TEST_DATABASE"));
});
