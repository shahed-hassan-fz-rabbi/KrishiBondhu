import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createAlphaSmsGateway,
  readAlphaSmsConfig,
  parseAlphaSmsResponse,
  ALPHA_SMS_ENDPOINT,
} from "../src/services/sms/alphaSms.gateway.js";
import { configureSmsGatewayFromEnv } from "../src/services/sms/configureSmsGateway.js";
import { registerSmsGateway, getSmsMode, resetSmsGatewayForTests } from "../src/services/sms/smsSender.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";

const API_KEY = "alpha-secret-key-do-not-log";
const MESSAGE = "কুমিল্লা: ভারী বৃষ্টি সতর্কতা। কৃষিবন্ধু।";
const CONFIG = {
  apiKey: API_KEY,
  endpoint: ALPHA_SMS_ENDPOINT,
  senderId: "KrishiBD",
  live: true,
  configured: true,
};

function mockFetch(result) {
  let captured = null;
  return {
    captured: () => captured,
    fetch: async (url, options) => { captured = { url, options }; return result; },
  };
}

test("config requires HTTPS and API key; sender ID stays optional", () => {
  assert.equal(readAlphaSmsConfig({ alphaSmsApiKey: API_KEY }).configured, true);
  assert.equal(readAlphaSmsConfig({ alphaSmsApiKey: API_KEY, alphaSmsEndpoint: "http://insecure" }).configured, false);
  assert.equal(readAlphaSmsConfig({ alphaSmsApiKey: "" }).configured, false);
});

test("response parser distinguishes accepted submission from confirmed delivery", () => {
  const ok = parseAlphaSmsResponse('{"error":0,"msg":"Request successfully submitted","data":{"request_id":123}}');
  assert.equal(ok.ok, true);
  assert.equal(ok.requestId, 123);
  assert.equal(ok.providerStatus, "submitted");
  assert.equal(ok.deliveryConfirmed, false, "error:0 is not a delivery confirmation");
  assert.equal(parseAlphaSmsResponse('{"error":417,"msg":"Insufficient balance"}').error, "insufficient_balance");
  assert.equal(parseAlphaSmsResponse('{"error":416}').error, "no_valid_number");
  assert.equal(parseAlphaSmsResponse("not json").error, "unrecognised_provider_response");
});

test("mocked send: HTTPS POST, correct fields, Bengali Unicode, no credential leakage", async () => {
  const m = mockFetch({ ok: true, status: 200, text: async () => '{"error":0,"msg":"Request successfully submitted","data":{"request_id":42}}' });
  const gateway = createAlphaSmsGateway({ config: CONFIG, fetchImpl: m.fetch });
  const result = await gateway.send({ to: "8801712345678", text: MESSAGE });

  assert.equal(result.ok, true);
  assert.equal(result.requestId, 42);
  assert.equal(result.deliveryConfirmed, false);
  assert.equal(m.captured().url, ALPHA_SMS_ENDPOINT);
  assert.equal(m.captured().options.method, "POST");
  const body = new URLSearchParams(m.captured().options.body);
  assert.equal(body.get("api_key"), API_KEY);
  assert.equal(body.get("to"), "8801712345678");
  assert.equal(body.get("msg"), MESSAGE);
  assert.equal(body.get("sender_id"), "KrishiBD");
});

test("adapter fails closed: no HTTP for bad number, bad sender, dry-run or missing config", async () => {
  const m = mockFetch({ ok: true, status: 200, text: async () => '{"error":0,"data":{"request_id":1}}' });
  const gateway = createAlphaSmsGateway({ config: CONFIG, fetchImpl: m.fetch });
  assert.equal((await gateway.send({ to: "+8801712345678", text: MESSAGE })).error, "invalid_provider_number");
  const badSender = createAlphaSmsGateway({ config: { ...CONFIG, senderId: "bad id!" }, fetchImpl: m.fetch });
  assert.equal((await badSender.send({ to: "8801712345678", text: MESSAGE })).error, "invalid_sender_id");
  const dry = createAlphaSmsGateway({ config: { ...CONFIG, live: false }, fetchImpl: m.fetch });
  assert.equal((await dry.send({ to: "8801712345678", text: MESSAGE })).error, "live_mode_disabled");
  const unconfigured = createAlphaSmsGateway({ config: { ...CONFIG, configured: false }, fetchImpl: m.fetch });
  assert.equal((await unconfigured.send({ to: "8801712345678", text: MESSAGE })).error, "gateway_not_configured");
  assert.equal(m.captured(), null, "no provider call in any blocked case");
});

test("provider rejection, timeout and HTTP error are classified safely", async () => {
  const rejected = createAlphaSmsGateway({
    config: CONFIG,
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{"error":417,"msg":"Insufficient balance"}' }),
  });
  assert.equal((await rejected.send({ to: "8801712345678", text: MESSAGE })).error, "insufficient_balance");
  const timeout = createAlphaSmsGateway({
    config: CONFIG,
    fetchImpl: async () => { const e = new Error("aborted"); e.name = "TimeoutError"; throw e; },
  });
  assert.equal((await timeout.send({ to: "8801712345678", text: MESSAGE })).error, "provider_timeout");
  const httpError = createAlphaSmsGateway({
    config: CONFIG,
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => "" }),
  });
  assert.equal((await httpError.send({ to: "8801712345678", text: MESSAGE })).error, "provider_http_error");
});

test("gateway selection keeps BulkSMSBD and requires explicit live mode", async () => {
  resetSmsGatewayForTests();
  const alphaSource = {
    smsProvider: "alpha_sms", smsLive: false,
    alphaSmsApiKey: API_KEY, alphaSmsEndpoint: ALPHA_SMS_ENDPOINT,
  };
  const wired = configureSmsGatewayFromEnv({ source: alphaSource });
  assert.equal(wired.name, "alpha_sms");
  assert.equal(wired.live, false);
  assert.equal(getSmsMode(), "dry_run");

  const bulkSource = {
    smsProvider: "bulksmsbd", smsLive: false,
    bulkSmsApiKey: "bulk-key", bulkSmsSenderId: "KrishiBD",
    bulkSmsEndpoint: "https://bulksmsbd.net/api/smsapi",
  };
  const bulk = configureSmsGatewayFromEnv({ source: bulkSource });
  assert.equal(bulk.name, "bulksmsbd");
  resetSmsGatewayForTests();
});

test("no gateway source calls sendSms directly or logs credentials/bodies", () => {
  const alpha = readFileSync(new URL("../src/services/sms/alphaSms.gateway.js", import.meta.url), "utf8");
  assert.match(alpha, /createAlphaSmsGateway/);
  assert.doesNotMatch(alpha, /sendSms\s*\(\s*\{|console\.(log|info)\(/);
  assert.match(alpha, /deliveryConfirmed: false/);
  assert.equal(updateCategoryConsent(null, "market", true, { now: new Date() }).categories.market.enabled, true);
});
