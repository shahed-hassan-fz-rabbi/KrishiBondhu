import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  enqueueSmsAlert,
  revalidateForDelivery,
  transitionOutboxStatus,
  toSafeOutboxView,
} from "../src/services/sms/smsOutbox.service.js";
import {
  SMS_OUTBOX_TRANSITIONS,
  outboxMessageRef,
} from "../src/models/smsOutbox.model.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";

const NOW = new Date("2026-11-24T10:00:00.000Z");
const USER = {
  _id: "farmer-1",
  phone: "+8801712345678",
  phoneVerifiedAt: "2026-11-20T10:00:00.000Z",
  preferredDistrict: "cumilla",
};
const PREFERENCES = toModelPatch(updateCategoryConsent(null, "market", true, { now: NOW }));
const TEXT = "Cumilla Central: Rice দাম বেড়েছে ১২ টাকা/কেজি।";
const KEY = "market:farmer-1:rice:cumilla central:2026-11-23";

function fakeModel({ duplicate = false, documents = [] } = {}) {
  const store = [...documents];
  return {
    store,
    async create(document) {
      if (duplicate) {
        const error = new Error("E11000 duplicate key error");
        error.code = 11000;
        throw error;
      }
      const saved = {
        ...document,
        _id: `out-${store.length + 1}`,
        status: document.status || "pending",
        attempts: document.attempts || 0,
      };
      store.push(saved);
      return saved;
    },
    async findOneAndUpdate(filter, update, options = {}) {
      const index = store.findIndex((item) => Object.entries(filter).every(
        ([key, value]) => String(item[key]) === String(value)
      ));
      if (index < 0) return null;
      const updated = { ...store[index], ...(update.$set || {}) };
      for (const [key, value] of Object.entries(update.$inc || {})) {
        updated[key] = (updated[key] || 0) + value;
      }
      store[index] = updated;
      return options.new ? updated : { ...updated };
    },
  };
}

test("message reference is stable and content-derived", () => {
  const a = outboxMessageRef({ dedupeKey: KEY, text: TEXT });
  const b = outboxMessageRef({ dedupeKey: KEY, text: TEXT });
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(a, outboxMessageRef({ dedupeKey: KEY, text: `${TEXT} ` }));
});

test("enqueue succeeds with a safe result and no exposed phone or message", async () => {
  const model = fakeModel();
  const result = await enqueueSmsAlert({
    user: USER, preferences: PREFERENCES, category: "market",
    text: TEXT, dedupeKey: KEY, now: NOW, model,
  });

  assert.equal(result.enqueued, true);
  assert.equal(result.reason, "ENQUEUED");
  assert.equal(result.outbox.status, "pending");
  assert.equal(result.outbox.attempts, 0);
  assert.equal(result.outbox.phoneLast4, "5678");
  assert.equal(result.outbox.messageRef, outboxMessageRef({ dedupeKey: KEY, text: TEXT }));
  const serialised = JSON.stringify(result);
  assert.equal(serialised.includes(USER.phone), false);
  assert.equal(serialised.includes(TEXT), false);
  assert.equal(serialised.includes('"message"'), false);
});

test("enqueue rejects missing consent and revoked consent", async () => {
  const denied = await enqueueSmsAlert({
    user: USER, preferences: {}, category: "market", text: TEXT, dedupeKey: KEY, now: NOW, model: fakeModel(),
  });
  assert.deepEqual({ enqueued: denied.enqueued, reason: denied.reason }, { enqueued: false, reason: "NO_CONSENT" });

  const revoked = toModelPatch(PREFERENCES);
  revoked.consent.revokedAt = NOW.toISOString();
  const result = await enqueueSmsAlert({
    user: USER, preferences: revoked, category: "market", text: TEXT, dedupeKey: KEY, now: NOW, model: fakeModel(),
  });
  assert.equal(result.reason, "NO_CONSENT");
});

test("enqueue rejects invalid recipients and unsupported categories", async () => {
  const unverified = await enqueueSmsAlert({
    user: { ...USER, phoneVerifiedAt: null }, preferences: PREFERENCES,
    category: "market", text: TEXT, dedupeKey: KEY, now: NOW, model: fakeModel(),
  });
  assert.equal(unverified.reason, "INVALID_RECIPIENT");

  const malformed = await enqueueSmsAlert({
    user: { ...USER, phone: "12345" }, preferences: PREFERENCES,
    category: "market", text: TEXT, dedupeKey: KEY, now: NOW, model: fakeModel(),
  });
  assert.equal(malformed.reason, "INVALID_RECIPIENT");

  const unknown = await enqueueSmsAlert({
    user: USER, preferences: PREFERENCES, category: "crypto", text: TEXT, dedupeKey: KEY, now: NOW, model: fakeModel(),
  });
  assert.equal(unknown.reason, "INVALID_CATEGORY");
});

test("enqueue requires a stable dedupe key and non-empty message", async () => {
  const noKey = await enqueueSmsAlert({
    user: USER, preferences: PREFERENCES, category: "market", text: TEXT, dedupeKey: "  ", now: NOW, model: fakeModel(),
  });
  assert.equal(noKey.reason, "INVALID_DEDUPE_KEY");

  const noText = await enqueueSmsAlert({
    user: USER, preferences: PREFERENCES, category: "market", text: "", dedupeKey: KEY, now: NOW, model: fakeModel(),
  });
  assert.equal(noText.reason, "EMPTY_MESSAGE");
});

test("duplicate key errors are reported idempotently", async () => {
  const result = await enqueueSmsAlert({
    user: USER, preferences: PREFERENCES, category: "market",
    text: TEXT, dedupeKey: KEY, now: NOW, model: fakeModel({ duplicate: true }),
  });
  assert.deepEqual({ enqueued: result.enqueued, reason: result.reason }, { enqueued: false, reason: "DUPLICATE" });
  assert.equal(result.outbox, null);
});

test("revalidation helper repeats consent and phone checks for future delivery", () => {
  const ok = revalidateForDelivery({ user: USER, preferences: PREFERENCES, category: "market", now: NOW });
  assert.deepEqual({ ok: ok.ok, category: ok.category, phoneLast4: ok.phoneLast4 }, {
    ok: true, category: "market", phoneLast4: "5678",
  });
  assert.equal(revalidateForDelivery({ user: USER, preferences: {}, category: "market", now: NOW }).code, "NO_CONSENT");
  assert.equal(revalidateForDelivery({
    user: { ...USER, phoneVerifiedAt: new Date(NOW.getTime() + 1000) },
    preferences: PREFERENCES, category: "market", now: NOW,
  }).code, "INVALID_RECIPIENT");
});

test("status transitions are guarded and record lease/attempt metadata", async () => {
  assert.deepEqual(SMS_OUTBOX_TRANSITIONS.pending, ["processing", "cancelled"]);
  assert.deepEqual(SMS_OUTBOX_TRANSITIONS.submitted, []);

  const model = fakeModel({ documents: [{
    _id: "out-1", userId: "farmer-1", category: "market", dedupeKey: KEY,
    status: "pending", attempts: 0, phoneLast4: "5678",
  }] });

  const invalid = await transitionOutboxStatus({ id: "out-1", from: "pending", to: "submitted", model });
  assert.equal(invalid.reason, "INVALID_TRANSITION");

  const claimed = await transitionOutboxStatus({
    id: "out-1", from: "pending", to: "processing", leaseOwner: "worker-1", now: NOW, model,
  });
  assert.equal(claimed.ok, true);
  assert.equal(claimed.outbox.status, "processing");
  assert.equal(claimed.outbox.attempts, 1);
  assert.equal(model.store[0].leaseOwner, "worker-1");
  assert.ok(model.store[0].leaseExpiresAt > NOW);

  const wrongOwner = await transitionOutboxStatus({
    id: "out-1", from: "processing", to: "submitted", leaseOwner: "intruder", model,
  });
  assert.equal(wrongOwner.reason, "NOT_FOUND_OR_CONFLICT");

  const done = await transitionOutboxStatus({
    id: "out-1", from: "processing", to: "submitted", leaseOwner: "worker-1", now: NOW, model,
  });
  assert.equal(done.ok, true);
  assert.equal(done.outbox.status, "submitted");
  assert.equal(model.store[0].leaseOwner, null);
  assert.ok(model.store[0].submittedAt);
});

test("safe view never exposes protected fields", () => {
  const view = toSafeOutboxView({
    _id: "x", userId: "u", message: "secret", phone: "+8801712345678",
    apiKey: "secret", phoneLast4: "5678",
  });
  const serialised = JSON.stringify(view);
  assert.equal(serialised.includes("secret"), false);
  assert.equal(serialised.includes("+880"), false);
  assert.equal(serialised.includes("apiKey"), false);
});

test("outbox foundation cannot call a gateway, scheduler or live mode", () => {
  const service = readFileSync(new URL("../src/services/sms/smsOutbox.service.js", import.meta.url), "utf8");
  const model = readFileSync(new URL("../src/models/smsOutbox.model.js", import.meta.url), "utf8");
  assert.doesNotMatch(service + model, /sendSms|registerSmsGateway|bulksmsbd|smsLive|SMS_LIVE|setInterval|cron|retryWorker/);
});
