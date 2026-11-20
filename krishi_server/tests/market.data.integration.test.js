import test from "node:test";
import assert from "node:assert/strict";
import { MarketPriceObservation } from "../src/models/marketpriceobservation.model.js";
import { parsePriceCsv, requireMarketAdmin } from "../src/controllers/market-import.controller.js";
import { assistantTools } from "../src/services/ai/tools.definition.js";
import { toolExecutors } from "../src/services/ai/tools.executor.js";

test("DAM CSV parser keeps dates, location, type, frequency and price bands explicit", () => {
  const result = parsePriceCsv([
    "date,commodity,division,district,upazila,market,priceType,frequency,unit,priceMin,priceMax",
    "2026-11-20,Potato,Chattogram,Cumilla,Burichong,Cumilla Sadar,wholesale,daily,BDT/kg,20,24",
  ].join("\n"));
  assert.equal(result.length, 1);
  assert.deepEqual({ commodity: result[0].commodity, district: result[0].district, upazila: result[0].upazila, market: result[0].market, frequency: result[0].frequency, priceType: result[0].priceType, unit: result[0].unit }, {
    commodity: "Potato", district: "Cumilla", upazila: "Burichong", market: "Cumilla Sadar", frequency: "daily", priceType: "wholesale", unit: "BDT/kg",
  });
  assert.equal(result[0].priceMin, 20);
  assert.equal(result[0].priceMax, 24);
  assert.throws(() => parsePriceCsv("date,commodity,division,priceType,frequency,unit,priceMin,priceMax\n2026-11-20,Potato,Chattogram,wholesale,quarterly,BDT/kg,20,24"), /Invalid CSV row/);
});

test("market import route rejects farmer users before allowing CSV/PDF import", () => {
  let nextCalled = false;
  let responseStatus = 0;
  let responseBody;
  const res = {
    status(value) { responseStatus = value; return this; },
    json(value) { responseBody = value; return this; },
  };
  requireMarketAdmin({ user: { role: "farmer" } }, res, () => { nextCalled = true; });
  assert.equal(responseStatus, 403);
  assert.equal(responseBody.error.code, "ADMIN_REQUIRED");
  assert.equal(nextCalled, false);
});

test("AI market tool declares Bangla crop/location aware report and forecast inputs", () => {
  const tool = assistantTools.find((item) => item.name === "getMarketPriceReference");
  assert.ok(tool);
  for (const name of ["commodity", "district", "market", "priceType", "forecastDays"]) assert.ok(tool.parameters.properties[name]);
  assert.match(tool.description, /monthly modeled reference/);
});

test("AI market tool uses verified daily imports and returns dated forecasts without making a live-feed claim", async (t) => {
  const day = new Date();
  const observations = Array.from({ length: 220 }, (_, index) => {
    const observedOn = new Date(day.getTime() - (219 - index) * 86_400_000);
    const date = observedOn.toISOString().slice(0, 10);
    return { commodity: "Potato", commodityKey: "potato", division: "Chattogram", district: "Cumilla", upazila: "Burichong", market: "Cumilla Sadar", frequency: "daily", priceType: "wholesale", unit: "BDT/kg", priceMin: 22 + (index % 8), priceMax: 24 + (index % 8), observedOn, source: "DAM admin verified report", sourceUrl: "https://market.dam.gov.bd/market_daily_price_report/?L=E", date };
  });
  let query;
  t.mock.method(MarketPriceObservation, "find", (filter) => {
    query = filter;
    return { sort() { return this; }, limit() { return this; }, lean: async () => observations };
  });
  const result = await toolExecutors.getMarketPriceReference({ commodity: "আলু", district: "Cumilla", upazila: "Burichong", priceType: "wholesale", forecastDays: 7 });
  assert.equal(query.commodityKey, "potato");
  assert.equal(query.frequency, "daily");
  assert.equal(query.priceType, "wholesale");
  assert.equal(query.qualityStatus, "verified");
  assert.ok(query.upazila instanceof RegExp && query.upazila.test("Burichong"));
  assert.ok(result.actualPrices.wholesale.status === "AVAILABLE");
  assert.equal(result.actualPrices.wholesale.observedOn, day.toISOString().slice(0, 10));
  assert.equal(result.forecasts.wholesale.status, "FORECAST");
  assert.equal(result.forecasts.wholesale.forecast.length, 7);
  assert.equal(result.historicalTrends.wholesale.observationCount, 220);
  assert.equal(result.forecasts.wholesale.modelVersion, "market-frequency-compare-v2");
  assert.equal(result.liveFeed.status, "UNAVAILABLE");
});
