import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/(public-data)/market/page.js", import.meta.url), "utf8");

test("transport estimator uses farmer-entered quotes instead of invented market rates", () => {
  assert.match(page, /const \[transportMarket, setTransportMarket\] = useState\(""\)/);
  assert.match(page, /const \[transportDistanceKm, setTransportDistanceKm\] = useState\(""\)/);
  assert.match(page, /const \[transportQuote, setTransportQuote\] = useState\(""\)/);
  assert.match(page, /transportTotal \/ Number\(produceKg\)/);
  assert.match(page, /not an average market rate or a published DAM freight tariff/);
  assert.doesNotMatch(page, /Nimshar|Ranirbazar|Reazuddin|ratePerMaund|selectedNearbyMarket|produceMaund/);
});

test("profit and comparison tools begin without sample prices, costs, or yields", () => {
  assert.match(page, /const \[cost, setCost\] = useState\(0\)/);
  assert.match(page, /const \[yieldKg, setYieldKg\] = useState\(0\)/);
  assert.match(page, /const \[marginCrops, setMarginCrops\] = useState\(\[\]\)/);
  assert.match(page, /Choose a division, then select at least two crops and enter your own cost and expected yield/);
  assert.match(page, /breakEven == null \? "—"/);
  assert.doesNotMatch(page, /totalCostBdt: "30000"|expectedYieldKg: "1800"|totalCostBdt: "22000"|expectedYieldKg: "2400"/);
});

test("market crop pickers fail closed when the verified catalog is unavailable", () => {
  assert.match(page, /fetchMarketSourceCatalog\(\)/);
  assert.match(page, /setSourceCatalogError\(result\.error\?\.message/);
  assert.match(page, /sourceCatalog\?\.crops/);
  assert.doesNotMatch(page, /\|\| \[\{ commodity: "green chilli" \}\]/);
});

test("market page mounts the verified explorer and removes the broad, non-location-bound forecast form", () => {
  assert.match(page, /<MarketPriceExplorer locale=\{locale\}/);
  assert.doesNotMatch(page, /Market price outlook|handleForecast|forecastCrop/);
  assert.match(page, /Monthly market reference and outlook/);
  assert.match(page, /Compare estimated crop margins/);
  assert.match(page, /Your break-even price/);
  assert.match(page, /My price alerts/);
});
