import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  computeBackoffMs,
  scheduleOutboxRetry,
} from "../src/services/sms/smsOutboxRetry.service.js";
import {
  claimNextOutboxJob,
  processSmsOutboxBatch,
} from "../src/services/sms/smsOutboxWorker.service.js";
import { toSafeOutboxView } from "../src/services/sms/smsOutbox.service.js";
import { outboxMessageRef } from "../src/models/smsOutbox.model.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";

const NOW = new Date("2026-11-24T10:00:00.000Z");
const TEXT = "Cumilla: Rice দাম বেড়েছে ১২ টাকা/কেজি।";
const KEY = "market:farmer-1:rice:2026-11-23";
const PREFERENCES = toModelPatch(updateCategoryConsent(null, "market", true, { now: NOW }));
const USER = {
  _id: "farmer-1", phone: "+8801712345678",
  phoneVerifiedAt: "2026-11-20T10:00:00.000Z",
  role: "farmer", preferredDistrict: "cumilla",
};

function job(overrides = {}) {
  return {
    _id: "job-1", userId: "farmer-1", category: "market", dedupeKey: KEY,
    message: TEXT,
    messageRef: outboxMessageRef({ dedupeKey: KEY, text: TEXT }),
    parts: 1, attempts: 1, maxAttempts: 3,
    nextAttemptAt: null, failureCategory: null, status: "pending",
    leaseOwner: null, leaseExpiresAt: null, phoneLast4: "5678",
    ...overrides,
  };
}

function matches(item, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some((branch) => matches(item, branch));
    if (key === "$and") return expected.every((branch) => matches(item, branch));
    if (expected && typeof expected === "object" && "$lte" in expected) {
      return item[key] != null && new Date(item[key]) <= new Date(expected.$lte);
    }
    return String(item[key]) === String(expected);
  });
}

function fakeModel(items = []) {
  const store = items.map((item) => ({ ...item }));
  return {
    store,
    async findOneAndUpdate(filter, update, options = {}) {
      const index = store.findIndex((item) => matches(item, filter));
      if (index < 0) return null;
      const updated = { ...store[index], ...(update.$set || {}) };
      for (const [key, value] of Object.entries(update.$inc || {})) updated[key] = (updated[key] || 0) + value;
      store[index] = updated;
      return options.new ? { ...updated } : { ...updated };
    },
  };
}

function deps({ userThrows = false, preferences = PREFERENCES } = {}) {
  return {
    userModel: {
      findById() {
        return {
          select() { return this; },
          lean() { return userThrows ? Promise.reject(new Error("db down")) : Promise.resolve({ ...USER }); },
        };
      },
    },
    preferencesModel: {
      findOne() { return { lean: () => Promise.resolve({ ...preferences }) }; },
    },
    notificationLogModel: { async create() {} },
  };
}

test("exponential backoff doubles and respects the cap", () => {
  assert.equal(computeBackoffMs({ attempts: 1 }), 60_000);
  assert.equal(computeBackoffMs({ attempts: 2 }), 120_000);
  assert.equal(computeBackoffMs({ attempts: 3 }), 240_000);
  assert.equal(computeBackoffMs({ attempts: 10 }), 15 * 60_000);
  assert.equal(computeBackoffMs({ attempts: 2, baseDelayMs: 1000, maxDelayMs: 1500 }), 1500);
});

test("temporary failure atomically schedules the next attempt", async () => {
  const model = fakeModel([job({ status: "processing", leaseOwner: "worker-a", attempts: 1 })]);
  const retry = await scheduleOutboxRetry({
    id: "job-1", leaseOwner: "worker-a", attempts: 1, now: NOW, model,
  });

  assert.equal(retry.scheduled, true);
  assert.equal(retry.delayMs, 60_000);
  assert.equal(model.store[0].status, "pending");
  assert.equal(model.store[0].leaseOwner, null);
  assert.equal(model.store[0].failureCategory, "temporary");
  assert.equal(model.store[0].nextAttemptAt.getTime(), NOW.getTime() + 60_000);
});

test("attempt budget exhaustion produces a terminal temporary failure", async () => {
  const model = fakeModel([job({ status: "processing", leaseOwner: "worker-a", attempts: 3 })]);
  const retry = await scheduleOutboxRetry({
    id: "job-1", leaseOwner: "worker-a", attempts: 3, maxAttempts: 3, now: NOW, model,
  });

  assert.deepEqual({ scheduled: retry.scheduled, exhausted: retry.exhausted, reason: retry.reason }, {
    scheduled: false, exhausted: true, reason: "RETRY_EXHAUSTED",
  });
  assert.equal(model.store[0].status, "failed");
  assert.equal(model.store[0].failureCategory, "temporary");
  assert.equal(model.store[0].nextAttemptAt, null);
  assert.equal(model.store[0].leaseOwner, null);
});

test("a job is not claimable before nextAttemptAt", async () => {
  const future = new Date(NOW.getTime() + 60_000);
  const model = fakeModel([job({ nextAttemptAt: future })]);
  assert.equal(await claimNextOutboxJob({ model, leaseOwner: "worker-a", now: NOW }), null);

  const claimed = await claimNextOutboxJob({ model, leaseOwner: "worker-a", now: future });
  assert.equal(claimed.status, "processing");
  assert.equal(claimed.nextAttemptAt, null);
});

test("worker exhausts retries after three temporary failures", async () => {
  const model = fakeModel([job({ attempts: 3 })]);
  const summary = await processSmsOutboxBatch({
    model, now: NOW, ...deps({ userThrows: true }),
  });
  assert.equal(summary.retriesExhausted, 1);
  assert.equal(summary.retryScheduled, 0);
  assert.equal(model.store[0].status, "failed");
  assert.equal(model.store[0].lastError, "RETRY_EXHAUSTED");
});

test("permanent failures are never retried", async () => {
  const revoked = { ...PREFERENCES, consent: { ...PREFERENCES.consent, revokedAt: NOW.toISOString() } };
  const modelA = fakeModel([job()]);
  const a = await processSmsOutboxBatch({ model: modelA, now: NOW, ...deps({ preferences: revoked }) });
  assert.equal(a.retryScheduled, 0);
  assert.equal(a.cancelled, 1);
  assert.equal(modelA.store[0].status, "cancelled");
  assert.equal(modelA.store[0].failureCategory, "permanent");
  assert.equal(modelA.store[0].nextAttemptAt, null);

  const modelB = fakeModel([job({ message: "tampered" })]);
  const b = await processSmsOutboxBatch({ model: modelB, now: NOW, ...deps() });
  assert.equal(b.retryScheduled, 0);
  assert.equal(modelB.store[0].status, "failed");
  assert.equal(modelB.store[0].failureCategory, "permanent");
});

test("each retried attempt revalidates current consent", async () => {
  const model = fakeModel([job({ attempts: 1 })]);
  const first = await processSmsOutboxBatch({ model, now: NOW, ...deps({ userThrows: true }) });
  assert.equal(first.retryScheduled, 1);

  const revoked = { ...PREFERENCES, consent: { ...PREFERENCES.consent, revokedAt: new Date(NOW.getTime() + 30_000).toISOString() } };
  const second = await processSmsOutboxBatch({
    model, now: new Date(NOW.getTime() + 120_000), ...deps({ preferences: revoked }),
  });
  assert.equal(second.cancelled, 1);
  assert.equal(second.retryScheduled, 0);
  assert.equal(model.store[0].status, "cancelled");
});

test("safe outbox view exposes retry metadata but no protected content", () => {
  const view = toSafeOutboxView({
    _id: "x", maxAttempts: 3, nextAttemptAt: NOW, failureCategory: "temporary",
    message: "secret", phone: "+8801712345678",
  });
  assert.equal(view.maxAttempts, 3);
  assert.equal(view.failureCategory, "temporary");
  assert.equal(JSON.stringify(view).includes("secret"), false);
  assert.equal(JSON.stringify(view).includes("+880"), false);
});

test("retry modules never call a gateway or start timers", () => {
  const retry = readFileSync(new URL("../src/services/sms/smsOutboxRetry.service.js", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../src/services/sms/smsOutboxWorker.service.js", import.meta.url), "utf8");
  assert.doesNotMatch(retry, /sendSms\s*\(|registerSmsGateway|bulksmsbd|setTimeout|setInterval|cron/);
  assert.doesNotMatch(worker, /sendSms\s*\(|registerSmsGateway|bulksmsbd|\.send\s*\(|setInterval|cron/);
});
