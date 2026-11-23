import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { evaluateFarmerMarketPriceAlertForOutbox } from "../src/services/sms/marketPriceAlertOutbox.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";

const NOW = new Date("2026-11-24T10:00:00.000Z");
const SELECTION = {
  commodityKey: "rice",
  market: "Cumilla Central",
  unit: "BDT/kg",
  priceType: "retail",
  frequency: "daily",
  district: "cumilla",
  division: "Chattogram",
};

function farmer(id = "u1", consent = true) {
  return {
    user: {
      _id: id,
      phone: "+8801712345678",
      phoneVerifiedAt: "2026-11-20T10:00:00.000Z",
      preferredDistrict: "cumilla",
      role: "farmer",
    },
    preferences: toModelPatch(updateCategoryConsent(null, "market", consent, { now: NOW })),
  };
}

function obs({ date = "2026-11-23", price = 112, ...rest } = {}) {
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
    priceMin: price,
    priceMax: price,
    observedOn: date,
    source: "DAM official report",
    sourceUrl: "https://market.dam.gov.bd/report",
    qualityStatus: "verified",
    ...rest,
  };
}

function validSeries() {
  return [obs({ date: "2026-11-22", price: 100 }), obs({ date: "2026-11-23", price: 112 })];
}

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

function run(options = {}) {
  const model = options.outboxModel || fakeOutboxModel();
  const { user, preferences } = farmer(options.id || "u1", options.consent !== false);
  return {
    model,
    result: evaluateFarmerMarketPriceAlertForOutbox({
      user,
      preferences,
      observations: options.observations || validSeries(),
      selection: options.selection || SELECTION,
      now: NOW,
      outboxModel: model,
    }),
  };
}

test("a valid market change creates one pending market outbox job", async () => {
  const { model, result } = await run();
  const queued = await result;
  assert.equal(queued.queued, true);
  assert.equal(queued.reason, "QUEUED");
  assert.match(queued.dedupeKey, /^market:u1:rice:cumilla central:bdt\/kg:retail:daily:none:dam official report:2026-11-23$/);
  assert.equal(model.documents.length, 1);
  assert.equal(model.documents[0].category, "market");
  assert.equal(model.documents[0].status, "pending");
  assert.ok(model.documents[0].messageBn || model.documents[0].message);
});

test("two farmers create independent jobs", async () => {
  const a = await run({ id: "u1" });
  const b = await run({ id: "u2" });
  const [first, second] = await Promise.all([a.result, b.result]);
  assert.equal(first.queued, true);
  assert.equal(second.queued, true);
  assert.notEqual(first.dedupeKey, second.dedupeKey);
  assert.equal(a.model.documents.length + b.model.documents.length, 2);
});

test("repeated evaluation is treated as duplicate", async () => {
  const model = fakeOutboxModel();
  const args = {
    user: farmer().user,
    preferences: farmer().preferences,
    observations: validSeries(),
    selection: SELECTION,
    now: NOW,
    outboxModel: model,
  };
  const first = await evaluateFarmerMarketPriceAlertForOutbox(args);
  const second = await evaluateFarmerMarketPriceAlertForOutbox(args);
  assert.equal(first.queued, true);
  assert.equal(second.queued, false);
  assert.equal(second.reason, "DUPLICATE");
  assert.equal(model.documents.length, 1);
});

test("revoked consent and unverified phone create no job", async () => {
  const denied = await run({ consent: false });
  assert.equal((await denied.result).reason, "NO_CONSENT");
  assert.equal(denied.model.documents.length, 0);

  const { user, preferences } = farmer();
  const unverified = await evaluateFarmerMarketPriceAlertForOutbox({
    user: { ...user, phoneVerifiedAt: null }, preferences,
    observations: validSeries(), selection: SELECTION, now: NOW, outboxModel: fakeOutboxModel(),
  });
  assert.equal(unverified.reason, "PHONE_NOT_VERIFIED");
});

test("missing selection creates no job", async () => {
  const noCrop = await run({ selection: { ...SELECTION, commodityKey: "", commodity: "" } });
  assert.equal((await noCrop.result).reason, "NO_CROP_SELECTED");
  const noMarket = await run({ selection: { ...SELECTION, market: "" } });
  assert.equal((await noMarket.result).reason, "NO_MARKET_SELECTED");
  const mismatched = await run({ selection: { ...SELECTION, district: "chattogram" } });
  assert.equal((await mismatched.result).reason, "LOCATION_MISMATCH");
});

test("stale, review-only, modeled, conflicting and mismatched data create no job", async () => {
  const cases = [
    { reason: "STALE_DATA", observations: [obs({ date: "2026-11-01", price: 100 }), obs({ date: "2026-11-06", price: 112 })] },
    { reason: "INSUFFICIENT_HISTORY", observations: [obs({ date: "2026-11-23", price: 112, qualityStatus: "review" })] },
    { reason: "INSUFFICIENT_HISTORY", observations: [obs({ date: "2026-11-22", price: 100, sourceUrl: "https://data.worldbank.org/price" }), obs({ date: "2026-11-23", price: 112, sourceUrl: "https://data.worldbank.org/price" })] },
    { reason: "AMBIGUOUS_PRICE", observations: [obs({ date: "2026-11-22", price: 100 }), obs({ date: "2026-11-23", price: 112 }), obs({ date: "2026-11-23", price: 130 })] },
    { reason: "AMBIGUOUS_SERIES", observations: [obs({ date: "2026-11-22", price: 100 }), obs({ date: "2026-11-23", price: 112, unit: "BDT/maund" })] },
    { reason: "AMBIGUOUS_SERIES", observations: [obs({ date: "2026-11-22", price: 100, grade: "A" }), obs({ date: "2026-11-23", price: 112, grade: "B" })] },
  ];
  for (const item of cases) {
    const attempt = await run({ observations: item.observations });
    assert.equal((await attempt.result).reason, item.reason, item.reason);
    assert.equal(attempt.model.documents.length, 0);
  }
});

test("adapter never calls a gateway or writes delivery logs", () => {
  const adapter = readFileSync(new URL("../src/services/sms/marketPriceAlertOutbox.service.js", import.meta.url), "utf8");
  assert.doesNotMatch(adapter, /import[^;]*sendSms|sendSms\s*\(\s*\{|registerSmsGateway|bulksmsbd|SmsNotificationLog/);
  assert.match(adapter, /enqueueSmsAlert/);
});
