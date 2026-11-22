import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterObservationsByDate, filterVerifiedSeries, isObservationStale, locationKey, uniqueMarketLocations } from "../lib/marketPresentation.js";

const explorer = readFileSync(new URL("../components/market/MarketPriceExplorer.js", import.meta.url), "utf8");
const forecast = readFileSync(new URL("../components/market/MarketForecastPanel.js", import.meta.url), "utf8");
const api = readFileSync(new URL("../services/api.js", import.meta.url), "utf8");

const observed = [
  { commodity: "Rice", division: "Dhaka", priceType: "retail", frequency: "daily", unit: "kg", district: "A", market: "Central", observedOn: "2026-10-01" },
  { commodity: "Rice", division: "Dhaka", priceType: "retail", frequency: "daily", unit: "kg", district: "B", market: "Central", observedOn: "2026-10-02" },
];

test("catalog filters only the fields the verified catalog actually supports", () => {
  const series = [
    { commodity: "Rice coarse", priceType: "retail", frequency: "daily", division: "Dhaka" },
    { commodity: "Rice fine", priceType: "wholesale", frequency: "weekly", division: "Sylhet" },
  ];
  assert.deepEqual(filterVerifiedSeries(series, { query: "coarse", priceType: "retail", frequency: "daily", division: "Dhaka" }), [series[0]]);
  assert.deepEqual(filterVerifiedSeries(series, { query: "bn name absent" }), []);
});

test("locations stay distinct and date filters are applied to exact fetched observations", () => {
  assert.equal(uniqueMarketLocations(observed).length, 2);
  assert.notEqual(locationKey(observed[0]), locationKey(observed[1]));
  assert.deepEqual(filterObservationsByDate(observed, "2026-10-02", "2026-10-02"), [observed[1]]);
});

test("freshness thresholds match the market forecast eligibility policy", () => {
  const now = Date.parse("2026-11-22T00:00:00Z");
  assert.equal(isObservationStale("2026-11-20", "daily", now), false);
  assert.equal(isObservationStale("2026-11-10", "daily", now), true);
  assert.equal(isObservationStale("2026-11-01", "weekly", now), false);
  assert.equal(isObservationStale("2026-07-01", "monthly", now), true);
  assert.equal(isObservationStale("", "daily", now), true);
});

test("explorer preserves provenance, discloses unsupported filters, and binds forecasting to a source", () => {
  assert.match(explorer, /fetchVerifiedMarketPriceCatalog/);
  assert.match(explorer, /fetchMarketPriceHistory/);
  assert.match(explorer, /sourceUrl/);
  assert.match(explorer, /priceType/);
  assert.match(explorer, /observedOn/);
  assert.match(explorer, /categoryUnavailable/);
  assert.match(explorer, /selectedSource \? \{ \.\.\.selectedSeries, source: selectedSource \}/);
  assert.match(forecast, /source: series\.source/);
  assert.match(forecast, /STALE_MARKET_HISTORY/);
  assert.match(forecast, /selectedModel/);
  assert.doesNotMatch(explorer, /\$\s?\d{2,}|৳\s?\d{2,}/);
});

test("history and forecast clients pass exact source and location filters", () => {
  assert.match(api, /export function fetchMarketPriceHistory\(\{[^}]*district, upazila/);
  assert.match(api, /export function fetchMarketPriceForecast\(\{ commodity, division, district, upazila, market, unit, source/);
  assert.match(api, /query\.set\("source", source\)/);
});
