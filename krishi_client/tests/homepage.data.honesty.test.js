import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("market preview does not claim unverified demo values are today's or live prices", () => {
  const page = read("../app/page.js");
  // Prohibit asserting static demonstration cards as today's actual prices
  assert.doesNotMatch(page, /Today’s Wholesale & Retail Prices/);
  assert.doesNotMatch(page, /আজকের পাইকারি ও খুচরা বাজারদর/);
  assert.doesNotMatch(page, /Prices are verified with observation dates and official DAM reports/);

  // Must include explicit sample demonstration disclosures
  assert.match(page, /Sample Demonstration \(Illustrative\)/);
  assert.match(page, /সচিত্র নমুনা ফরম্যাট \(প্রদর্শনীমূলক\)/);
  assert.match(page, /Sample Demo/);
  assert.match(page, /প্রদর্শনী নমুনা/);
  assert.match(page, /Sample format · Not a live quote/);
  assert.match(page, /নমুনা ফরম্যাট · বাস্তব দর নয়/);

  // Supports real API responses when catalog series are available
  assert.match(page, /marketCatalog\?\.series/);
  assert.match(page, /item\.lastObservedOn/);
  assert.match(page, /fetchMarketDataStatus/);
  assert.match(page, /fetchVerifiedMarketPriceCatalog/);
});

test("weather and soil preview uses dynamic model summaries and satellite metadata", () => {
  const page = read("../app/page.js");
  // Must use forecast window summary rather than hardcoded static ranges
  assert.match(page, /shortWindowSummary(?:\?\.|\.)tempMin/);
  assert.match(page, /shortWindowSummary(?:\?\.|\.)tempMax/);
  assert.match(page, /shortWindowSummary(?:\?\.|\.)rainTotal/);
  assert.match(page, /shortWindowSummary(?:\?\.|\.)rainDays/);

  // Discloses source and regional proxy nature
  assert.match(page, /Open-Meteo/);
  assert.match(page, /NASA SMAP/);
  assert.match(page, /regional proxy|আঞ্চলিক প্রক্সি|আঞ্চলিক গড়/);
  assert.match(page, /fetchSoilMoistureLatest/);
});

test("crop planning preview removes speculative profit scores and unsupported water numbers", () => {
  const page = read("../app/page.js");
  // Forbidden speculative claims
  assert.doesNotMatch(page, /\+৩২০\s*মিমি|\+320\s*mm/);
  assert.doesNotMatch(page, /৮৪%|84%/);
  assert.doesNotMatch(page, /মুনাফা স্কোর|Profit Score/);

  // Uses qualitative agro-ecological indicators aligned with BRRI/BAMIS
  assert.match(page, /Groundwater Efficient|ভূগর্ভস্থ পানি সাশ্রয়ী/);
  assert.match(page, /Nitrogen Enriched|জৈব নাইট্রোজেন সংবন্ধন/);
  assert.match(page, /Feasible Turnaround|মৌসুমি সমন্বয় উপযোগী/);
  assert.match(page, /No speculative yields or profits are claimed|ফলন বা মুনাফার কোনো অবাস্তব সংখ্যা দাবি করা হয় না/);
});

test("AI chat preview is explicitly designated as an illustrative example, not personalized advice", () => {
  const page = read("../app/page.js");
  assert.match(page, /not a personalized agronomic recommendation|ব্যক্তিগত সুপারিশ বা অনুমোদন নয়/);
  assert.match(page, /Illustrative Sample Conversation|সচিত্র নমুনা কথোপকথন/);
  assert.match(page, /SAAO|উপসহকারী কৃষি কর্মকর্তা/);
  assert.match(page, /Not a field survey|ব্যক্তিগত মাঠ জরিপ নয়/);
});

test("location chip does not present default district as detected", () => {
  const page = read("../app/page.js");
  assert.match(page, /detectionStatus === "success"/);
  assert.match(page, /Detected location|শনাক্তকৃত অবস্থান/);
  assert.match(page, /Selected district|নির্বাচিত জেলা/);
});

test("navigation and chrome do not make exaggerated live/verified claims", () => {
  const chrome = read("../components/layout/PublicChrome.js");
  assert.doesNotMatch(chrome, /দৈনিক যাচাইকৃত দাম ও পাইকারি-খুচরা ব্যবধান/);
  assert.doesNotMatch(chrome, /Daily verified prices and wholesale margins/);
  assert.match(chrome, /Market price reports & wholesale margins|বাজার প্রতিবেদন ও পাইকারি-খুচরা ব্যবধান/);
});
