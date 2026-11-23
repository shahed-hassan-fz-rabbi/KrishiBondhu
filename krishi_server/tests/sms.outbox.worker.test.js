import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertDryRunOnly,
  claimNextOutboxJob,
  processSmsOutboxBatch,
} from "../src/services/sms/smsOutboxWorker.service.js";
import { outboxMessageRef } from "../src/models/smsOutbox.model.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";

const NOW = new Date("2026-11-24T10:00:00.000Z");
const TEXT = "Cumilla: Rice দাম বেড়েছে ১২ টাকা/কেজি। কৃষিবন্ধু।";
const KEY = "market:farmer-1:rice:2026-11-23";

function consentingUser(overrides = {}) {
  return {
    _id: "farmer-1",
    phone: "+8801712345678",
    phoneVerifiedAt: "2026-11-20T10:00:00.000Z",
    role: "farmer",
    preferredDistrict: "cumilla",
    ...overrides,
  };
}
const PREFERENCES = toModelPatch(updateCategoryConsent(null, "market", true, { now: NOW }));

function job(overrides = {}) {
  return {
    _id: "job-1",
    userId: "farmer-1",
    category: "market",
    dedupeKey: KEY,
    message: TEXT,
    messageRef: outboxMessageRef({ dedupeKey: KEY, text: TEXT }),
    parts: 1,
    attempts: 0,
    phoneLast4: "5678",
    status: "pending",
    leaseOwner: null,
    leaseExpiresAt: null,
    ...overrides,
  };
}

function leanQuery(value) {
  return { select() { return this; }, lean() { return Promise.resolve(value); } };
}

function fakeOutboxModel(items = []) {
  const store = items.map((item) => ({ ...item }));
  const calls = [];
  return {
    store,
    calls,
    async findOneAndUpdate(filter, update, options = {}) {
      calls.push({ filter, update, options });
      const index = store.findIndex((item) => matches(item, filter));
      if (index < 0) return null;
      const updated = { ...store[index], ...(update.$set || {}) };
      for (const [key, value] of Object.entries(update.$inc || {})) {
        updated[key] = (updated[key] || 0) + value;
      }
      store[index] = updated;
      return options.new ? { ...updated } : { ...updated };
    },
  };
}

function matches(item, filter) {
  if (filter.$or) {
    return filter.$or.some((branch) => matches(item, branch));
  }
  return Object.entries(filter).every(([key, expected]) => {
    if (expected && typeof expected === "object" && "$lte" in expected) {
      return item[key] != null && new Date(item[key]) <= new Date(expected.$lte);
    }
    return String(item[key]) === String(expected);
  });
}

function fakeModels({ user = consentingUser(), preferences = PREFERENCES, userThrows = false } = {}) {
  return {
    userModel: {
      findById() {
        return {
          select() { return this; },
          lean() { return userThrows ? Promise.reject(new Error("db down")) : Promise.resolve(user ? { ...user } : null); },
        };
      },
    },
    preferencesModel: {
      findOne() { return leanQuery(preferences ? { ...preferences } : null); },
    },
    notificationLogModel: {
      entries: [],
      async create(entry) { this.entries.push(entry); return entry; },
    },
  };
}

test("dry-run guard refuses every live configuration", () => {
  assert.equal(assertDryRunOnly({ rawEnv: {}, envConfig: { smsLive: false }, liveEnabled: false }).ok, true);
  assert.equal(assertDryRunOnly({ rawEnv: { SMS_LIVE: "1" }, envConfig: { smsLive: false }, liveEnabled: false }).reason, "LIVE_SMS_ENABLED");
  assert.equal(assertDryRunOnly({ rawEnv: {}, envConfig: { smsLive: true }, liveEnabled: false }).reason, "LIVE_SMS_ENABLED");
  assert.equal(assertDryRunOnly({ rawEnv: {}, envConfig: { smsLive: false }, liveEnabled: true }).reason, "LIVE_SMS_ENABLED");
});

test("claim is atomic and covers pending plus expired leases only", async () => {
  const model = fakeOutboxModel([job()]);
  const claimed = await claimNextOutboxJob({ model, leaseOwner: "worker-a", now: NOW });
  assert.equal(claimed.status, "processing");
  assert.equal(claimed.leaseOwner, "worker-a");
  assert.equal(claimed.attempts, 1);
  const filter = model.calls[0].filter;
  assert.equal(filter.$or.length, 2);
  assert.equal(filter.$or[0].status, "pending");
  assert.equal(filter.$or[1].status, "processing");
  assert.ok(filter.$or[1].leaseExpiresAt.$lte);

  const second = await claimNextOutboxJob({ model, leaseOwner: "worker-b", now: NOW });
  assert.equal(second, null, "a live lease must not be reclaimable");
});

test("worker processes a valid job as dry_run with no gateway side effects", async () => {
  const model = fakeOutboxModel([job()]);
  const deps = fakeModels();
  const summary = await processSmsOutboxBatch({ model, now: NOW, leaseOwner: "worker-a", ...deps });

  assert.equal(summary.refused, false);
  assert.equal(summary.claimed, 1);
  assert.equal(summary.dryRuns, 1);
  assert.equal(summary.processed, 1);
  assert.equal(model.store[0].status, "dry_run");
  assert.equal(model.store[0].leaseOwner, null);
  assert.equal(model.store[0].dryRunProvider, "dry-run");
  assert.match(model.store[0].dryRunNote, /No SMS was sent/);
  assert.equal(model.store[0].submittedAt, undefined);
  assert.equal(deps.notificationLogModel.entries.length, 1);
  assert.equal(deps.notificationLogModel.entries[0].status, "dry_run");
  assert.equal(deps.notificationLogModel.entries[0].mode, "dry_run");
  const result = JSON.stringify(summary.results[0]);
  assert.equal(result.includes(TEXT), false);
  assert.equal(result.includes("+8801712345678"), false);
});

test("revoked consent and unverified phones cancel jobs without delivery", async () => {
  const revokedPrefs = toModelPatch(PREFERENCES);
  revokedPrefs.consent.revokedAt = NOW.toISOString();
  const modelA = fakeOutboxModel([job({ _id: "job-a" })]);
  const a = await processSmsOutboxBatch({
    model: modelA, now: NOW, ...fakeModels({ preferences: revokedPrefs }),
  });
  assert.equal(a.cancelled, 1);
  assert.equal(a.dryRuns, 0);
  assert.equal(modelA.store[0].status, "cancelled");
  assert.equal(modelA.store[0].cancellationReason, "NO_CONSENT");

  const modelB = fakeOutboxModel([job({ _id: "job-b" })]);
  const b = await processSmsOutboxBatch({
    model: modelB, now: NOW, ...fakeModels({ user: consentingUser({ phoneVerifiedAt: null }) }),
  });
  assert.equal(b.cancelled, 1);
  assert.equal(b.dryRuns, 0);
  assert.equal(modelB.store[0].cancellationReason, "INVALID_RECIPIENT");
});

test("expired leases are reclaimed; live leases are not", async () => {
  const expired = job({ status: "processing", leaseOwner: "crashed", leaseExpiresAt: new Date(NOW.getTime() - 1000) });
  const model = fakeOutboxModel([expired]);
  const deps = fakeModels();
  const summary = await processSmsOutboxBatch({ model, now: NOW, leaseOwner: "worker-a", ...deps });
  assert.equal(summary.dryRuns, 1);
  assert.equal(model.store[0].leaseOwner, null);
});

test("failed processing clears the lease without promoting the job", async () => {
  const model = fakeOutboxModel([job()]);
  const summary = await processSmsOutboxBatch({
    model, now: NOW, leaseOwner: "worker-a", ...fakeModels({ userThrows: true }),
  });
  assert.equal(summary.failed, 1);
  assert.equal(summary.dryRuns, 0);
  assert.equal(model.store[0].status, "failed");
  assert.equal(model.store[0].leaseOwner, null);
  assert.equal(model.store[0].lastError, "PROCESSING_ERROR");
});

test("repeated processing never creates duplicate dry-run results", async () => {
  const model = fakeOutboxModel([job()]);
  const deps = fakeModels();
  const first = await processSmsOutboxBatch({ model, now: NOW, ...deps });
  const second = await processSmsOutboxBatch({ model, now: NOW, ...deps });

  assert.equal(first.dryRuns, 1);
  assert.equal(second.claimed, 0);
  assert.equal(second.dryRuns, 0);
  assert.equal(deps.notificationLogModel.entries.length, 1);
});

test("tampered message content is failed rather than simulated", async () => {
  const model = fakeOutboxModel([job({ message: "tampered" })]);
  const summary = await processSmsOutboxBatch({ model, now: NOW, ...fakeModels() });
  assert.equal(summary.failed, 1);
  assert.equal(summary.dryRuns, 0);
  assert.equal(model.store[0].lastError, "MESSAGE_INTEGRITY_MISMATCH");
});

test("worker never calls a gateway or promotes to live delivery", () => {
  const source = readFileSync(new URL("../src/services/sms/smsOutboxWorker.service.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /sendSms\s*\(|registerSmsGateway|bulksmsbd|\.send\s*\(|SMS_LIVE\s*[:=]\s*["']1|setInterval|cron/);
  assert.match(source, /status: "dry_run"/);
  assert.match(source, /sent: false/);
});
