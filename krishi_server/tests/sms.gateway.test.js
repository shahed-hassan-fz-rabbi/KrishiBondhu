import test from "node:test";
import assert from "node:assert/strict";

import {
  createBulkSmsBdGateway,
  readBulkSmsBdConfig,
  parseBulkSmsBdResponse,
  BULKSMSBD_ENDPOINT,
} from "../src/services/sms/bulksmsbd.gateway.js";
import { configureSmsGatewayFromEnv } from "../src/services/sms/configureSmsGateway.js";
import { toBangladeshE164, extractVerifiedPhone } from "../src/services/sms/smsRecipient.service.js";
import {
  sendSms,
  registerSmsGateway,
  resetSmsGatewayForTests,
  getSmsMode,
} from "../src/services/sms/smsSender.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";

const API_KEY = "super-secret-key-do-not-leak";
const SENDER = "KrishiBD";
const NOW = new Date("2026-11-23T10:00:00.000Z");
const USER = { _id: "u1", phone: "+8801712345678", phoneVerifiedAt: new Date("2026-11-20T10:00:00.000Z") };

const LIVE_CONFIG = {
  apiKey: API_KEY,
  senderId: SENDER,
  endpoint: BULKSMSBD_ENDPOINT,
  live: true,
  configured: true,
};

function memoryLogger() {
  const entries = [];
  return {
    entries,
    async create(entry) { const saved = { ...entry, _id: `log-${entries.length + 1}` }; entries.push(saved); return saved; },
    async findRecent() { return null; },
  };
}

test("BulkSMSBD config is only valid with HTTPS endpoint and credentials", () => {
  const good = readBulkSmsBdConfig({ bulkSmsApiKey: API_KEY, bulkSmsSenderId: SENDER, bulkSmsEndpoint: BULKSMSBD_ENDPOINT, smsLive: "0" });
  assert.equal(good.configured, true);
  assert.equal(good.live, false, "SMS_LIVE=0 must keep live disabled");

  const missing = readBulkSmsBdConfig({ bulkSmsApiKey: "", bulkSmsSenderId: SENDER, smsLive: "1" });
  assert.equal(missing.configured, false);

  const insecure = readBulkSmsBdConfig({ bulkSmsApiKey: API_KEY, bulkSmsSenderId: SENDER, bulkSmsEndpoint: "http://insecure.example", smsLive: "1" });
  assert.equal(insecure.configured, false, "plain HTTP endpoints must be rejected");

  const live = readBulkSmsBdConfig({ bulkSmsApiKey: API_KEY, bulkSmsSenderId: SENDER, smsLive: "1" });
  assert.equal(live.live, true, "SMS_LIVE=1 with credentials enables live mode");
});

test("provider response parser handles 202, plain text and known errors", () => {
  assert.equal(parseBulkSmsBdResponse('{"response_code":202,"response_message":"SMS Submitted Successfully"}').ok, true);
  assert.equal(parseBulkSmsBdResponse("Your SMS request successful").ok, true);
  assert.equal(parseBulkSmsBdResponse('{"response_code":1007}').error, "insufficient_balance");
  assert.equal(parseBulkSmsBdResponse('{"response_code":1032}').error, "ip_not_whitelisted");
  assert.equal(parseBulkSmsBdResponse('{"response_code":1012}').error, "masking_sms_must_be_bengali");
  assert.equal(parseBulkSmsBdResponse("").ok, false);
});

test("adapter posts Bangla Unicode with correct fields and parses success", async () => {
  let captured;
  const gateway = createBulkSmsBdGateway({
    config: LIVE_CONFIG,
    fetchImpl: async (url, init) => {
      captured = { url, init, body: new URLSearchParams(init.body) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ response_code: 202, response_id: "msg-42" }) };
    },
  });
  const result = await gateway.send({ to: "8801712345678", text: "আবহাওয়া সতর্কতা: আজ বृष्टি হবে।" });

  assert.equal(result.ok, true);
  assert.equal(result.messageId, "msg-42");
  assert.equal(captured.url, BULKSMSBD_ENDPOINT);
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.body.get("api_key"), API_KEY);
  assert.equal(captured.body.get("senderid"), SENDER);
  assert.equal(captured.body.get("number"), "8801712345678");
  assert.equal(captured.body.get("type"), "text");
  assert.ok(captured.body.get("message").includes("আবহাওয়া"), "Bangla text must be preserved");
  assert.equal(captured.body.get("message"), "আবহাওয়া সতর্কতা: আজ বृष्टি হবে।");
});

test("adapter returns safe errors without exposing credentials or response body", async () => {
  const gateway = createBulkSmsBdGateway({
    config: LIVE_CONFIG,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => `{"response_code":1007,"api_key":"${API_KEY}"}`,
    }),
  });
  const result = await gateway.send({ to: "8801712345678", text: "test" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "insufficient_balance");
  assert.equal(JSON.stringify(result).includes(API_KEY), false, "credentials must never appear in result");
});

test("adapter handles timeout and network errors safely", async () => {
  const timeoutError = new Error("aborted");
  timeoutError.name = "TimeoutError";
  const timedOut = createBulkSmsBdGateway({ config: LIVE_CONFIG, fetchImpl: async () => { throw timeoutError; } });
  assert.equal((await timedOut.send({ to: "8801712345678", text: "x" })).error, "provider_timeout");

  const network = createBulkSmsBdGateway({ config: LIVE_CONFIG, fetchImpl: async () => { throw new Error(`failed for ${API_KEY}`); } });
  const result = await network.send({ to: "8801712345678", text: "x" });
  assert.equal(result.error, "provider_network_error");
  assert.equal(JSON.stringify(result).includes(API_KEY), false);
});

test("adapter refuses to send when live mode is disabled or unconfigured", async () => {
  let called = 0;
  const dryConfig = { ...LIVE_CONFIG, live: false };
  const gateway = createBulkSmsBdGateway({ config: dryConfig, fetchImpl: async () => { called++; return {}; } });
  const result = await gateway.send({ to: "8801712345678", text: "x" });
  assert.equal(result.error, "live_mode_disabled");
  assert.equal(called, 0);

  const unconfigured = createBulkSmsBdGateway({ config: { ...LIVE_CONFIG, configured: false }, fetchImpl: async () => { called++; return {}; } });
  assert.equal((await unconfigured.send({ to: "8801712345678", text: "x" })).error, "gateway_not_configured");
  assert.equal(called, 0);
});

test("secure phone retrieval normalises and validates verified numbers", () => {
  assert.equal(toBangladeshE164("+8801712345678"), "8801712345678");
  assert.equal(toBangladeshE164("01712345678"), "8801712345678");
  assert.equal(toBangladeshE164("123"), null);
  const verified = extractVerifiedPhone(USER, { now: NOW });
  assert.equal(verified.e164, "8801712345678");
  assert.equal(verified.phoneLast4, "5678");
  assert.equal(extractVerifiedPhone({ ...USER, phoneVerifiedAt: null }, { now: NOW }), null);
  assert.equal(extractVerifiedPhone({ ...USER, phoneVerifiedAt: new Date(NOW.getTime() + 1000) }, { now: NOW }), null);
});

test("configureSmsGatewayFromEnv defaults to dry run and never auto-activates live", () => {
  resetSmsGatewayForTests();
  const result = configureSmsGatewayFromEnv({
    source: { bulkSmsApiKey: API_KEY, bulkSmsSenderId: SENDER, bulkSmsEndpoint: BULKSMSBD_ENDPOINT, smsLive: false },
  });
  assert.equal(result.registered, true);
  assert.equal(result.mode, "dry_run");
  assert.equal(getSmsMode(), "dry_run");

  const missing = configureSmsGatewayFromEnv({ source: { bulkSmsApiKey: "", bulkSmsSenderId: "", smsLive: "1" } });
  assert.equal(missing.registered, false);
  assert.equal(getSmsMode(), "dry_run");
  resetSmsGatewayForTests();
});

test("registered-but-not-live gateway never receives a send in dry-run mode", async () => {
  resetSmsGatewayForTests();
  let called = 0;
  registerSmsGateway({ name: "bulksmsbd", send: async () => { called++; return { ok: true }; } }, { live: false });
  assert.equal(getSmsMode(), "dry_run");
  const logger = memoryLogger();
  const prefs = updateCategoryConsent(null, "weather", true, { now: NOW });
  const result = await sendSms({ user: USER, preferences: prefs, text: "বৃষ্টি", category: "weather", now: NOW, logger });
  assert.equal(result.status, "dry_run");
  assert.equal(result.provider, "bulksmsbd", "dry run still reports registered provider name");
  assert.equal(called, 0, "adapter must not be called in dry-run");
  assert.equal(JSON.stringify(logger.entries).includes(API_KEY), false);
  resetSmsGatewayForTests();
});

test("consent and duplicate protection remain intact with a live adapter", async () => {
  resetSmsGatewayForTests();
  let calls = 0;
  registerSmsGateway({ name: "bulksmsbd", send: async () => { calls++; return { ok: true, messageId: "m1" }; } });
  assert.equal(getSmsMode(), "live");
  const logger = memoryLogger();
  const noConsent = await sendSms({ user: USER, preferences: {}, text: "test", category: "market", now: NOW, logger });
  assert.equal(noConsent.status, "skipped");
  assert.equal(calls, 0);

  const prefs = updateCategoryConsent(null, "market", true, { now: NOW });
  const first = await sendSms({ user: USER, preferences: prefs, text: "test", category: "market", dedupeKey: "d1", now: NOW, logger });
  assert.equal(first.status, "submitted");
  assert.equal(calls, 1);
  resetSmsGatewayForTests();
});
