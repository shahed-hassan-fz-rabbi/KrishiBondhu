import test from "node:test";
import assert from "node:assert/strict";

import {
  createBulkSmsBdGateway,
  parseBulkSmsBdResponse,
} from "../src/services/sms/bulksmsbd.gateway.js";
import {
  sendSms,
  registerSmsGateway,
  resetSmsGatewayForTests,
} from "../src/services/sms/smsSender.service.js";
import { processSmsOutboxBatch } from "../src/services/sms/smsOutboxWorker.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";
import { outboxMessageRef } from "../src/models/smsOutbox.model.js";

const NOW = new Date("2026-11-24T10:00:00.000Z");
const USER = {
  _id: "farmer-1",
  phone: "+8801712345678",
  phoneVerifiedAt: "2026-11-20T10:00:00.000Z",
};
const PREFS = toModelPatch(updateCategoryConsent(null, "weather", true, { now: NOW }));
const CONFIG = {
  apiKey: "secret-key-do-not-log",
  senderId: "KrishiBD",
  endpoint: "https://bulksmsbd.net/api/smsapi",
  live: true,
  configured: true,
};
const BENGALI = "কুমিল্লা: ভারী বৃষ্টি সতর্কতা। কৃষিবন্ধু।";

function mockFetch(result) {
  let captured = null;
  return {
    captured: () => captured,
    fetch: async (url, options) => {
      captured = { url, options };
      return result;
    },
  };
}

test("gateway: correct E164 number, sender id and Bengali Unicode in mocked POST", async () => {
  const m = mockFetch({ ok: true, status: 200, text: async () => '{"response_code":202,"response_id":"m1"}' });
  const gateway = createBulkSmsBdGateway({ config: CONFIG, fetchImpl: m.fetch });
  const sent = await gateway.send({ to: "8801712345678", text: BENGALI });

  assert.equal(sent.ok, true);
  assert.equal(sent.providerStatus, "submitted");
  assert.equal(sent.deliveryConfirmed, false, "202 is acceptance, not confirmed delivery");
  const body = m.captured().options.body;
  assert.match(body, /number=8801712345678/);
  assert.match(body, /senderid=KrishiBD/);
  assert.equal(new URLSearchParams(body).get("message"), BENGALI);
  assert.equal(body.includes("api_key=secret-key-do-not-log"), true, "api_key belongs only in the POST body");
  assert.equal(m.captured().url, CONFIG.endpoint);
});

test("gateway: rejects malformed numbers and invalid sender ids before any HTTP", async () => {
  const m = mockFetch({ ok: true, status: 200, text: async () => "202" });
  const gateway = createBulkSmsBdGateway({ config: CONFIG, fetchImpl: m.fetch });
  assert.equal((await gateway.send({ to: "+8801712345678", text: BENGALI })).error, "invalid_provider_number");
  assert.equal(m.captured(), null, "malformed number made no HTTP call");
  const badSender = createBulkSmsBdGateway({ config: { ...CONFIG, senderId: "bad id!" }, fetchImpl: m.fetch });
  assert.equal((await badSender.send({ to: "8801712345678", text: BENGALI })).error, "invalid_sender_id");
  assert.equal(m.captured(), null, "invalid sender id made no HTTP call");
});

test("gateway: provider rejection, timeout and rate limit are classified without credentials in logs", async () => {
  const rejected = parseBulkSmsBdResponse('{"response_code":1007}');
  assert.equal(rejected.error, "insufficient_balance");
  const timeout = createBulkSmsBdGateway({
    config: CONFIG,
    fetchImpl: async () => { const error = new Error("aborted"); error.name = "TimeoutError"; throw error; },
  });
  assert.equal((await timeout.send({ to: "8801712345678", text: BENGALI })).error, "provider_timeout");
  const rateLimited = createBulkSmsBdGateway({
    config: CONFIG,
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => "" }),
  });
  assert.equal((await rateLimited.send({ to: "8801712345678", text: BENGALI })).error, "provider_http_error");
});

test("sender: live path re-derives verified recipient and never auto-retries ambiguity", async () => {
  let calls = 0;
  registerSmsGateway({
    name: "bulksmsbd",
    send: async ({ to }) => {
      calls += 1;
      assert.equal(to, "8801712345678", "provider must receive normalised E164");
      return { ok: false, error: "provider_timeout" };
    },
  }, { live: true });
  try {
    const logs = [];
    const result = await sendSms({
      user: USER, preferences: PREFS, category: "weather", text: BENGALI,
      dedupeKey: "weather:farmer-1:cumilla:HEAVY_RAINFALL:2026-11-24", now: NOW,
      logger: {
        findRecent: async () => null,
        create: async (entry) => { logs.push(entry); return entry; },
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.reason, "ambiguous_submission_no_retry");
    assert.equal(logs[0].nextRetryAt, null);
    assert.equal(logs[0].metadata.ambiguous, true);
    assert.equal(logs[0].metadata.deliveryConfirmed, false);
    assert.equal(JSON.stringify(logs).includes("+8801712345678"), false);
    assert.equal(JSON.stringify(logs).includes(BENGALI), false);
    assert.equal(JSON.stringify(logs).includes("secret-key"), false);
  } finally {
    resetSmsGatewayForTests();
  }
});

test("sender: consent is rechecked immediately before the live call", async () => {
  let calls = 0;
  registerSmsGateway({ name: "bulksmsbd", send: async () => { calls += 1; return { ok: true }; } }, { live: true });
  try {
    const revoked = { ...PREFS, consent: { ...PREFS.consent, revokedAt: NOW.toISOString() } };
    const result = await sendSms({
      user: USER, preferences: revoked, category: "weather", text: BENGALI, now: NOW,
    });
    assert.equal(result.reason, "no_consent");
    assert.equal(calls, 0, "no gateway call after consent revocation");
  } finally {
    resetSmsGatewayForTests();
  }
});

function fakeJob(overrides = {}) {
  const key = "weather:farmer-1:cumilla:HEAVY_RAINFALL:2026-11-24";
  return {
    _id: "job-1", userId: "farmer-1", category: "weather", dedupeKey: key,
    message: BENGALI, messageRef: outboxMessageRef({ dedupeKey: key, text: BENGALI }),
    parts: 1, attempts: 0, phoneLast4: "5678", status: "pending",
    leaseOwner: null, nextAttemptAt: null, expiresAt: null, leaseExpiresAt: null, ...overrides,
  };
}

function matchesBranch(row, branch) {
  return Object.entries(branch).every(([key, expected]) => {
    if (key === "$or") return expected.some((nested) => matchesBranch(row, nested));
    if (expected && typeof expected === "object" && "$lte" in expected) {
      return row[key] != null && new Date(row[key]) <= new Date(expected.$lte);
    }
    return String(row[key]) === String(expected);
  });
}

function workerFakes(job, { aggregateRows = [] } = {}) {
  const store = [{ ...job }];
  return {
    model: {
      async findOneAndUpdate(filter, update) {
        const matches = (row) => {
          if (filter.$or) return filter.$or.some((branch) => matchesBranch(row, branch));
          return matchesBranch(row, filter);
        };
        const found = store.find(matches);
        if (!found) return null;
        Object.assign(found, update.$set || {});
        for (const [k, v] of Object.entries(update.$inc || {})) found[k] = (found[k] || 0) + v;
        return { ...found };
      },
    },
    userModel: { findById: () => ({ select: () => ({ lean: async () => USER }) }) },
    preferencesModel: { findOne: () => ({ lean: async () => PREFS }) },
    notificationLogModel: {
      aggregate: async () => aggregateRows,
      create: async () => ({}),
    },
    store,
  };
}

test("worker cancels a job whose source observation expired before delivery", async () => {
  const job = fakeJob({ expiresAt: new Date(NOW.getTime() - 1000) });
  const fakes = workerFakes(job);
  const summary = await processSmsOutboxBatch({
    now: NOW, leaseOwner: "worker-a", model: fakes.model,
    userModel: fakes.userModel, preferencesModel: fakes.preferencesModel,
    notificationLogModel: fakes.notificationLogModel,
  });
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.dryRuns, 0);
  assert.equal(fakes.store[0].lastError, "STALE_ALERT_AT_DELIVERY");
});

test("worker enforces per-farmer daily limit without sending", async () => {
  const fakes = workerFakes(fakeJob(), {
    aggregateRows: [{ _id: "farmer-1", count: 5 }],
  });
  const summary = await processSmsOutboxBatch({
    now: NOW, leaseOwner: "worker-a", model: fakes.model,
    userModel: fakes.userModel, preferencesModel: fakes.preferencesModel,
    notificationLogModel: fakes.notificationLogModel,
    maxPerFarmerPerDay: 5,
  });
  assert.equal(summary.limitSkipped, 1);
  assert.equal(summary.dryRuns, 0);
  assert.equal(fakes.store[0].lastError, "FARMER_DAILY_LIMIT");
});
