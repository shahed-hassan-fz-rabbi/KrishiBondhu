import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  evaluateMarketPriceSeries,
  buildMarketDedupeKey,
  officialSourceHost,
  representativePrice,
} from "../src/services/sms/marketPriceAlertEngine.js";
import { evaluateFarmerMarketPriceAlert } from "../src/services/sms/marketPriceAlert.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";

const NOW = new Date("2026-11-23T10:00:00.000Z");
const USER = {
  _id: "farmer-1",
  phone: "+8801712345678",
  phoneVerifiedAt: "2026-11-20T10:00:00.000Z",
  preferredDistrict: "cumilla",
};
const PREFERENCES = updateCategoryConsent(null, "market", true, { now: NOW });
const SELECTION = {
  commodityKey: "rice",
  market: "Cumilla Central",
  unit: "BDT/kg",
  priceType: "retail",
  frequency: "daily",
  district: "cumilla",
  division: "Chattogram",
};

function obs({ date = "2026-11-22", min = 100, max = 100, ...rest } = {}) {
  return {
    commodity: "Rice",
    commodityKey: "rice",
    division: "Chattogram",
    district: "Cumilla",
    upazila: "",
    market: "Cumilla Central",
    frequency: "daily",
    priceType: "retail",
    unit: "BDT/kg",
    priceMin: min,
    priceMax: max,
    observedOn: date,
    source: "DAM official report",
    sourceUrl: "https://market.dam.gov.bd/report",
    qualityStatus: "verified",
    ...rest,
  };
}

function series(previous = 100, latest = 112, overrides = {}) {
  return [obs({ date: "2026-11-21", min: previous, max: previous }), obs({ date: "2026-11-22", min: latest, max: latest, ...overrides })];
}

function memoryLogger(existing = []) {
  const entries = [...existing];
  return {
    entries,
    async create(entry) { entries.push({ ...entry, _id: `log-${entries.length}` }); return entry; },
    async findRecent({ dedupeKey }) { return [...entries].reverse().find((e) => e.dedupeKey === dedupeKey && e.status !== "skipped") || null; },
  };
}

test("official source detection and representative price", () => {
  assert.equal(officialSourceHost("https://market.dam.gov.bd/report"), "market.dam.gov.bd");
  assert.equal(officialSourceHost("https://worldbank.org/price"), "worldbank.org");
  assert.equal(officialSourceHost("not a url"), null);
  assert.equal(representativePrice(obs({ min: 90, max: 110 })), 100);
});

test("missing data and insufficient verified history fail closed", () => {
  assert.equal(evaluateMarketPriceSeries({ observations: [], selection: SELECTION, now: NOW }).reason, "INSUFFICIENT_HISTORY");
  assert.equal(evaluateMarketPriceSeries({ observations: [obs()], selection: SELECTION, now: NOW }).reason, "INSUFFICIENT_HISTORY");
  assert.equal(evaluateMarketPriceSeries({ observations: series(), selection: {}, now: NOW }).reason, "NO_CROP_SELECTED");
  assert.equal(evaluateMarketPriceSeries({ observations: series(), selection: { ...SELECTION, market: "" }, now: NOW }).reason, "NO_MARKET_SELECTED");
  assert.equal(evaluateMarketPriceSeries({ observations: series(), selection: { ...SELECTION, unit: "" }, now: NOW }).reason, "NO_MEASUREMENT_SELECTED");
});

test("review-only, modeled, archive and forecast rows are never live prices", () => {
  const reviewOnly = series(100, 130, { qualityStatus: "review" });
  assert.equal(evaluateMarketPriceSeries({ observations: reviewOnly, selection: SELECTION, now: NOW }).reason, "INSUFFICIENT_HISTORY");

  const worldBank = series(100, 130, { source: "World Bank RTFP", sourceUrl: "https://data.worldbank.org/commodity/price" });
  assert.equal(evaluateMarketPriceSeries({ observations: worldBank, selection: SELECTION, now: NOW }).reason, "INSUFFICIENT_HISTORY");

  const archive = series(100, 130, { source: "AgriPriceBD archive", sourceUrl: "https://data.mendeley.com/datasets/bkmxnrn3hn/1" });
  assert.equal(evaluateMarketPriceSeries({ observations: archive, selection: SELECTION, now: NOW }).reason, "INSUFFICIENT_HISTORY");

  const forecastRow = series(100, 130, { source: "forecast model", sourceUrl: "https://market.dam.gov.bd/report", qualityStatus: "review" });
  assert.equal(evaluateMarketPriceSeries({ observations: forecastRow, selection: SELECTION, now: NOW }).reason, "INSUFFICIENT_HISTORY");
});

test("stale and future observations produce no alert", () => {
  const stale = [obs({ date: "2026-11-01", min: 100, max: 100 }), obs({ date: "2026-11-06", min: 130, max: 130 })];
  assert.equal(evaluateMarketPriceSeries({ observations: stale, selection: SELECTION, now: NOW }).reason, "STALE_DATA");
  const future = [obs({ date: "2026-11-21", min: 100, max: 100 }), obs({ date: "2026-12-01", min: 130, max: 130 })];
  assert.equal(evaluateMarketPriceSeries({ observations: future, selection: SELECTION, now: NOW }).reason, "STALE_DATA");
});

test("unit, market, grade and same-date price conflicts fail closed", () => {
  const mixedUnits = [obs({ date: "2026-11-21" }), obs({ date: "2026-11-22", unit: "BDT/maund" })];
  assert.equal(evaluateMarketPriceSeries({ observations: mixedUnits, selection: SELECTION, now: NOW }).reason, "AMBIGUOUS_SERIES");

  const mismatchedSelection = series(100, 130);
  assert.equal(evaluateMarketPriceSeries({ observations: mismatchedSelection, selection: { ...SELECTION, unit: "BDT/maund" }, now: NOW }).reason, "SELECTION_MISMATCH");
  assert.equal(evaluateMarketPriceSeries({ observations: mismatchedSelection, selection: { ...SELECTION, market: "Other Market" }, now: NOW }).reason, "SELECTION_MISMATCH");

  const mixedGrades = [obs({ date: "2026-11-21", grade: "A" }), obs({ date: "2026-11-22", grade: "B" })];
  assert.equal(evaluateMarketPriceSeries({ observations: mixedGrades, selection: SELECTION, now: NOW }).reason, "AMBIGUOUS_SERIES");

  const conflicting = [obs({ date: "2026-11-21" }), obs({ date: "2026-11-22", min: 120, max: 120 }), obs({ date: "2026-11-22", min: 140, max: 140 })];
  assert.equal(evaluateMarketPriceSeries({ observations: conflicting, selection: SELECTION, now: NOW }).reason, "AMBIGUOUS_PRICE");
});

test("documented configurable thresholds detect increases and decreases", () => {
  const increase = evaluateMarketPriceSeries({ observations: series(100, 112), selection: SELECTION, now: NOW });
  assert.equal(increase.shouldAlert, true);
  assert.equal(increase.reason, "PRICE_INCREASE");
  assert.equal(increase.alert.changePercent, 12);
  assert.equal(increase.alert.absoluteChange, 12);

  const decrease = evaluateMarketPriceSeries({ observations: series(100, 88), selection: SELECTION, now: NOW });
  assert.equal(decrease.shouldAlert, true);
  assert.equal(decrease.reason, "PRICE_DECREASE");
  assert.equal(decrease.alert.changePercent, -12);

  const below = evaluateMarketPriceSeries({ observations: series(100, 105), selection: SELECTION, now: NOW });
  assert.equal(below.shouldAlert, false);
  assert.equal(below.reason, "NO_MEANINGFUL_CHANGE");

  const noise = evaluateMarketPriceSeries({ observations: series(1, 1.11), selection: SELECTION, now: NOW });
  assert.equal(noise.shouldAlert, false);
  assert.equal(noise.reason, "NO_MEANINGFUL_CHANGE");

  const strict = evaluateMarketPriceSeries({ observations: series(100, 112), selection: SELECTION, now: NOW, thresholds: { minChangePercent: 20 } });
  assert.equal(strict.reason, "NO_MEANINGFUL_CHANGE");
});

test("Bengali SMS carries crop, market, change, unit, date and source", () => {
  const result = evaluateMarketPriceSeries({ observations: series(100, 112), selection: SELECTION, now: NOW });
  const message = result.alert.messageBn;
  assert.ok(message.includes("Rice"));
  assert.ok(message.includes("Cumilla Central"));
  assert.ok(message.includes("১২"));
  assert.ok(message.includes("বেড়েছে"));
  assert.ok(message.includes("কেজি"));
  assert.ok(message.includes("2026-11-22"));
  assert.ok(message.includes("DAM official report"));
  assert.equal(result.alert.unit, "BDT/kg");
});

test("dedupe key is scoped per farmer", () => {
  const alert = evaluateMarketPriceSeries({ observations: series(100, 112), selection: SELECTION, now: NOW }).alert;
  const a = buildMarketDedupeKey({ userId: "farmer-1", alert });
  const b = buildMarketDedupeKey({ userId: "farmer-2", alert });
  assert.notEqual(a, b);
  assert.match(a, /^market:farmer-1:rice:cumilla central:bdt\/kg:retail:2026-11-22$/);
});

test("engine requires verified phone, market consent and farmer's own location", async () => {
  const unverified = await evaluateFarmerMarketPriceAlert({
    user: { ...USER, phoneVerifiedAt: null }, preferences: PREFERENCES,
    observations: series(), selection: SELECTION, now: NOW, logger: memoryLogger(),
  });
  assert.equal(unverified.reason, "PHONE_NOT_VERIFIED");

  const denied = await evaluateFarmerMarketPriceAlert({
    user: USER, preferences: {},
    observations: series(), selection: SELECTION, now: NOW, logger: memoryLogger(),
  });
  assert.equal(denied.reason, "NO_CONSENT");

  const wrongLocation = await evaluateFarmerMarketPriceAlert({
    user: USER, preferences: PREFERENCES,
    observations: series(), selection: { ...SELECTION, district: "chattogram" }, now: NOW, logger: memoryLogger(),
  });
  assert.equal(wrongLocation.reason, "LOCATION_MISMATCH");
});

test("engine creates a DRY-RUN alert with masked logging", async () => {
  const logger = memoryLogger();
  const result = await evaluateFarmerMarketPriceAlert({
    user: USER, preferences: PREFERENCES,
    observations: series(), selection: SELECTION, now: NOW, logger,
  });
  assert.equal(result.created, true);
  assert.equal(result.reason, "DRY_RUN_CREATED");
  assert.equal(result.delivery.status, "dry_run");
  assert.equal(result.delivery.dryRun, true);
  assert.equal(JSON.stringify(logger.entries).includes("+8801712345678"), false);
  assert.ok(logger.entries.some((e) => e.phoneLast4 === "5678" && e.category === "market"));
});

test("duplicate alerts are suppressed per farmer, not across farmers", async () => {
  const logger = memoryLogger();
  const payload = { preferences: PREFERENCES, observations: series(), selection: SELECTION, now: NOW, logger };
  const first = await evaluateFarmerMarketPriceAlert({ ...payload, user: USER });
  const second = await evaluateFarmerMarketPriceAlert({ ...payload, user: USER });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.reason, "DUPLICATE");

  const otherFarmer = await evaluateFarmerMarketPriceAlert({ ...payload, user: { ...USER, _id: "farmer-2" } });
  assert.equal(otherFarmer.created, true);
});

test("no real gateway, scheduler or market SMS sender is reachable", () => {
  const service = readFileSync(new URL("../src/services/sms/marketPriceAlert.service.js", import.meta.url), "utf8");
  const engine = readFileSync(new URL("../src/services/sms/marketPriceAlertEngine.js", import.meta.url), "utf8");
  assert.doesNotMatch(service + engine, /registerSmsGateway|bulksmsbd|smsLive|SMS_LIVE|cron|setInterval|sendMarketPriceAlertSms|sendVerificationCodeSms/);
});
