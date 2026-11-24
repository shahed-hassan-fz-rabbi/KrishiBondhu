import test from "node:test";
import assert from "node:assert/strict";
import {
  assistantChatService,
  buildIntentCropFallback,
  detectAgriculturalIntent,
  isContextualFollowUp,
} from "../src/services/ai/chat.service.js";
import { getCropByCode } from "../src/services/cropcatalog.service.js";
import { geminiAssistantClient } from "../src/services/ai/gemini.client.js";
import { toolExecutors } from "../src/services/ai/tools.executor.js";

const cases = [
  ["আমার ধান গাছে ফুল এসেছে, এখন কী করব?", "flowering_stage", "flowering"],
  ["ধানের জমিতে পানি কতটুকু রাখব?", "irrigation_management", null],
  ["ধান গাছে পাতা হলুদ হয়ে যাচ্ছে কেন?", "pest_disease", null],
  ["ধান গাছে মাজরা পোকার আক্রমণ হলে কী করব?", "pest_disease", null],
  ["ধানের শেষবার কখন সার দিতে হয়?", "fertilizer_management", null],
  ["ধান কখন কাটার উপযুক্ত হবে?", "harvesting", null],
  ["আমার জমিতে আগাছা হয়েছে, কীভাবে নিয়ন্ত্রণ করব?", "weed_management", null],
  ["আজকের বাজারে ধানের দাম কত?", "market_price", null],
];

test("eight farmer questions route to their own intent; flowering is farmer-reported", () => {
  for (const [message, expected, stage] of cases) {
    const result = detectAgriculturalIntent(message);
    assert.equal(result.category, expected, message);
    assert.equal(result.farmerReportedStage, stage, message);
  }
});

test("clear new questions ignore stale conversation; short follow-ups keep context", () => {
  assert.equal(isContextualFollowUp("আমার ধান গাছে ফুল এসেছে, এখন কী করব?"), false);
  assert.equal(isContextualFollowUp("তাহলে এখন কী করব?"), true);
  assert.equal(isContextualFollowUp("What about irrigation?"), false);
});

test("deterministic price question calls DAM lookup and does not invent a quote", async () => {
  const originalConfigured = geminiAssistantClient.isConfigured;
  const originalPriceLookup = toolExecutors.getMarketPriceReference;
  let lookupArgs;
  geminiAssistantClient.isConfigured = () => false;
  toolExecutors.getMarketPriceReference = async (args) => {
    lookupArgs = args;
    return {
      status: "UNAVAILABLE",
      message: "No verified daily quote is available.",
      officialDailyReportUrl: "https://market.dam.gov.bd/market_daily_price_report/?L=E",
    };
  };
  try {
    const result = await assistantChatService.handleChat({ message: "আজকের বাজারে ধানের দাম কত?", district: "cumilla" });
    assert.equal(lookupArgs.commodity, "rice");
    assert.equal(lookupArgs.district, "cumilla");
    assert.match(result.answer, /কোনো দাম অনুমান করে বলছি না/);
    assert.ok(result.meta.toolsCalled.includes("getMarketPriceReference"));
  } finally {
    geminiAssistantClient.isConfigured = originalConfigured;
    toolExecutors.getMarketPriceReference = originalPriceLookup;
  }
});

test("crop fallback answers only the requested verified topic and honors flowering observation", () => {
  const crop = getCropByCode("monsoon_aman");
  const knowledge = {
    managementGuide: {
      fields: {
        water: { status: "verified", value: "Maintain moisture; avoid water stress at flowering.", valueBn: "ফুল আসার পর্যায়ে মাটির প্রয়োজনীয় আর্দ্রতা বজায় রাখুন।", unit: "field guidance", sourceIds: ["brri"] },
        fertilizer: { status: "verified", value: "Urea schedule from source guide.", valueBn: "উৎসে দেওয়া ইউরিয়ার প্রয়োগসূচি অনুসরণ করুন।", unit: "per bigha", sourceIds: ["brri"] },
        timing: { status: "verified", value: "Harvest timing from source guide.", valueBn: "উৎসে দেওয়া ফসল কাটার সময় দেখুন।", sourceIds: ["brri"] },
      },
    },
    sources: [{ id: "brri", organization: "BRRI", title: "Rice guide", url: "https://brri.gov.bd/" }],
  };
  const calendar = {
    nameBn: "রোপা আমন ধান", nameEn: "Transplanted Aman Rice", district: "Cumilla",
    officialSources: ["https://www.bamis.gov.bd/res/public/calendars/2019/08/04/4332.pdf"],
    criticalStages: [{ stageId: "flowering_milking", nameBn: "ফুল ফোটা ও দানা গঠন", nameEn: "Flowering & Grain Filling", weatherHazards: "moisture deficit can cause sterility" }],
  };
  const answers = cases.slice(0, 7).map(([message, intent]) => buildIntentCropFallback({
    intent,
    reportedStage: intent === "flowering_stage" ? "flowering" : null,
    crop,
    knowledge,
    calendar,
    estimatedStage: intent === "flowering_stage" ? "কুশি গজানো" : null,
    message,
  }));
  assert.equal(new Set(answers.map((item) => item.answer)).size, answers.length);
  assert.match(answers[0].answer, /আপনি মাঠে ধানে ফুল আসার কথা জানিয়েছেন/);
  assert.match(answers[0].answer, /ক্যালেন্ডারের অনুমান/);
  assert.doesNotMatch(answers[0].answer, /- রোপণের তারিখ:/);
  assert.match(answers[1].answer, /পানি ব্যবস্থাপনা/);
  assert.match(answers[2].answer, /নিশ্চিত করা যায় না/);
  assert.match(answers[3].answer, /কীটনাশকের নাম বা মাত্রা বলছি না/);
  assert.match(answers[4].answer, /সার ব্যবস্থাপনা/);
  assert.match(answers[5].answer, /কর্তনের সময়/);
  assert.match(answers[6].answer, /যাচাইকৃত আগাছা-নিয়ন্ত্রণ/);
});
