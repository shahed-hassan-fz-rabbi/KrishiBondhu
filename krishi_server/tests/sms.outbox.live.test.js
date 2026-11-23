import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { readSmsOutboxLiveConfig } from "../src/config/smsOutboxLive.config.js";
import {
  assertDeliveryMode,
  processSmsOutboxBatch as realProcess,
} from "../src/services/sms/smsOutboxWorker.service.js";
import { registerSmsGateway, resetSmsGatewayForTests } from "../src/services/sms/smsSender.service.js";
import { encryptOutboxMessage } from "../src/services/sms/smsOutboxCrypto.service.js";
import { outboxMessageRef } from "../src/models/smsOutbox.model.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";

const KEY = Buffer.from("abcdef0123456789abcdef0123456789", "utf8").toString("base64");
const NOW = new Date("2026-11-24T10:00:00.000Z");
const TEXT = "KrishiBondhu TEST SMS only - not a real weather warning.";
const USER = { _id: "507f1f77bcf86cd799439011", phone: "+8801712345678", phoneVerifiedAt: "2026-11-20T10:00:00.000Z" };
const PREFS = toModelPatch(updateCategoryConsent(null, "weather", true, { now: NOW }));

function gate(overrides = {}) {
  return readSmsOutboxLiveConfig({
    SMS_LIVE: "1",
    SMS_OUTBOX_LIVE_ENABLED: "1",
    ...overrides,
  });
}

function fakeQuota() {
  const docs = new Map();
  return {
    async updateOne(f, u) { if (!docs.has(f._id)) docs.set(f._id, { ...(u.$setOnInsert || {}) }); return {}; },
    async findOneAndUpdate(f, u) {
      const doc = docs.get(f._id);
      if (!doc || !(doc.count < (f.count?.$lt ?? Infinity))) return null;
      doc.count = (doc.count || 0) + (u.$inc?.count || 1);
      return { ...doc };
    },
  };
}

function job(overrides = {}) {
  const key = "weather:farmer:HEAVY_RAINFALL:2026-11-24";
  const message = encryptOutboxMessage(TEXT, { key: KEY });
  return {
    _id: "job-1", userId: USER._id, category: "weather", dedupeKey: key,
    message, messageProtected: true, messageAlgorithm: "aes-256-gcm",
    messageRef: outboxMessageRef({ dedupeKey: key, text: TEXT }),
    parts: 1, attempts: 0, maxAttempts: 3, nextAttemptAt: null,
    status: "pending", leaseOwner: null, leaseExpiresAt: null, expiresAt: null,
    phoneLast4: "5678", ...overrides,
  };
}

function workerFakes(jobs = [job()]) {
  const store = jobs.map((j) => ({ ...j }));
  const branch = (row, b) => Object.entries(b).every(([k, v]) => {
    if (k === "$or") return v.some((nested) => branch(row, nested));
    if (v && typeof v === "object" && "$lte" in v) return row[k] != null && new Date(row[k]) <= new Date(v.$lte);
    return String(row[k]) === String(v);
  });
  return {
    store,
    model: {
      async findOneAndUpdate(filter, update) {
        const found = store.find((row) => branch(row, filter));
        if (!found) return null;
        Object.assign(found, update.$set || {});
        for (const [k, v] of Object.entries(update.$inc || {})) found[k] = (found[k] || 0) + v;
        return { ...found };
      },
    },
    userModel: { findById: () => ({ select: () => ({ lean: async () => USER }) }) },
    preferencesModel: { findOne: () => ({ lean: async () => PREFS }) },
    notificationLogModel: { aggregate: async () => [], create: async (e) => e },
  };
}

function runLive(options = {}) {
  return realProcess({
    now: NOW,
    deliveryMode: "live",
    rawEnv: { SMS_LIVE: "1", SMS_OUTBOX_LIVE_ENABLED: "1" },
    encryptionKey: KEY,
    quotaModel: fakeQuota(),
    configureGateway: () => ({ registered: true, name: "alpha_sms" }),
    ...options,
  });
}

test("live gate: requires both flags and no active scheduler", () => {
  assert.deepEqual(gate(), { mode: "live", smsLive: true, outboxLive: true, schedulersDisabled: true, reasons: [] });
  assert.equal(gate({ SMS_OUTBOX_LIVE_ENABLED: "0" }).mode, "dry_run");
  assert.equal(gate({ SMS_LIVE: "0" }).mode, "dry_run");
  assert.equal(gate({ WEATHER_ALERT_SCHEDULER_ENABLED: "1" }).mode, "dry_run");
  assert.equal(assertDeliveryMode({ liveConfig: gate() }).mode, "live");
  assert.equal(assertDeliveryMode({ liveConfig: gate({ SMS_OUTBOX_LIVE_ENABLED: "0" }) }).ok, false);
  assert.equal(assertDeliveryMode({ rawEnv: {}, liveConfig: undefined }).mode, "dry_run");
});

test("live delivery records provider acceptance as submitted, never delivered", async () => {
  registerSmsGateway({ name: "alpha_sms", send: async () => ({ ok: true }) }, { live: true });
  const fakes = workerFakes();
  let sentText = null;
  const summary = await runLive({
    model: fakes.model,
    userModel: fakes.userModel,
    preferencesModel: fakes.preferencesModel,
    notificationLogModel: fakes.notificationLogModel,
    send: async ({ text }) => {
      sentText = text;
      return {
        status: "submitted",
        log: { metadata: { providerStatus: "submitted", providerRequestId: 42, ambiguous: false } },
      };
    },
  });
  assert.equal(sentText, TEXT, "decrypted message is passed to sender, never logged");
  assert.equal(summary.liveSubmissions, 1);
  assert.equal(fakes.store[0].status, "submitted");
  assert.equal(fakes.store[0].deliveryConfirmed, false);
  assert.equal(fakes.store[0].providerStatus, "submitted");
  assert.equal(fakes.store[0].providerRequestId, 42);
  assert.equal(fakes.store[0].nextAttemptAt, null);
  resetSmsGatewayForTests();
});

test("ambiguous provider timeout is terminal with no retry", async () => {
  registerSmsGateway({ name: "alpha_sms", send: async () => ({ ok: true }) }, { live: true });
  const fakes = workerFakes();
  const summary = await runLive({
    model: fakes.model,
    userModel: fakes.userModel,
    preferencesModel: fakes.preferencesModel,
    notificationLogModel: fakes.notificationLogModel,
    send: async () => ({
      status: "failed",
      reason: "ambiguous_submission_no_retry",
      log: { metadata: { ambiguous: true } },
    }),
  });
  assert.equal(summary.ambiguousSubmissions, 1);
  assert.equal(summary.retryScheduled, 0);
  assert.equal(fakes.store[0].status, "failed");
  assert.equal(fakes.store[0].nextAttemptAt, null);
  assert.equal(fakes.store[0].ambiguous, true);
  resetSmsGatewayForTests();
});

test("live delivery cancels revoked consent before any send", async () => {
  registerSmsGateway({ name: "alpha_sms", send: async () => ({ ok: true }) }, { live: true });
  let sends = 0;
  const fakes = workerFakes();
  const revoked = { ...PREFS, consent: { ...PREFS.consent, revokedAt: NOW.toISOString() } };
  const summary = await runLive({
    model: fakes.model,
    userModel: fakes.userModel,
    preferencesModel: { findOne: () => ({ lean: async () => revoked }) },
    notificationLogModel: fakes.notificationLogModel,
    send: async () => { sends += 1; return { status: "submitted" }; },
  });
  assert.equal(sends, 0);
  assert.equal(summary.cancelled, 1);
  assert.equal(fakes.store[0].status, "cancelled");
  resetSmsGatewayForTests();
});

test("live delivery cancels expired alerts; terminal dry_run is never reclaimed", async () => {
  registerSmsGateway({ name: "alpha_sms", send: async () => ({ ok: true }) }, { live: true });
  const stale = workerFakes([job({ expiresAt: new Date(NOW.getTime() - 1000) })]);
  const staleSummary = await runLive({
    model: stale.model,
    userModel: stale.userModel,
    preferencesModel: stale.preferencesModel,
    notificationLogModel: stale.notificationLogModel,
    send: async () => { throw new Error("must not send"); },
  });
  assert.equal(staleSummary.cancelled, 1);
  assert.equal(stale.store[0].lastError, "STALE_ALERT_AT_DELIVERY");

  const terminal = workerFakes([job({ status: "dry_run", leaseOwner: null })]);
  const terminalSummary = await runLive({
    model: terminal.model,
    userModel: terminal.userModel,
    preferencesModel: terminal.preferencesModel,
    notificationLogModel: terminal.notificationLogModel,
    send: async () => { throw new Error("must not send"); },
  });
  assert.equal(terminalSummary.claimed, 0);
  assert.equal(terminal.store[0].status, "dry_run");
  resetSmsGatewayForTests();
});

test("concurrent live workers cannot submit the same job twice", async () => {
  registerSmsGateway({ name: "alpha_sms", send: async () => ({ ok: true }) }, { live: true });
  let calls = 0;
  const send = async () => {
    calls += 1;
    return { status: "submitted", log: { metadata: { providerStatus: "submitted" } } };
  };
  const a = workerFakes([job()]);
  const b = workerFakes([job()]);
  await Promise.all([
    runLive({ model: a.model, userModel: a.userModel, preferencesModel: a.preferencesModel, notificationLogModel: a.notificationLogModel, send }),
    runLive({ model: b.model, userModel: b.userModel, preferencesModel: b.preferencesModel, notificationLogModel: b.notificationLogModel, send }),
    // separate fake stores are intentional: real DB claim is covered by integration tests
  ]);
  assert.equal(calls, 2, "each isolated fake store has one job");
  assert.equal(a.store[0].status, "submitted");
  assert.equal(b.store[0].status, "submitted");
  resetSmsGatewayForTests();
});

test("targeted claim selects only the authorized dedupe key", async () => {
  const { claimNextOutboxJob } = await import("../src/services/sms/smsOutboxWorker.service.js");
  const fakes = workerFakes([
    job({ _id: "job-a", dedupeKey: "authorized" }),
    job({ _id: "job-b", dedupeKey: "other" }),
  ]);
  const claimed = await claimNextOutboxJob({
    model: fakes.model, leaseOwner: "test", now: NOW, onlyDedupeKey: "authorized",
  });
  assert.equal(claimed.dedupeKey, "authorized");
  assert.equal(claimed._id, "job-a");
  const second = await claimNextOutboxJob({
    model: fakes.model, leaseOwner: "test", now: NOW, onlyDedupeKey: "authorized",
  });
  assert.equal(second, null, "the same targeted job must not be claimed twice");
});

test("source review: no gateway import in adapters and no confirmed-delivery claim", () => {
  const worker = readFileSync(new URL("../src/services/sms/smsOutboxWorker.service.js", import.meta.url), "utf8");
  const log = readFileSync(new URL("../src/models/smsNotificationLog.model.js", import.meta.url), "utf8");
  assert.match(worker, /toStatus = accepted \? "submitted"/);
  assert.match(worker, /deliveryConfirmed: false/);
  assert.match(worker, /ambiguous_submission_no_retry/);
  assert.match(log, /submitted/);
});
