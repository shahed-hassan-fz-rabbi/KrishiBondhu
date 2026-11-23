import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  evaluateWeatherForecast,
  buildWeatherDedupeKey,
  buildBengaliWeatherMessage,
  resolveWeatherDistrict,
  locationMatchesForecast,
  WEATHER_SOURCE,
  WEATHER_ALERT_MAX_AGE_MS,
} from "../src/services/sms/weatherAlertEngine.js";
import { evaluateFarmerWeatherAlert } from "../src/services/sms/weatherAlert.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";

const NOW = new Date("2026-11-23T10:00:00.000Z");
const USER = {
  _id: "u1",
  phone: "+8801712345678",
  phoneVerifiedAt: new Date("2026-11-20T10:00:00.000Z"),
  preferredDistrict: "cumilla",
};
const PREFERENCES = updateCategoryConsent(null, "weather", true, { now: NOW });

function forecast({ date = "2026-11-23", rain = 5, gust = 20, code = 1, nameEn = "Cumilla", district = "cumilla", fetchTimestamp = NOW.toISOString(), meta = {} } = {}) {
  return {
    location: { nameEn },
    shortRangeForecast: [{ dayIndex: 1, date, precipitationSumMm: rain, windGustsMaxKmH: gust, weatherCode: code, isExtended: false }],
    meta: { provider: WEATHER_SOURCE, dataStatus: "AVAILABLE", fetchTimestamp, ...meta },
  };
}

test("district resolution and location matching fail closed", () => {
  assert.equal(resolveWeatherDistrict("cumilla")?.nameEn, "Cumilla");
  assert.equal(resolveWeatherDistrict("unknown"), null);
  assert.equal(locationMatchesForecast(forecast(), "cumilla"), true);
  assert.equal(locationMatchesForecast(forecast(), "chattogram"), false);
  assert.equal(locationMatchesForecast(forecast({ nameEn: "" }), "cumilla"), false);
});

test("heavy rainfall threshold follows BMD 44/89 mm classification", () => {
  const heavy = evaluateWeatherForecast({ forecast: forecast({ rain: 44 }), districtCode: "cumilla", now: NOW });
  assert.equal(heavy.shouldAlert, true);
  assert.equal(heavy.reason, "HEAVY_RAINFALL");
  assert.equal(heavy.alert.severity, "HEAVY");
  assert.equal(heavy.alert.thresholdMm, 44);

  const veryHeavy = evaluateWeatherForecast({ forecast: forecast({ rain: 89 }), districtCode: "cumilla", now: NOW });
  assert.equal(veryHeavy.alert.severity, "VERY_HEAVY");

  const below = evaluateWeatherForecast({ forecast: forecast({ rain: 43 }), districtCode: "cumilla", now: NOW });
  assert.equal(below.shouldAlert, false);
  assert.equal(below.reason, "NO_WARNING_CONDITION");
});

test("storm warning uses documented gust and thunderstorm code thresholds", () => {
  const squall = evaluateWeatherForecast({ forecast: forecast({ rain: 2, gust: 55 }), districtCode: "cumilla", now: NOW });
  assert.equal(squall.shouldAlert, true);
  assert.equal(squall.reason, "SEVERE_WEATHER");
  assert.equal(squall.alert.severity, "SQUALL");

  const storm = evaluateWeatherForecast({ forecast: forecast({ rain: 2, gust: 20, code: 95 }), districtCode: "cumilla", now: NOW });
  assert.equal(storm.shouldAlert, true);
  assert.equal(storm.reason, "SEVERE_WEATHER");
  assert.equal(storm.alert.severity, "THUNDERSTORM");

  const calm = evaluateWeatherForecast({ forecast: forecast({ rain: 2, gust: 54, code: 1 }), districtCode: "cumilla", now: NOW });
  assert.equal(calm.shouldAlert, false);
});

test("stale, missing, future and untrusted source data produce no alert", () => {
  const staleTime = new Date(NOW.getTime() - WEATHER_ALERT_MAX_AGE_MS - 1000).toISOString();
  assert.equal(evaluateWeatherForecast({ forecast: forecast({ rain: 100, fetchTimestamp: staleTime }), districtCode: "cumilla", now: NOW }).reason, "STALE_DATA");
  assert.equal(evaluateWeatherForecast({ forecast: forecast({ rain: 100, fetchTimestamp: new Date(NOW.getTime() + 120000).toISOString() }), districtCode: "cumilla", now: NOW }).reason, "STALE_DATA");
  assert.equal(evaluateWeatherForecast({ forecast: forecast({ rain: 100, meta: { provider: "Other" } }), districtCode: "cumilla", now: NOW }).reason, "SOURCE_UNAVAILABLE");
  assert.equal(evaluateWeatherForecast({ forecast: forecast({ rain: 100, meta: { isStale: true } }), districtCode: "cumilla", now: NOW }).reason, "SOURCE_UNAVAILABLE");
  assert.equal(evaluateWeatherForecast({ forecast: null, districtCode: "cumilla", now: NOW }).reason, "NO_FORECAST_DATA");
  assert.equal(evaluateWeatherForecast({ forecast: forecast({ rain: 100 }), districtCode: "chattogram", now: NOW }).reason, "LOCATION_MISMATCH");
});

test("Bengali message includes location, warning, time and source", () => {
  const result = evaluateWeatherForecast({ forecast: forecast({ rain: 70, date: "2026-11-24" }), districtCode: "cumilla", now: NOW });
  const message = result.alert.messageBn;
  assert.ok(message.includes("কুমিল্লা"));
  assert.ok(message.includes("ভারী বৃষ্টি"));
  assert.ok(message.includes("৭০ মিমি"));
  assert.ok(message.includes("2026-11-24"));
  assert.ok(message.includes("Open-Meteo"));
});

test("dedupe key is stable for equivalent alerts", () => {
  const f = forecast({ rain: 50, date: "2026-11-24" });
  const a = evaluateWeatherForecast({ forecast: f, districtCode: "cumilla", now: NOW }).alert;
  const b = evaluateWeatherForecast({ forecast: f, districtCode: "cumilla", now: NOW }).alert;
  assert.equal(buildWeatherDedupeKey({ districtCode: "cumilla", alert: a }), buildWeatherDedupeKey({ districtCode: "cumilla", alert: b }));
  assert.match(buildWeatherDedupeKey({ districtCode: "cumilla", alert: a }), /^weather:cumilla:HEAVY_RAINFALL:2026-11-24$/);
});

function memoryLogger(existing = []) {
  const entries = [...existing];
  return {
    entries,
    async create(entry) { entries.push({ ...entry, _id: `log-${entries.length}` }); return entry; },
    async findRecent({ dedupeKey }) { return [...entries].reverse().find((e) => e.dedupeKey === dedupeKey && e.status !== "skipped") || null; },
  };
}

test("engine requires explicit weather consent and verified phone", async () => {
  const denied = await evaluateFarmerWeatherAlert({ user: USER, preferences: {}, forecast: forecast({ rain: 90 }), districtCode: "cumilla", now: NOW, logger: memoryLogger() });
  assert.equal(denied.created, false);
  assert.equal(denied.reason, "NO_CONSENT");

  const unverified = await evaluateFarmerWeatherAlert({ user: { ...USER, phoneVerifiedAt: null }, preferences: PREFERENCES, forecast: forecast({ rain: 90 }), districtCode: "cumilla", now: NOW, logger: memoryLogger() });
  assert.equal(unverified.created, false);
  assert.equal(unverified.reason, "PHONE_NOT_VERIFIED");
});

test("engine creates a DRY-RUN alert with masked logging", async () => {
  const logger = memoryLogger();
  const result = await evaluateFarmerWeatherAlert({ user: USER, preferences: PREFERENCES, forecast: forecast({ rain: 90 }), districtCode: "cumilla", now: NOW, logger });
  assert.equal(result.created, true);
  assert.equal(result.reason, "DRY_RUN_CREATED");
  assert.equal(result.delivery.status, "dry_run");
  assert.equal(result.delivery.dryRun, true);
  assert.equal(JSON.stringify(logger.entries).includes("+8801712345678"), false);
  assert.ok(logger.entries.some((e) => e.phoneLast4 === "5678"));
});

test("duplicate alerts are suppressed across evaluations", async () => {
  const logger = memoryLogger();
  const payload = { user: USER, preferences: PREFERENCES, forecast: forecast({ rain: 90, date: "2026-11-24" }), districtCode: "cumilla", now: NOW, logger };
  const first = await evaluateFarmerWeatherAlert(payload);
  const second = await evaluateFarmerWeatherAlert(payload);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.reason, "DUPLICATE");
});

test("no real gateway or live mode is reachable from the engine", () => {
  const engine = readEngine();
  assert.doesNotMatch(engine, /registerSmsGateway|bulksmsbd|smsLive|SMS_LIVE|cron|setInterval|queue/);
});

function readEngine() {
  return readFileSync(new URL("../src/services/sms/weatherAlert.service.js", import.meta.url), "utf8");
}
