import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { sendVerificationCodeSms } from "../src/services/sms.service.js";

const CODE = "482913";
const KEY = "alpha-otp-secret-do-not-log";
const PHONE = "+8801712345678";
const SOURCE = {
  smsProvider: "alpha_sms",
  smsOtpLiveEnabled: true,
  alphaSmsApiKey: KEY,
  alphaSmsEndpoint: "https://api.sms.net.bd/sendsms",
  alphaSmsSenderId: "",
};

function mockFetch(result) {
  let captured = null;
  return {
    captured: () => captured,
    fetch: async (url, options) => { captured = { url, options }; return result; },
  };
}

function accepted() {
  return { ok: true, status: 200, text: async () => '{"error":0,"msg":"Request successfully submitted","data":{"request_id":88}}' };
}

test("Alpha OTP: no real send by default (explicit opt-in required)", async () => {
  const m = mockFetch(accepted());
  const result = await sendVerificationCodeSms(PHONE, CODE, {
    provider: "alpha_sms", source: SOURCE, otpLive: false, fetchImpl: m.fetch,
  });
  assert.deepEqual(result, { sent: false, reason: "otp_delivery_disabled" });
  assert.equal(m.captured(), null);
});

test("Alpha OTP: mocked success uses correct number and preserves the code in the body only", async () => {
  const m = mockFetch(accepted());
  const result = await sendVerificationCodeSms(PHONE, CODE, {
    provider: "alpha_sms", source: SOURCE, otpLive: true, fetchImpl: m.fetch,
  });
  assert.deepEqual(result, { sent: true, provider: "alpha_sms" });
  const url = new URL(m.captured().url);
  assert.equal(url.origin, "https://api.sms.net.bd");
  assert.equal(url.pathname, "/sendsms");
  assert.equal(m.captured().options.method, "POST");
  const body = new URLSearchParams(m.captured().options.body);
  assert.equal(body.get("to"), "8801712345678");
  assert.equal(body.get("api_key"), KEY);
  assert.ok(body.get("msg").includes(CODE));
});

test("Alpha OTP: invalid recipient is blocked before HTTP", async () => {
  const m = mockFetch(accepted());
  const result = await sendVerificationCodeSms("not-a-phone", CODE, {
    provider: "alpha_sms", source: SOURCE, otpLive: true, fetchImpl: m.fetch,
  });
  assert.equal(result.reason, "invalid_recipient");
  assert.equal(m.captured(), null);
});

test("Alpha OTP: rejection, timeout and HTTP errors map to safe reasons", async () => {
  const rejected = mockFetch({ ok: true, status: 200, text: async () => '{"error":417,"msg":"Insufficient balance"}' });
  assert.equal((await sendVerificationCodeSms(PHONE, CODE, { provider: "alpha_sms", source: SOURCE, otpLive: true, fetchImpl: rejected.fetch })).reason, "insufficient_balance");
  const timeoutFetch = async () => { const e = new Error("aborted"); e.name = "TimeoutError"; throw e; };
  assert.equal((await sendVerificationCodeSms(PHONE, CODE, { provider: "alpha_sms", source: SOURCE, otpLive: true, fetchImpl: timeoutFetch })).reason, "provider_timeout");
  const http = mockFetch({ ok: false, status: 429, text: async () => "" });
  assert.equal((await sendVerificationCodeSms(PHONE, CODE, { provider: "alpha_sms", source: SOURCE, otpLive: true, fetchImpl: http.fetch })).reason, "provider_http_error");
});

test("SSL Wireless OTP path remains selectable and unchanged", async () => {
  const m = mockFetch({ ok: true, status: 200, json: async () => ({ status: "SUCCESS" }) });
  const source = { smsProvider: "sslwireless", sslSmsApiToken: "ssl-token", sslSmsSid: "ssl-sid" };
  const result = await sendVerificationCodeSms(PHONE, CODE, { source, fetchImpl: m.fetch });
  assert.deepEqual(result, { sent: true });
  assert.equal(new URL(m.captured().url).host, "smsplus.sslwireless.com");
});

test("OTP transport never logs codes, phones or keys", async () => {
  const originals = { warn: console.warn, log: console.log, info: console.info, error: console.error };
  const logged = [];
  for (const key of Object.keys(originals)) console[key] = (...args) => logged.push(JSON.stringify(args));
  try {
    await sendVerificationCodeSms(PHONE, CODE, {
      provider: "alpha_sms", source: SOURCE, otpLive: true, fetchImpl: mockFetch(accepted()).fetch,
    });
    await sendVerificationCodeSms(PHONE, CODE, {
      provider: "alpha_sms",
      source: SOURCE,
      otpLive: true,
      fetchImpl: mockFetch({ ok: true, status: 200, text: async () => '{"error":417}' }).fetch,
    });
  } finally {
    Object.assign(console, originals);
  }
  const all = logged.join(" ");
  assert.equal(all.includes(CODE), false);
  assert.equal(all.includes(PHONE), false);
  assert.equal(all.includes("8801712345678"), false);
  assert.equal(all.includes(KEY), false);
});

test("OTP transport source is isolated from the farmer-alert sender", () => {
  const otp = readFileSync(new URL("../src/services/sms.service.js", import.meta.url), "utf8");
  const verification = readFileSync(new URL("../src/services/phone-verification.service.js", import.meta.url), "utf8");
  assert.match(otp, /createAlphaSmsGateway/);
  assert.match(otp, /otp_delivery_disabled/);
  assert.match(verification, /timingSafeEqual/);
  assert.match(verification, /codeExpiresAt/);
  assert.doesNotMatch(verification, /registerSmsGateway|processSmsOutboxBatch|sendSms\s*\(/);
});
