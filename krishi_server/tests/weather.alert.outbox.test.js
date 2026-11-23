import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { evaluateFarmerWeatherAlertForOutbox } from "../src/services/sms/weatherAlertOutbox.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";
import { WEATHER_SOURCE } from "../src/services/sms/weatherAlertEngine.js";

const NOW = new Date("2026-11-24T10:00:00.000Z");

function farmer(id = "u1", { district = "cumilla", consent = true } = {}) {
  return {
    user: {
      _id: id,
      phone: "+8801712345678",
      phoneVerifiedAt: "2026-11-20T10:00:00.000Z",
      preferredDistrict: district,
      role: "farmer",
    },
    preferences: toModelPatch(updateCategoryConsent(null, "weather", consent, { now: NOW })),
  };
}

function forecast({ rain = 90, stale = false, district = "cumilla" } = {}) {
  return {
    location: { nameEn: district === "chattogram" ? "Chattogram" : "Cumilla" },
    shortRangeForecast: [{ dayIndex: 1, date: "2026-11-25", precipitationSumMm: rain, weatherCode: 1 }],
    meta: {
      provider: WEATHER_SOURCE,
      dataStatus: "AVAILABLE",
      fetchTimestamp: stale ? new Date(NOW.getTime() - 7 * 3_600_000).toISOString() : NOW.toISOString(),
    },
  };
}

/** Fake model enforcing the unique (userId, dedupeKey) index. */
function fakeOutboxModel() {
  const documents = [];
  return {
    documents,
    async create(document) {
      const duplicate = documents.some((item) =>
        String(item.userId) === String(document.userId) && item.dedupeKey === document.dedupeKey
      );
      if (duplicate) {
        const error = new Error("E11000 duplicate key error");
        error.code = 11000;
        throw error;
      }
      const saved = { ...document, _id: `out-${documents.length + 1}` };
      documents.push(saved);
      return saved;
    },
  };
}

test("one eligible farmer creates exactly one pending outbox job", async () => {
  const model = fakeOutboxModel();
  const { user, preferences } = farmer();
  const result = await evaluateFarmerWeatherAlertForOutbox({
    user, preferences, forecast: forecast(), districtCode: "cumilla", now: NOW, outboxModel: model,
  });

  assert.equal(result.queued, true);
  assert.equal(result.reason, "QUEUED");
  assert.match(result.dedupeKey, /^weather:u1:cumilla:HEAVY_RAINFALL:2026-11-25$/);
  assert.equal(model.documents.length, 1);
  assert.equal(model.documents[0].category, "weather");
  assert.equal(model.documents[0].status, "pending");
  assert.equal(model.documents[0].phoneLast4, "5678");
  assert.ok(model.documents[0].messageBn || model.documents[0].message);
});

test("two farmers in the same district create independent jobs", async () => {
  const model = fakeOutboxModel();
  const a = farmer("u1");
  const b = farmer("u2");
  const first = await evaluateFarmerWeatherAlertForOutbox({
    user: a.user, preferences: a.preferences, forecast: forecast(), districtCode: "cumilla", now: NOW, outboxModel: model,
  });
  const second = await evaluateFarmerWeatherAlertForOutbox({
    user: b.user, preferences: b.preferences, forecast: forecast(), districtCode: "cumilla", now: NOW, outboxModel: model,
  });

  assert.equal(first.queued, true);
  assert.equal(second.queued, true);
  assert.notEqual(first.dedupeKey, second.dedupeKey);
  assert.equal(model.documents.length, 2);
});

test("repeated evaluation for the same farmer is treated as duplicate", async () => {
  const model = fakeOutboxModel();
  const { user, preferences } = farmer();
  const args = { user, preferences, forecast: forecast(), districtCode: "cumilla", now: NOW, outboxModel: model };
  const first = await evaluateFarmerWeatherAlertForOutbox(args);
  const second = await evaluateFarmerWeatherAlertForOutbox(args);

  assert.equal(first.queued, true);
  assert.equal(second.queued, false);
  assert.equal(second.reason, "DUPLICATE");
  assert.equal(model.documents.length, 1);
});

test("revoked consent and stale forecasts create no job", async () => {
  const model = fakeOutboxModel();
  const revoked = farmer("u1", { consent: false });
  revoked.preferences.consent.revokedAt = NOW.toISOString();
  const denied = await evaluateFarmerWeatherAlertForOutbox({
    user: revoked.user, preferences: revoked.preferences,
    forecast: forecast(), districtCode: "cumilla", now: NOW, outboxModel: model,
  });
  assert.equal(denied.reason, "NO_CONSENT");

  const eligible = farmer("u2");
  const stale = await evaluateFarmerWeatherAlertForOutbox({
    user: eligible.user, preferences: eligible.preferences,
    forecast: forecast({ stale: true }), districtCode: "cumilla", now: NOW, outboxModel: model,
  });
  assert.equal(stale.reason, "STALE_DATA");
  assert.equal(model.documents.length, 0);
});

test("adapter never sends or writes delivery logs", () => {
  const adapter = readFileSync(new URL("../src/services/sms/weatherAlertOutbox.service.js", import.meta.url), "utf8");
  const cycle = readFileSync(new URL("../src/services/sms/weatherAlertCycle.service.js", import.meta.url), "utf8");
  assert.doesNotMatch(adapter, /import[^;]*sendSms|sendSms\s*\(\s*\{|registerSmsGateway|bulksmsbd|SmsNotificationLog/);
  assert.match(adapter, /enqueueSmsAlert/);
  assert.match(cycle, /evaluateFarmerWeatherAlertForOutbox/);
  assert.doesNotMatch(cycle, /from "\.\/weatherAlert\.service\.js"/);
});
