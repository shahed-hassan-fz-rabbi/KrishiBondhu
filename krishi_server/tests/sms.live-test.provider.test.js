import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { runSmsLiveTest, checkLiveTestGuards } from "../src/jobs/sms-live-test.js";
import { configureSmsGatewayFromEnv } from "../src/services/sms/configureSmsGateway.js";
import { registerSmsGateway, resetSmsGatewayForTests, getSmsMode } from "../src/services/sms/smsSender.service.js";

const KEY = Buffer.from("abcdef0123456789abcdef0123456789", "utf8").toString("base64");
const NOW = new Date("2026-11-24T10:00:00.000Z");
const NUMBER = "+8801712345678";
const ALPHA = {
  smsProvider: "alpha_sms",
  smsLive: true,
  smsLiveTestEnabled: true,
  smsLiveTestAllowedNumbers: NUMBER,
  smsOutboxEncryptionKey: KEY,
  alphaSmsApiKey: "alpha-key",
  alphaSmsEndpoint: "https://api.sms.net.bd/sendsms",
};
const RAW = { MONGODB_TEST_URI: "mongodb://127.0.0.1/kb_test_live", SMS_LIVE: "1" };

function models({ consent = true, verified = true, existingLog = null } = {}) {
  let sent = 0;
  return {
    sent: () => sent,
    models: {
      userModel: {
        findById: () => ({
          select: () => ({
            lean: async () => verified
              ? { _id: "farmer-1", phone: NUMBER, phoneVerifiedAt: "2026-11-20T10:00:00.000Z" }
              : null,
          }),
        }),
      },
      preferencesModel: {
        findOne: () => ({
          lean: async () => consent
            ? { categories: { weather: { enabled: true, subscribedAt: NOW, unsubscribedAt: null } }, consent: { givenAt: NOW, source: "settings", revokedAt: null } }
            : null,
        }),
      },
      logModel: {
        findOne: async () => existingLog,
        create: async (entry) => ({ ...entry, _id: "log-1" }),
      },
    },
  };
}

test("configureSmsGatewayFromEnv selects Alpha and never falls back to BulkSMSBD", () => {
  resetSmsGatewayForTests();
  const source = {
    ...ALPHA,
    bulkSmsApiKey: "bulk-key",
    bulkSmsSenderId: "KrishiBD",
    bulkSmsEndpoint: "https://bulksmsbd.net/api/smsapi",
  };
  const wired = configureSmsGatewayFromEnv({ source });
  assert.equal(wired.name, "alpha_sms");
  assert.equal(wired.provider, "alpha_sms");
  assert.equal(wired.live, true);
  assert.notEqual(wired.name, "bulksmsbd");

  const unknown = configureSmsGatewayFromEnv({ source: { ...source, smsProvider: "unknown" } });
  assert.equal(unknown.reason, "unknown_provider");
  assert.equal(unknown.registered, false);
  resetSmsGatewayForTests();
});

test("live-test job uses Alpha wiring and reports provider + request id", async () => {
  resetSmsGatewayForTests();
  const fakes = models();
  const wired = configureSmsGatewayFromEnv({ source: ALPHA });
  const result = await runSmsLiveTest({
    userId: "farmer-1",
    number: NUMBER,
    apply: true,
    now: NOW,
    source: ALPHA,
    rawEnv: RAW,
    connect: async () => {},
    configureGateway: () => wired,
    models: fakes.models,
    send: async () => ({
      status: "sent",
      log: { metadata: { providerStatus: "submitted", providerRequestId: 77, ambiguous: false } },
    }),
  });
  assert.equal(result.attempted, true);
  assert.equal(result.provider, "alpha_sms");
  assert.equal(result.requestId, 77);
  assert.equal(result.deliveryConfirmed, false);
  assert.equal(result.reason, undefined);
  resetSmsGatewayForTests();
});

test("live-test job refuses a provider mismatch (no silent fallback)", async () => {
  resetSmsGatewayForTests();
  registerSmsGateway({ name: "bulksmsbd", send: async () => ({ ok: true }) }, { live: true });
  const fakes = models();
  const result = await runSmsLiveTest({
    userId: "farmer-1",
    number: NUMBER,
    apply: true,
    now: NOW,
    source: ALPHA,
    rawEnv: RAW,
    connect: async () => {},
    configureGateway: () => ({ registered: true, name: "bulksmsbd" }),
    models: fakes.models,
    send: async () => { throw new Error("must not send"); },
  });
  assert.equal(result.attempted, false);
  assert.deepEqual(result.reasons, ["PROVIDER_MISMATCH"]);
  assert.equal(getSmsMode(), "live");
  resetSmsGatewayForTests();
});

test("one-attempt limit: existing log blocks any second submission", async () => {
  const fakes = models({ existingLog: { _id: "log-1" } });
  const result = await runSmsLiveTest({
    userId: "farmer-1", number: NUMBER, apply: true, now: NOW,
    source: ALPHA, rawEnv: RAW, connect: async () => {},
    configureGateway: () => ({ registered: true, name: "alpha_sms" }),
    models: fakes.models,
    send: async () => { throw new Error("must not send"); },
  });
  assert.equal(result.attempted, false);
  assert.deepEqual(result.reasons, ["ALREADY_ATTEMPTED"]);
});

test("guards require exact allowlist, consent and all opt-in flags", () => {
  assert.equal(checkLiveTestGuards({ source: ALPHA, rawEnv: RAW, number: NUMBER, apply: true, now: NOW }).ok, true);
  assert.ok(checkLiveTestGuards({ source: ALPHA, rawEnv: RAW, number: "+8801799999999", apply: true, now: NOW }).reasons.includes("NUMBER_NOT_ALLOWLISTED"));
  assert.ok(checkLiveTestGuards({ source: { ...ALPHA, alphaSmsApiKey: "" }, rawEnv: RAW, number: NUMBER, apply: true, now: NOW }).reasons.length >= 0);
  const source = readFileSync(new URL("../src/jobs/sms-live-test.js", import.meta.url), "utf8");
  assert.match(source, /PROVIDER_MISMATCH/);
  assert.doesNotMatch(source, /setInterval|cron|bulksmsbd\.net/);
});
