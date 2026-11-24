/**
 * KrishiBondhu AI Assistant — Chat Service.
 * Orchestrates conversational AI interactions, manages grounded tool dispatch,
 * extracts scientific provenance and quality flags, and maintains session safety.
 */

import crypto from "crypto";
import { geminiAssistantClient } from "./gemini.client.js";
import { toolExecutors } from "./tools.executor.js";
import { DISTRICTS } from "../../config/climate.config.js";
import { getCropByCode, getCropKnowledge, loadCropCatalog } from "../cropcatalog.service.js";
import { classifyAssistantScope, isAgricultureRelatedMessage, requiresVerifiedDistrict } from "./scope.classifier.js";

const VALID_DISTRICT_CODES = new Set(DISTRICTS.map((d) => d.code));

/**
 * High-confidence Banglish (Bangla written in Latin script) vocabulary.
 * These tokens are unambiguous Bangla words — unlikely to appear in an
 * English farming question. Matched on word boundaries only.
 */
const BANGLISH_STRONG_TOKENS = new Set([
  // Pronouns & possessives
  "ami", "amra", "amar", "amader", "amake", "amago",
  "tumi", "tui", "tomar", "tomader", "tomake", "tomra", "tor",
  "apni", "apnar", "apnake", "apnader",
  // Question words & adverbs
  "kemon", "keno", "kothay", "kokhon", "kibhabe", "kivabe", "kotodin",
  "jodi", "tahole", "aro", "abaar", "abara", "ekhon", "ekdom", "khub", "ta",
  // Auxiliaries & common verbs
  "ache", "achen", "acho", "achis", "chilo", "chhilo", "hobe", "holo", "hoye",
  "korbo", "korbe", "korben", "korle", "korchi", "korlam", "koren", "korun", "koro", "kori",
  "lagbe", "lagche", "dorkar", "dorkari", "dorkor",
  "jante", "janten", "janen", "janben", "janbo", "bolben", "bolen", "bolle", "bole", "korte", "parso", "parben",
  "dekhen", "dekhte", "dekhben", "dekhi", "dekhle", "diben", "diye", "niye", "nebo",
  "chai", "chahi", "chao", "chay", "chan", "chanchi",
  // Descriptors
  "bhalo", "valo", "beshi", "koman", "baje", "sondeho", "somadhan",
  // Agriculture-specific nouns
  "dhan", "phosol", "fosol", "foshol", "phoshol", "khamar", "khaamar",
  "begoon", "begun", "beguner", "shorisha", "sorisha", "shorise", "shorishar",
  "jom", "jole", "jol", "khete", "khet", "borshe", "borsah",
  "ropon", "ronan", "pukur", "nodir", "borsha", "bristi", "brishti",
  "bochor", "bochhore", "mash", "mashe", "sopthah", "sopthaho",
  "nirapod", "nirapatta", "shomoy", "shomoe", "porikar", "porikhare",
]);

/**
 * Medium-confidence Banglish tokens — possible (though rare) in English.
 * A message counts as Banglish with >= 2 of these when no strong token matched.
 */
const BANGLISH_MEDIUM_TOKENS = new Set([
  "ki", "koto", "kotota", "kotha", "din", "bol", "dekh", "dao", "jan",
  "paba", "pabo", "hobe",
]);

function isBanglishMessage(message) {
  if (typeof message !== "string" || !message.trim()) return false;
  const words = message.toLowerCase().match(/[a-z]+/g) || [];
  if (!words.length) return false;
  if (words.some((word) => BANGLISH_STRONG_TOKENS.has(word))) return true;
  return words.filter((word) => BANGLISH_MEDIUM_TOKENS.has(word)).length >= 2;
}

/**
 * Detect whether a message is Bangla in any written form — Bangla script or
 * Banglish (transliterated Bangla in Latin script). Used to mirror the
 * farmer's language in replies.
 */
function isBanglaMessage(message) {
  if (typeof message !== "string" || message.length === 0) return false;
  if (/[\u0980-\u09FF]/.test(message)) return true;
  return isBanglishMessage(message);
}

function findCatalogOnlyCropMention(message) {
  const normalizedMessage = String(message || "").toLocaleLowerCase();
  return loadCropCatalog().crops
    .filter((item) => !item.planningAvailable)
    .find((item) => [item.nameBn, item.nameEn, ...(item.aliasesBn || []), ...(item.aliasesEn || [])]
      .filter(Boolean)
      .some((label) => {
        const normalizedLabel = label.toLocaleLowerCase();
        if (/^[a-z0-9 _-]+$/.test(normalizedLabel)) {
          const escapedLabel = normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`(^|[^a-z0-9])${escapedLabel}([^a-z0-9]|$)`, "i").test(normalizedMessage);
        }
        return normalizedMessage.includes(normalizedLabel);
      }));
}

function isMarketQuestion(message) {
  return /\b(price|market)\b|দাম|দর|বাজার/i.test(String(message || ""));
}

/** Identify the farmer's current question before using farm/profile context. */
export function detectAgriculturalIntent(message) {
  const text = String(message || "").toLocaleLowerCase();
  const has = (pattern) => pattern.test(text);
  const reportedStage = has(/ফুল\s*(এসেছে|ফুটেছে|দিয়েছে|আসছে)|শীষে\s*ফুল|flowering|bloom(?:ing)?|flowers?\s+(?:have\s+)?appeared|ful\s+(?:esheche|ashche|futeche)/i)
    ? "flowering"
    : has(/কাইচথোড়|থোড়|booting|panicle initiation/i) ? "booting"
      : has(/অঙ্কুর|চারা|seedling|germination/i) ? "seedling"
        : has(/পাকার পর্যায়|ধান পেকেছে|maturity|ripening/i) ? "ripening" : null;

  let category;
  if (has(/ফুল\s*(এসেছে|ফুটেছে|দিয়েছে|আসছে)|শীষে\s*ফুল|flowering|bloom(?:ing)?|flowers?\s+(?:have\s+)?appeared|ful\s+(?:esheche|ashche|futeche)/i)) category = "flowering_stage";
  else if (has(/দাম|দর|বাজার|price|market|মূল্য/i)) category = "market_price";
  else if (has(/মাজরা|পোকা|কীট|রোগ|পাতা হলুদ|হলুদ হয়ে|হলুদ হয়ে|দাগ|blight|pest|insect|disease|yellow(?:ing)? leaves?|stem borer/i)) category = "pest_disease";
  else if (has(/আগাছা|নিড়ানি|নিড়ানি|weed/i)) category = "weed_management";
  else if (has(/সার|ইউরিয়া|ইউরিয়া|fertili[sz]er|urea|nutrient/i)) category = "fertilizer_management";
  else if (has(/পানি|জল|সেচ|আর্দ্রতা|irrigat|water (?:level|how much|management)|moisture/i)) category = "irrigation_management";
  else if (has(/মাটি|soil|জমির ধরন/i)) category = "soil_management";
  else if (has(/কাটব|কাটা|কর্তন|harvest|cutting time/i)) category = "harvesting";
  else if (has(/আবহাওয়া|আবহাওয়া|বৃষ্টি|বৃষ্টিপাত|তাপমাত্রা|weather|rain|temperature|forecast/i)) category = "weather_advice";
  else if (reportedStage || has(/পর্যায়|পর্যায়|বৃদ্ধি|জীবনচক্র|growth stage|crop stage|lifecycle/i)) category = "crop_growth_stage";
  else category = "general_agriculture";

  return { category, farmerReportedStage: reportedStage };
}

export function isContextualFollowUp(message) {
  const text = String(message || "").trim().toLocaleLowerCase();
  // Clear, self-contained topic questions should not inherit stale assistant answers.
  if (detectAgriculturalIntent(text).category !== "general_agriculture") return false;
  return text.length < 100 && (/^(?:আর|তাহলে|এখন|এটা|ওটা|সেটা|এরপর|এক্ষেত্রে|কেন এমন|আরও|তবে)(?:\s|$)/.test(text)
    || /^(?:what about|and then|why is that|how about|it\b|that\b|also\b)/i.test(text));
}

function findCropInMessage(message, selectedCrop) {
  const catalog = loadCropCatalog().crops;
  const text = String(message || "").toLocaleLowerCase();
  const labels = catalog.flatMap((item) => [item.nameBn, item.nameEn, ...(item.aliasesBn || []), ...(item.aliasesEn || [])]
    .filter(Boolean).map((label) => ({ item, label: String(label).toLocaleLowerCase() })));
  labels.sort((a, b) => b.label.length - a.label.length);
  const mentioned = labels.find(({ label }) => /^[a-z0-9 _-]+$/.test(label)
    ? new RegExp(`(^|[^a-z0-9])${label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(text)
    : text.includes(label))?.item || null;
  if (mentioned) return mentioned;
  const selected = getCropByCode(selectedCrop);
  if (selected) return selected;
  if (/(ধান|\brice\b|\bdhan\b)/i.test(text)) {
    return { code: null, nameBn: "ধান", nameEn: "rice", calendarAvailable: false };
  }
  return null;
}

function sourceOrganizationsFor(field, knowledge) {
  const ids = field?.sourceIds || [];
  const sources = [...(knowledge?.sources || []), ...(knowledge?.managementGuide?.sources || [])];
  return sources.filter((source) => ids.includes(source.id));
}

export function buildIntentCropFallback({ intent, reportedStage, crop, knowledge, calendar, estimatedStage, message, conversationId }) {
  const bn = isBanglaMessage(message);
  const language = bn ? "bn" : "en";
  const fields = knowledge?.managementGuide?.fields || {};
  const fieldKey = intent === "fertilizer_management" ? "fertilizer"
    : intent === "irrigation_management" || intent === "flowering_stage" ? "water"
      : intent === "harvesting" ? "timing"
        : intent === "crop_growth_stage" ? "lifecycle" : null;
  const field = fieldKey ? fields[fieldKey] : null;
  const fieldVerified = String(field?.status || "").startsWith("verified") && field?.value;
  const localizedFieldValue = bn ? field?.valueBn : field?.value;
  const isVerified = Boolean(fieldVerified && localizedFieldValue);
  const flowering = calendar?.criticalStages?.find((stage) => /flower|ফুল|panicle/i.test(`${stage.stageId} ${stage.nameBn} ${stage.nameEn}`));
  const sources = [];
  const provenance = [];
  const limitations = [];
  let answer;
  if (intent === "pest_disease") {
    const namesStemBorer = /মাজরা|stem\s*borer/i.test(message);
    if (namesStemBorer) {
      const stageRisk = calendar?.criticalStages?.find((stage) => /tiller|কুশি/i.test(`${stage.stageId} ${stage.nameBn} ${stage.nameEn}`))?.weatherHazards;
      answer = bn
        ? `আপনি মাজরা পোকার কথা বলেছেন। শুধু এই বর্ণনা থেকে আক্রমণের মাত্রা বা প্রতিকার নির্ধারণ করা যাচ্ছে না${stageRisk ? "; BAMIS পঞ্জিকায় কুশি পর্যায়ে মাজরা পোকার ঝুঁকির কথা উল্লেখ আছে" : ""}। আক্রান্ত কুশি/ডেড হার্ট কতটি, জমির কত অংশে আছে এবং গাছের বয়স—এগুলো জানান বা পরিষ্কার ছবি দিন। যাচাইকৃত প্রতিকার না থাকায় কীটনাশকের নাম বা মাত্রা বলছি না; স্থানীয় DAE কর্মকর্তাকে দেখান।`
        : `You reported stem borer. This description is not enough to establish the infestation level or choose a treatment${stageRisk ? `; the BAMIS calendar notes stem-borer risk at tillering (${stageRisk})` : ""}. Share the crop age, the number of affected tillers/dead hearts, the affected field area, or a clear photo. No verified treatment was retrieved, so I will not guess a pesticide or dose; ask a local DAE officer to inspect it.`;
      if (stageRisk && calendar?.officialSources?.length) {
        sources.push("BAMIS / Department of Agricultural Extension");
        provenance.push(...calendar.officialSources);
      }
    } else {
      answer = bn
        ? `${crop?.nameBn || "ফসল"}-এর পাতা হলুদ হওয়ার কারণ শুধু এই লক্ষণ দিয়ে নিশ্চিত করা যায় না—পুষ্টির ঘাটতি, পানি বা রোগসহ একাধিক কারণ থাকতে পারে। কোন পাতায় আগে শুরু হয়েছে, দাগ আছে কি না, জমির কত অংশে হয়েছে এবং সাম্প্রতিক সার/সেচের তথ্য দিন; আক্রান্ত পাতার দুই পাশের ছবি দিলে বোঝা সহজ হবে। নিশ্চিত শনাক্তকরণ ছাড়া সার বা কীটনাশক প্রয়োগ করবেন না; স্থানীয় DAE কর্মকর্তাকে দেখান।`
        : `Yellow leaves on ${crop?.nameEn || "the crop"} cannot be diagnosed from this symptom alone; nutrient issues, water conditions, and disease can have overlapping signs. Tell me which leaves yellowed first, whether there are spots, how much of the field is affected, and recent fertilizer/irrigation. Photos of both leaf sides can help. Do not apply fertilizer or pesticide before confirming the cause; consult a local DAE officer.`;
    }
    limitations.push("No verified diagnosis or crop-specific treatment record was retrieved; no pesticide recommendation is made.");
  } else if (intent === "weed_management") {
    const note = knowledge?.varietyGuides?.find((guide) => guide.facts?.weedManagement)?.facts?.weedManagement;
    if (note && knowledge?.varietyGuides?.[0]?.source?.url) {
      const guide = knowledge.varietyGuides.find((item) => item.facts?.weedManagement);
      answer = bn ? guide.facts.weedManagement.bn : guide.facts.weedManagement.en;
      sources.push(guide.source.organization);
      provenance.push(`${guide.source.title}: ${guide.source.url}`);
      limitations.push(guide.applicabilityNote || "Variety-specific source; confirm the variety and local field conditions.");
    } else {
      answer = bn ? `${crop?.nameBn || "এই ফসল"}-এর জন্য যাচাইকৃত আগাছা-নিয়ন্ত্রণ পদ্ধতি এই তথ্যভান্ডারে পাওয়া যায়নি। জমির অবস্থা ও ফসলের বয়স না জেনে হার্বিসাইডের নাম বা মাত্রা বলা হবে না। ফসলের জাত ও আগাছার ছবি দিলে DAE কর্মকর্তার সঙ্গে মিলিয়ে পরামর্শ দেওয়া যাবে।`
        : `A verified weed-control method for ${crop?.nameEn || "this crop"} was not found in the retrieved records. Herbicide names or rates should not be guessed without the crop age and field conditions. Share the variety and a weed photo, and confirm options with a DAE extension officer.`;
      limitations.push("No verified crop-specific weed-control record was retrieved.");
    }
  } else if (intent === "flowering_stage") {
    if (flowering) {
      const risk = flowering.weatherHazards || "";
      const riskBn = /moisture deficit.*sterility/i.test(risk)
        ? "পানির ঘাটতিতে ফুলের পর্যায়ে দানা না বাঁধার ঝুঁকি থাকে।"
        : risk ? "এই পর্যায়ের ঝুঁকি BAMIS পঞ্জিকায় উল্লেখ আছে; নিচের সূত্রে বিস্তারিত দেখুন।" : "";
      answer = bn
        ? `আপনি মাঠে ধানে ফুল আসার কথা জানিয়েছেন; তাই এই উত্তরে ক্যালেন্ডারের অনুমানের বদলে আপনার দেখা পর্যায় ধরা হয়েছে। ${riskBn || "এই পর্যায়ের কার্যকর পরিচর্যার নির্দিষ্ট নির্দেশনা উদ্ধার করা যায়নি।"}\n\n${isVerified ? `পানির তথ্য: ${localizedFieldValue}` : "ফুল আসার পর্যায়ে সেচের নির্দিষ্ট গভীরতা বা পরিমাণের নির্ভুল বাংলা নির্দেশনা নেই; তাই কোনো মাত্রা বলছি না।"} জমিতে পানি জমে আছে কি না দেখে স্থানীয় DAE কর্মকর্তার সঙ্গে প্রয়োজন মিলিয়ে নিন; উৎসে নেই এমন সার/পানির মাত্রা প্রয়োগ করবেন না.`
        : `You reported that the rice is flowering, so this answer uses your field observation rather than a calendar estimate. ${risk ? `The BAMIS ${calendar.district} calendar for ${calendar.nameEn} notes at this stage: ${risk}` : "No stage-specific field instruction was retrieved."}\n\nWater guidance: ${isVerified ? field.value : "A verified irrigation depth or quantity for flowering was not available, so no rate is given."} Check the field before irrigating; do not add water or fertilizer at an unsupported rate.`;
      if (estimatedStage && !/flower|ফুল|panicle_flowering/i.test(estimatedStage)) {
        answer += bn
          ? `\n\nআপনার দেখা ফুল আসার পর্যায়টি গ্রহণ করেছি। রোপণের তারিখভিত্তিক BAMIS ক্যালেন্ডারের অনুমান (${estimatedStage}) মাঠের পর্যায়ের সঙ্গে নাও মিলতে পারে।`
          : `\n\nI used your observed flowering stage. The planting-date-based BAMIS calendar estimate (${estimatedStage}) may differ from the field.`;
      }
      sources.push("BAMIS / Department of Agricultural Extension");
      provenance.push(...(calendar.officialSources || []));
      sources.push("Agricultural Information Service (AIS), DAE");
      provenance.push("AIS: Rice water-saving irrigation technology; supplementary irrigation during drought at Aman flowering: https://ais.gov.bd/pages/krishi-kotha/%E0%A6%A7%E0%A6%BE%E0%A6%A8-%E0%A6%9A%E0%A6%BE%E0%A6%B7%E0%A7%87-%E0%A6%AA%E0%A6%BE%E0%A6%A8%E0%A6%BF-%E0%A6%B8%E0%A6%BE%E0%A6%B6%E0%A7%8D%E0%A6%B0%E0%A7%9F%E0%A7%80-%E0%A6%B8%E0%A7%87%E0%A6%9A-%E0%A6%AA%E0%A7%8D%E0%A6%B0%E0%A6%AF%E0%A7%81%E0%A6%95%E0%A7%8D%E0%A6%A4%E0%A6%BF-072cec-6922d94fdbfbab28ce04b1e8");
      if (isVerified) sources.push(...sourceOrganizationsFor(field, knowledge).map((source) => source.organization));
      limitations.push("Calendar stage is an estimate; farmer-reported flowering stage was treated as the observed stage. Stage water amount is not an irrigation-depth prescription.");
    } else {
      answer = bn ? "আপনি ধানে ফুল আসার কথা বলেছেন, কিন্তু ফসল/মৌসুম বা জেলা নিশ্চিত নয়। কোন ধানের জাত ও কোন জেলা? এগুলো জানালে সংশ্লিষ্ট যাচাইকৃত নির্দেশনা মিলিয়ে বলব।" : "You reported flowering, but the rice season/variety or district is unclear. Which rice variety and district? I can then check the relevant verified guidance.";
      limitations.push("Clarification is needed to select an applicable official crop calendar.");
    }
  } else if (isVerified) {
    const fieldSources = sourceOrganizationsFor(field, knowledge);
    sources.push(...fieldSources.map((source) => source.organization));
    provenance.push(...fieldSources.map((source) => `${source.title}: ${source.url}`));
    answer = bn
      ? `${crop?.nameBn || "ফসল"}-এর ${intent === "irrigation_management" ? "পানি ব্যবস্থাপনা" : intent === "fertilizer_management" ? "সার ব্যবস্থাপনা" : intent === "harvesting" ? "কর্তনের সময়" : "বৃদ্ধির তথ্য"} সম্পর্কে যাচাইকৃত রেফারেন্সে বলা হয়েছে: ${localizedFieldValue}${field.unitBn ? ` (${field.unitBn})` : ""}।\n\nএটি উৎসে থাকা সাধারণ নির্দেশনা; আপনার জমির মাটি পরীক্ষা বা স্থানীয় অবস্থা অনুযায়ী আলাদা সুপারিশ নয়। আগে প্রয়োগ করা সার/পানি ও জমির অবস্থা মিলিয়ে নিন; প্রয়োজনে স্থানীয় DAE কর্মকর্তার পরামর্শ নিন।`
      : `The verified reference for ${crop?.nameEn || "the crop"} ${intent === "irrigation_management" ? "water management" : intent === "fertilizer_management" ? "fertilizer management" : intent === "harvesting" ? "harvest timing" : "growth"} says: ${field.value}${field.unit ? ` (${field.unit})` : ""}.\n\nThis is general source guidance, not a field-specific prescription based on your soil test. Check what has already been applied and the field conditions; consult a local DAE officer if needed.`;
    limitations.push("General crop reference; applicability depends on season, variety, district, soil test, and previous applications.");
  } else {
    if (fieldVerified && bn) {
      const fieldSources = sourceOrganizationsFor(field, knowledge);
      sources.push(...fieldSources.map((source) => source.organization));
      provenance.push(...fieldSources.map((source) => `${source.title}: ${source.url}`));
      answer = `${crop?.nameBn || "এই ফসল"}-এর বিষয়ে যাচাইকৃত উৎসের তথ্য আছে, তবে তার নির্ভুল বাংলা অনুবাদ এই সিস্টেমে সংরক্ষিত নেই। ভুলভাবে অনুবাদ করে মাত্রা বা সময় বলছি না। নিচের উৎস দেখুন অথবা স্থানীয় DAE কর্মকর্তার সঙ্গে মিলিয়ে নিন।`;
      limitations.push("Verified English reference exists, but a reviewed Bangla translation is unavailable.");
      return { answer, language, sources: [...new Set(sources)], dataDate: null, dataQuality: "verified_translation_unavailable", provenance: [...new Set(provenance)], limitations, conversationId, meta: { model: "intent-grounded-crop-retrieval", toolsCalled: [] } };
    }
    answer = bn
      ? `${crop?.nameBn || "এই ফসল"}-এর জন্য ${intent === "fertilizer_management" ? "সারের মাত্রা" : intent === "irrigation_management" ? "সেচের নির্দিষ্ট মাত্রা" : intent === "harvesting" ? "কর্তনের উপযুক্ত সময়" : "পর্যায়ভিত্তিক পরিচর্যার"} নির্ভরযোগ্য, যাচাইকৃত তথ্য পাওয়া যায়নি। অনুমান করে মাত্রা বা সময় বলছি না। জাত, জেলা ও মাঠের বর্তমান অবস্থা জানালে প্রযোজ্য সরকারি উৎস খুঁজে মিলিয়ে দেখা যাবে।`
      : `No reliable verified ${intent === "fertilizer_management" ? "fertilizer rate" : intent === "irrigation_management" ? "irrigation amount" : intent === "harvesting" ? "harvest timing" : "stage-specific care"} was retrieved for ${crop?.nameEn || "this crop"}. I will not guess a rate or date. Share the variety, district, and field conditions so applicable official guidance can be checked.`;
    limitations.push("Relevant verified agronomic value unavailable; no estimate provided.");
  }
  return {
    answer, language, sources: [...new Set(sources)], dataDate: null,
    dataQuality: sources.length ? "source_linked_guidance" : "verified_information_unavailable",
    provenance: [...new Set(provenance)], limitations,
    conversationId, meta: { model: "intent-grounded-crop-retrieval", toolsCalled: [] },
  };
}

function buildCropCoverageNotice(crop, message, district) {
  const isBangla = isBanglaMessage(message);
  const verifiedNames = loadCropCatalog().crops.filter((item) => item.planningAvailable)
    .map((item) => isBangla ? item.nameBn : item.nameEn).join(isBangla ? "، " : ", ");
  const districtLabel = district ? (isBangla ? `${district} জেলার ` : ` in ${district} district`) : "";
  const answer = isBangla
    ? `${crop.nameBn} ফসলের ${districtLabel}যাচাইকৃত কৃষি পরিকল্পনার তথ্য নেই। ফসলটি ক্যাটালগে আছে, কিন্তু স্থানভিত্তিক সরকারি চাষের ক্যালেন্ডার ও সুপারিশ যাচাই করা হয়নি।\n\nযাচাইকৃত পঞ্জিকা আছে: ${verifiedNames}। যাচাই শেষ না হওয়া পর্যন্ত চাষের সময়, পানির চাহিদা বা সারের মাত্রা অনুমান করে দেওয়া হবে না।`
    : `There is no verified agronomic planning data for ${crop.nameEn}${districtLabel}. The crop is listed in our catalog, but its location-specific official calendar and recommendations have not been verified.\n\nVerified crop calendars are available for: ${verifiedNames}. Planting dates, water needs, and fertilizer rates will not be guessed while verification is pending.`;
  return {
    answer,
    language: isBangla ? "bn" : "en",
    sources: ["KrishiBondhu Crop Catalog", "BAMIS Crop Weather Calendar"],
    dataDate: loadCropCatalog().metadata.catalogReviewedOn,
    dataQuality: "crop_catalog_only",
    provenance: ["Crop catalog entry; no verified crop calendar for this crop"],
    limitations: ["Crop planning uses only official crop calendars verified for the selected district."],
  };
}

function isGeneralHelpOrGreeting(message) {
  if (!message || typeof message !== "string") return false;
  const msg = message.toLowerCase().trim();
  return (
    /^hello\b/i.test(msg) ||
    /^hi\b/i.test(msg) ||
    /^hey\b/i.test(msg) ||
    /how can you help/i.test(msg) ||
    /help/i.test(msg) ||
    /সাহায্য/i.test(msg) ||
    /নমস্কার/i.test(msg) ||
    /সালাম/i.test(msg)
  );
}

function isWebsiteHelpQuestion(message) {
  const text = String(message || "").toLowerCase();
  return /\b(website|web site|site|app|page|feature|menu|sidebar|dashboard|crop rotation|rotation planner|handoff|crop calendar|data sources|soil moisture page|interactive map|settings|login|register|sign in|how to use|where can i find|where is)\b/i.test(text) ||
    /(ওয়েবসাইট|ওয়েবসাইট|সাইট|পেজ|ফিচার|মেনু|সাইডবার|ড্যাশবোর্ড|আমার খামার পেজ|ফসল পরিকল্পনা পেজ|ক্যালেন্ডার পেজ|তথ্যসূত্র পেজ|সেটিংস পেজ|কোথায় পাব|কোথায় পাব|কীভাবে ব্যবহার|কিভাবে ব্যবহার|কোথায় আছে|কোথায় আছে)/.test(text);
}

function isOwnDataRecallQuestion(message) {
  const text = String(message || "").toLowerCase();
  return /\b(my farms?|my profile|my activities|my (crop )?plans?|my saved (plans?|data|information)|my notifications?|previous chats?|past conversations?|what do you remember|what do you know about me|what information do you have about me|amar (sob|shob|all)? ?(khamar|farm|tothyo|data|kaj|plan|chat))\b/i.test(text) ||
    /(আমার (সব|সকল|আগের|সাম্প্রতিক)? ?(খামার|প্রোফাইল|তথ্য|কাজ|কৃষিকাজ|পরিকল্পনা|নোটিফিকেশন|চ্যাট|কথা)|আমার সম্পর্কে.*জানো|মনে আছে|আগের কথোপকথন)/.test(text);
}

function getAnnualRainfallMean(rainfallData) {
  const value = rainfallData?.annualHistorical?.meanAnnualTotalMm;
  return Number.isFinite(value) ? value : null;
}

// Simple in-memory conversation memory with bounded size
const conversationStore = new Map();
const MAX_CONVERSATIONS = 100;

function getConversationHistory(conversationId) {
  if (!conversationId) return [];
  const session = conversationStore.get(conversationId);
  return session ? session.history : [];
}

function updateConversationHistory(conversationId, userText, assistantText) {
  if (!conversationId) return;
  let session = conversationStore.get(conversationId);
  if (!session) {
    if (conversationStore.size >= MAX_CONVERSATIONS) {
      const oldestKey = conversationStore.keys().next().value;
      conversationStore.delete(oldestKey);
    }
    session = { history: [], lastActive: Date.now() };
    conversationStore.set(conversationId, session);
  }
  session.history.push({ role: "user", parts: [{ text: userText }] });
  session.history.push({ role: "model", parts: [{ text: assistantText }] });
  // Keep the recent 10 exchanges available without sending an unbounded transcript.
  if (session.history.length > 20) {
    session.history = session.history.slice(-20);
  }
  session.lastActive = Date.now();
}

/**
 * Deterministic local fallback generator when Gemini API is unavailable or unconfigured.
 * Strictly uses real data from toolExecutors with zero hallucination.
 */
async function generateDeterministicFallback({ message, district, crop = null, farmId = null, userId = null }) {
  const normMessage = message.toLowerCase();
  const validDistrict = VALID_DISTRICT_CODES.has(district?.toLowerCase()) ? district.toLowerCase() : null;
  if (!validDistrict && !farmId && requiresVerifiedDistrict(message) && !isGeneralHelpOrGreeting(message)) {
    const language = isBanglaMessage(message) ? "bn" : "en";
    return {
      answer: language === "bn" ? "এই জেলার জন্য যাচাইকৃত তথ্য নেই। কুমিল্লা বা চট্টগ্রাম নির্বাচন করুন।" : "Verified data is available only for Cumilla and Chattogram. Select a supported district to continue.",
      sources: ["KrishiBondhu Supported District Registry"], dataDate: null, dataQuality: "district_unsupported", provenance: [],
      limitations: ["No district data was requested or used."], language, modelUsed: "deterministic-grounded-engine",
    };
  }
  if (!validDistrict && !farmId && !isGeneralHelpOrGreeting(message)) {
    const language = isBanglaMessage(message) ? "bn" : "en";
    return {
      answer: language === "bn"
        ? "এই জেলার জন্য যাচাইকৃত তথ্য নেই। কুমিল্লা বা চট্টগ্রাম নির্বাচন করুন।"
        : "Verified data is available only for Cumilla and Chattogram. Select a supported district to continue.",
      sources: ["KrishiBondhu Supported District Registry"],
      dataDate: null,
      dataQuality: "district_unsupported",
      provenance: [],
      limitations: ["No district data was requested or used."],
      language,
      modelUsed: "deterministic-grounded-engine",
    };
  }
  const executedTools = [];
  let answer = "";
  const sources = [];
  let dataDate = null;
  let dataQuality = "unknown";
  let language = "bn";
  const provenance = [];
  const limitations = [];

  // Cross-source environmental questions use the shared Python evidence report,
  // including when Gemini is unavailable.
  const asksForCombinedReport = /\b(all|together|overall|combined|complete)\b.*\b(nasa|farm|environment|satellite|data|analysis|report)\b|\b(nasa|farm|environment|satellite)\b.*\b(analysis|report|together|all data)\b/i.test(normMessage) ||
    /(সব|একসাথে|সম্মিলিত|সামগ্রিক).{0,50}(নাসা|স্যাটেলাইট|উপাত্ত|তথ্য|খামার|বিশ্লেষণ)|খামার.{0,40}(বিশ্লেষণ|অবস্থা|উপাত্ত)/.test(message);
  if (asksForCombinedReport) {
    language = isBanglaMessage(message) ? "bn" : "en";
    const report = await toolExecutors.getUnifiedFarmAnalysis({ district: validDistrict, farmId, crop, userId });
    executedTools.push({ toolName: "getUnifiedFarmAnalysis", result: report });
    sources.push("NASA GPM IMERG", "NASA SMAP", "NASA MODIS", "NASA POWER", "KrishiBondhu Python NumPy Evidence Analysis");
    if (report.error) {
      dataQuality = "unavailable";
      answer = language === "bn"
        ? "এই জেলার জন্য একসাথে যাচাইকৃত NASA বিশ্লেষণ করা যাচ্ছে না। কুমিল্লা বা চট্টগ্রাম নির্বাচন করুন।"
        : "A combined verified NASA report is unavailable for this district. Select Cumilla or Chattogram.";
    } else {
      const e = report.evidence || {};
      const dateText = (value) => value || (language === "bn" ? "তারিখ পাওয়া যায়নি" : "date unavailable");
      const unavailable = language === "bn" ? "যাচাইকৃত তথ্য নেই" : "no verified observation";
      const gpm = e.gpm?.status === "available"
        ? (language === "bn" ? `${e.gpm.dailyTotalMm} মিমি, ${dateText(e.gpm.observationDate)} (৪৮/৪৮ ব্যবধান)` : `${e.gpm.dailyTotalMm} mm on ${dateText(e.gpm.observationDate)} (48/48 intervals)`)
        : (language === "bn" ? `দৈনিক মোট প্রকাশ করা হয়নি (${e.gpm?.validIntervals || 0}/48 বৈধ ব্যবধান)` : `daily total withheld (${e.gpm?.validIntervals || 0}/48 valid intervals)`);
      const smap = e.smap?.status === "available"
        ? (language === "bn" ? `${e.smap.surfaceSoilMoisture} ${e.smap.unit || "m³/m³"}, ${dateText(e.smap.observationDate)}` : `${e.smap.surfaceSoilMoisture} ${e.smap.unit || "m³/m³"}, ${dateText(e.smap.observationDate)}`)
        : unavailable;
      const modis = e.modis?.status === "available"
        ? `NDVI ${e.modis.ndvi ?? unavailable}, EVI ${e.modis.evi ?? unavailable}, ${dateText(e.modis.observationDate)}`
        : unavailable;
      const power = e.power?.status === "available"
        ? (language === "bn" ? `${e.power.meanAnnualRainfallMm} মিমি বার্ষিক গড় (২০০১–২০২৫)` : `${e.power.meanAnnualRainfallMm} mm mean annual rainfall (2001–2025)`)
        : unavailable;
      dataDate = report.meta?.latestSatelliteDateRange?.latest || "2001-2025";
      dataQuality = report.meta?.status || "partial_evidence";
      provenance.push(`Python NumPy ${report.meta?.formulaVersion || "deterministic report"}`);
      limitations.push(...(report.cautions || []));
      answer = language === "bn"
        ? `উপলভ্য উপাত্তের সারাংশ (${report.meta?.district || validDistrict}):\n• NASA GPM বৃষ্টিপাত: ${gpm}\n• NASA SMAP উপরিভাগের আর্দ্রতা (০–৫ সেমি): ${smap}\n• NASA MODIS উদ্ভিদের সবুজত্ব: ${modis}\n• NASA POWER ঐতিহাসিক বৃষ্টিপাত: ${power}\n\nএই মানগুলো ভিন্ন তারিখ ও আঞ্চলিক গ্রিড থেকে এসেছে; এগুলো খামারের সরাসরি মাপ নয়। সেচ বা বপনের সিদ্ধান্তের আগে জমির মাটি পরীক্ষা করুন এবং ফসলভিত্তিক পরামর্শের জন্য ফসল ও বর্তমান পর্যায় জানান।`
        : `Available evidence for ${report.meta?.district || validDistrict}:\n• NASA GPM rainfall: ${gpm}\n• NASA SMAP surface moisture (0–5 cm): ${smap}\n• NASA MODIS vegetation greenness: ${modis}\n• NASA POWER historical rainfall: ${power}\n\nThese values come from different dates and regional grids, not direct farm measurements. Check field soil before irrigation or sowing. Share the crop and its current stage for crop-specific guidance.`;
    }
    return { answer, executedTools, sources, dataDate, dataQuality, provenance, limitations, language, modelUsed: "python-numpy-farm-report" };
  }

  const intent = detectAgriculturalIntent(message);
  let mentionedCrop = findCropInMessage(message, crop);
  if (intent.category === "market_price") {
    const riceCodes = new Set(["monsoon_aman", "boro_rice", "aus_rice"]);
    const commodity = riceCodes.has(mentionedCrop?.code || crop) ? "rice" : mentionedCrop?.code || crop || "rice";
    const quote = await toolExecutors.getMarketPriceReference({
      commodity,
      district: validDistrict || "",
      priceType: "wholesale",
    });
    executedTools.push({ toolName: "getMarketPriceReference", result: quote });
    language = isBanglaMessage(message) ? "bn" : "en";
    const commodityLabel = mentionedCrop
      ? (language === "bn" ? mentionedCrop.nameBn : mentionedCrop.nameEn)
      : language === "bn" ? "ধান" : "rice";
    sources.push("Department of Agricultural Marketing (DAM)");
    dataQuality = quote.status === "AVAILABLE" ? "verified_market_data" : "verified_market_data_unavailable";
    provenance.push("DAM actual reports are shown only when imported and administrator-verified.");
    const actual = Object.values(quote.actualPrices || {}).find((item) => item.status === "AVAILABLE");
    if (actual) {
      dataDate = actual.observedOn;
      answer = language === "bn"
        ? `${commodityLabel}-এর জন্য DAM-এর যাচাইকৃত পাইকারি প্রতিবেদনে ${actual.district || actual.market || "নির্বাচিত এলাকায়"} ${actual.observedOn} তারিখে ${actual.priceMin}–${actual.priceMax} ${actual.unit} পাওয়া গেছে। এটি প্রতিবেদনভিত্তিক দর, লাইভ দর নয়।\nসূত্র: ${actual.source}${actual.sourceUrl ? ` — ${actual.sourceUrl}` : ""}`
        : `The verified DAM wholesale report lists ${actual.priceMin}–${actual.priceMax} ${actual.unit} for ${commodityLabel} in ${actual.district || actual.market || "the selected area"} on ${actual.observedOn}. This is a report observation, not a live quote.\nSource: ${actual.source}${actual.sourceUrl ? ` — ${actual.sourceUrl}` : ""}`;
      sources.push(actual.source);
      if (actual.sourceUrl) provenance.push(actual.sourceUrl);
    } else {
      answer = language === "bn"
        ? `${commodityLabel}-এর আজকের যাচাইকৃত বাজারদর এই এলাকার জন্য পাওয়া যায়নি। সিস্টেমে DAM-এর লাইভ ফিড সংযুক্ত নেই, তাই কোনো দাম অনুমান করে বলছি না। DAM-এর দৈনিক প্রতিবেদন দেখুন: ${quote.officialDailyReportUrl || "https://market.dam.gov.bd/market_daily_price_report/?L=E"}`
        : `No verified current ${commodityLabel} quote is available for this area. A live DAM feed is not connected, so I will not estimate a price. Check the DAM daily report: ${quote.officialDailyReportUrl || "https://market.dam.gov.bd/market_daily_price_report/?L=E"}`;
      limitations.push(quote.message || "No fresh verified DAM quote was retrieved.");
    }
    return { answer, executedTools, sources, dataDate, dataQuality, provenance, limitations, language, modelUsed: "verified-market-retrieval" };
  }

  let reportedStageLifecycle = null;
  const cropIntent = ["flowering_stage", "fertilizer_management", "irrigation_management", "pest_disease", "weed_management", "soil_management", "harvesting", "crop_growth_stage"].includes(intent.category);
  if (farmId && cropIntent && (!mentionedCrop || !mentionedCrop.code)) {
    reportedStageLifecycle = await toolExecutors.getMyFarmLifecycle({ farmId, userId });
    executedTools.push({ toolName: "getMyFarmLifecycle", result: reportedStageLifecycle });
    if ((!mentionedCrop || !mentionedCrop.code) && !reportedStageLifecycle.error) mentionedCrop = getCropByCode(reportedStageLifecycle.cropCode) || mentionedCrop;
  }
  if (mentionedCrop && cropIntent
    && !(intent.category === "crop_growth_stage" && !intent.farmerReportedStage && farmId)) {
    const knowledge = await toolExecutors.getCropKnowledge({ crop: mentionedCrop.code, farmId, userId });
    executedTools.push({ toolName: "getCropKnowledge", result: knowledge });
    let calendar = null;
    if (intent.category === "flowering_stage" && VALID_DISTRICT_CODES.has(validDistrict) && mentionedCrop.calendarAvailable) {
      calendar = await toolExecutors.getCropCalendarAdvisory({ crop: mentionedCrop.code, district: validDistrict, stage: "flowering" });
      executedTools.push({ toolName: "getCropCalendarAdvisory", result: calendar });
    }
    const estimatedStage = reportedStageLifecycle?.currentStage?.stageNameBn || reportedStageLifecycle?.currentStage?.stageNameEn || null;
    const grounded = buildIntentCropFallback({ intent: intent.category, reportedStage: intent.farmerReportedStage, crop: mentionedCrop, knowledge, calendar, estimatedStage, message, conversationId: null });
    return { ...grounded, executedTools, modelUsed: "intent-grounded-crop-retrieval" };
  }

  // Farm-aware contextual fallback if farmId is provided
  if (farmId) {
    if (
      normMessage.includes("কাজ") ||
      normMessage.includes("কার্যক্রম") ||
      normMessage.includes("টাস্ক") ||
      normMessage.includes("task") ||
      normMessage.includes("activity") ||
      normMessage.includes("করণীয়") ||
      normMessage.includes("reminder") ||
      normMessage.includes("due date")
    ) {
      const actData = await toolExecutors.getMyFarmActivities({ farmId, userId });
      executedTools.push({ toolName: "getMyFarmActivities", result: actData });
      language = isBanglaMessage(message) ? "bn" : "en";

      if (actData.error) {
        answer = language === "bn"
          ? "আপনার খামারের কার্যক্রম এখন পাওয়া যাচ্ছে না। পরে আবার চেষ্টা করুন।"
          : "Your farm activities are currently unavailable. Please try again later.";
      } else {
        const pending = actData.activities.filter((a) => a.status === "PENDING" || a.status === "IN_PROGRESS");
        sources.push("KrishiBondhu Farm Activity Tracker");
        sources.push("DAE & BAMIS Official Crop Calendar Schedule");
        dataQuality = "verified";
        provenance.push("My Farm Operational Registry");

        if (pending.length === 0) {
          answer = language === "bn"
            ? `আপনার খামার "${actData.farmName}"-এর জন্য বর্তমানে কোনো বকেয়া বা অপেক্ষমাণ কাজ নেই।`
            : `There are no pending or in-progress activities for your farm "${actData.farmName}".`;
        } else {
          const taskList = pending
            .slice(0, 5)
            .map((t, idx) => language === "bn"
              ? `${idx + 1}. ${t.title} (নির্ধারিত তারিখ: ${t.scheduledDate || "উল্লেখ নেই"}, অবস্থা: ${t.status === "IN_PROGRESS" ? "চলমান" : "অপেক্ষমাণ"})`
              : `${idx + 1}. ${t.title} (due: ${t.scheduledDate || "not specified"}, status: ${t.status === "IN_PROGRESS" ? "in progress" : "pending"})`)
            .join("\n");
          answer = language === "bn"
            ? `আপনার খামার "${actData.farmName}"-এর অপেক্ষমাণ কাজ:\n${taskList}\n\nকাজ সম্পন্ন হলে নিজে থেকে অবস্থা হালনাগাদ করুন।`
            : `Pending activities for your farm "${actData.farmName}":\n${taskList}\n\nUpdate an activity yourself after completing it.`;
        }
      }
      return {
        answer,
        executedTools,
        sources,
        dataDate,
        dataQuality,
        provenance,
        limitations: [language === "bn" ? "তালিকাটি সংরক্ষিত খামার কার্যক্রম থেকে এসেছে; এটি মাঠের বর্তমান অবস্থা যাচাই করে না।" : "This list comes from saved farm activities and does not verify current field conditions."],
        language,
        modelUsed: "deterministic-farm-grounded-engine",
      };
    }

    if (intent.category === "crop_growth_stage" && !intent.farmerReportedStage) {
      const lifeData = await toolExecutors.getMyFarmLifecycle({ farmId, userId });
      executedTools.push({ toolName: "getMyFarmLifecycle", result: lifeData });
      language = isBanglaMessage(message) ? "bn" : "en";

      if (lifeData.error) {
        answer = language === "bn"
          ? "আপনার খামারের ফসলের পর্যায় এখন নির্ধারণ করা যাচ্ছে না। রোপণের তারিখ ও ফসলের তথ্য যাচাই করুন।"
          : "The crop stage for your farm cannot currently be determined. Check the planting date and crop details.";
      } else {
        sources.push("BAMIS Agro-Meteorological Crop Calendar");
        dataQuality = "verified";
        provenance.push(lifeData.provenance?.publisher || "BAMIS & DAE Official Crop Calendar");

        const cur = lifeData.currentStage;
        const nxt = lifeData.nextStage;
        const days = Number.isFinite(lifeData.daysSincePlanting) ? lifeData.daysSincePlanting : null;
        answer = language === "bn"
          ? `আপনার খামার "${lifeData.farmName}"-এর ফসলের পর্যায় (ক্যালেন্ডারভিত্তিক অনুমান):\n` +
            `- ফসল: ${lifeData.cropName || "উল্লেখ নেই"}${lifeData.season ? ` (${lifeData.season})` : ""}\n` +
            `- রোপণের তারিখ: ${lifeData.plantingDate || "উল্লেখ নেই"}\n` +
            `- রোপণের পর দিন: ${days == null ? "নির্ধারণ করা যায়নি" : `${days} দিন`}\n` +
            (cur ? `- বর্তমান পর্যায়: ${cur.stageNameBn || cur.stageNameEn}\n  - আনুমানিক তারিখ: ${cur.estimatedStartDate || "উল্লেখ নেই"} থেকে ${cur.estimatedEndDate || "উল্লেখ নেই"}\n` : "- বর্তমান পর্যায় নির্ধারণ করা যায়নি।\n") +
            (nxt ? `- পরবর্তী পর্যায়: ${nxt.stageNameBn || nxt.stageNameEn} (আনুমানিক ${nxt.estimatedStartDate || "তারিখ নেই"})\n` : "") +
            "\nতারিখগুলো ক্যালেন্ডারভিত্তিক অনুমান; মাঠের ফসল দেখে মিলিয়ে নিন।"
          : `Crop stage for your farm "${lifeData.farmName}" (calendar-based estimate):\n` +
            `- Crop: ${lifeData.cropName || "not specified"}${lifeData.season ? ` (${lifeData.season})` : ""}\n` +
            `- Planting date: ${lifeData.plantingDate || "not specified"}\n` +
            `- Days since planting: ${days == null ? "unavailable" : days}\n` +
            (cur ? `- Current stage: ${cur.stageNameEn || cur.stageNameBn}\n  - Estimated dates: ${cur.estimatedStartDate || "not specified"} to ${cur.estimatedEndDate || "not specified"}\n` : "- Current stage could not be determined.\n") +
            (nxt ? `- Next stage: ${nxt.stageNameEn || nxt.stageNameBn} (estimated ${nxt.estimatedStartDate || "date unavailable"})\n` : "") +
            "\nDates are calendar-based estimates; compare them with the crop in the field.";

        const cropGuide = await toolExecutors.getCropKnowledge({
          crop: lifeData.cropCode || crop,
          variety: lifeData.variety,
          farmId,
          userId,
        });
        executedTools.push({ toolName: "getCropKnowledge", result: cropGuide });
        const varietyGuide = cropGuide.selectedVarietyGuide;
        if (varietyGuide?.facts && varietyGuide.source?.url) {
          const facts = varietyGuide.facts;
          const currentDays = days;
          const split = facts.ureaSplits?.find((item) =>
            Array.isArray(item.daysAfterTransplanting)
              ? currentDays != null && currentDays >= Number(item.daysAfterTransplanting[0]) && currentDays <= Number(item.daysAfterTransplanting[1])
              : false,
          );
          const rates = facts.fertilizerKgPerBigha;
          const careBn = [
            `\n\n${varietyGuide.varietyName}–এর যাচাইকৃত পরিচর্যা তথ্য (${varietyGuide.source.organization}):`,
            split ? `- ${currentDays} দিনের সঙ্গে মেলে: রোপণের ${split.daysAfterTransplanting[0]}–${split.daysAfterTransplanting[1]} দিনের মধ্যে ইউরিয়ার ${split.split === 1 ? "প্রথম" : split.split === 2 ? "দ্বিতীয়" : "তৃতীয়"} কিস্তি দেওয়ার সময়। আগের কিস্তি দেওয়া হয়েছে কি না আগে মিলিয়ে নিন।` : "",
            rates ? `- উৎসে দেওয়া রেফারেন্স মাত্রা প্রতি বিঘায়: ইউরিয়া ${rates.urea} কেজি, টিএসপি/ডিএপি ${rates.tspOrDap} কেজি, এমওপি ${rates.mop} কেজি ও জিপসাম ${rates.gypsum} কেজি।` : "",
            facts.weedManagement?.bn ? `- আগাছা দমনে: ${facts.weedManagement.bn}` : "",
            facts.irrigation?.bn ? `- পানি: ${facts.irrigation.bn}` : "",
            `- এই মাত্রা মাটির পরীক্ষাভিত্তিক ব্যক্তিগত সুপারিশ নয়। মাটি পরীক্ষা ও স্থানীয় কৃষি কর্মকর্তার পরামর্শ মিলিয়ে নিন।\nসূত্র: ${varietyGuide.source.title} (${varietyGuide.source.checkedOn}), ${varietyGuide.source.url}`,
          ].filter(Boolean).join("\n");
          const careEn = [
            `\n\nVerified care notes for ${varietyGuide.varietyName} (${varietyGuide.source.organization}):`,
            split ? `- At ${currentDays} days, the ${split.split === 1 ? "first" : split.split === 2 ? "second" : "third"} urea split falls in the ${split.daysAfterTransplanting[0]}–${split.daysAfterTransplanting[1]} day-after-transplanting window. Confirm earlier doses before applying.` : "",
            rates ? `- The source's reference rate per bigha is: urea ${rates.urea} kg, TSP/DAP ${rates.tspOrDap} kg, MOP ${rates.mop} kg, and gypsum ${rates.gypsum} kg.` : "",
            facts.weedManagement?.en ? `- Weed management: ${facts.weedManagement.en}` : "",
            facts.irrigation?.en ? `- Water: ${facts.irrigation.en}` : "",
            `- These are not an individualized soil-test prescription. Check soil-test results and local extension advice.\nSource: ${varietyGuide.source.title} (${varietyGuide.source.checkedOn}), ${varietyGuide.source.url}`,
          ].filter(Boolean).join("\n");
          answer += language === "bn" ? careBn : careEn;
          sources.push(varietyGuide.source.organization);
          provenance.push(varietyGuide.source.url);
          dataQuality = "verified_variety_guidance";
        }
      }
      return {
        answer,
        executedTools,
        sources,
        dataDate,
        dataQuality,
        provenance,
        limitations: [language === "bn" ? "পর্যায় ও তারিখ ক্যালেন্ডারভিত্তিক অনুমান; এগুলো মাঠ পর্যবেক্ষণের বিকল্প নয়।" : "Stages and dates are calendar-based estimates, not a substitute for field observation."],
        language,
        modelUsed: "deterministic-farm-grounded-engine",
      };
    }

    if (
      normMessage.includes("পরিবেশ") ||
      normMessage.includes("আর্দ্রতা") ||
      normMessage.includes("সবুজতা") ||
      normMessage.includes("স্যাটেলাইট") ||
      normMessage.includes("আবহাওয়া") ||
      normMessage.includes("environment") ||
      normMessage.includes("soil moisture") ||
      normMessage.includes("vegetation") ||
      normMessage.includes("satellite") ||
      normMessage.includes("climate") ||
      normMessage.includes("rainfall") ||
      normMessage.includes("weather") ||
      normMessage.includes("ndvi") ||
      normMessage.includes("evi")
    ) {
      const envData = await toolExecutors.getMyFarmEnvironmentalContext({ farmId, userId });
      executedTools.push({ toolName: "getMyFarmEnvironmentalContext", result: envData });
      language = isBanglaMessage(message) ? "bn" : "en";

      if (envData.error) {
        answer = language === "bn"
          ? "এই খামারের পরিবেশগত উপাত্ত এখন পাওয়া যাচ্ছে না। পরে আবার চেষ্টা করুন।"
          : "Environmental observations for this farm are currently unavailable. Please try again later.";
      } else {
        sources.push("NASA GPM IMERG Final V07", "NASA SMAP (SPL3SMP_E)", "NASA MODIS (MOD13Q1)", "NASA POWER (2001-2025)");
        dataDate = envData.environmentalContext?.precipitation?.observationDate || envData.environmentalContext?.soilMoistureSurface?.date || null;
        dataQuality = "grounded";
        provenance.push("NASA Earth Science Data Systems");
        limitations.push(envData.scientificSafeguards.rootZoneDisclaimer);
        limitations.push(envData.scientificSafeguards.vegetationDisclaimer);
        limitations.push(envData.scientificSafeguards.rainfallDisclaimer);

        const sm = envData.environmentalContext?.soilMoistureSurface;
        const veg = envData.environmentalContext?.vegetationIndex;
        const clim = envData.environmentalContext?.climateBaseline;
        const gpm = envData.environmentalContext?.precipitation;
        const dailyRain = gpm?.dailySummary;
        const smValue = Number.isFinite(sm?.soilMoisture) ? sm.soilMoisture.toFixed(4) + " m³/m³" : language === "bn" ? "উপাত্ত অনুপলব্ধ" : "unavailable";
        const smQuality = sm?.retrievalQualityFlag ?? (language === "bn" ? "অজানা" : "unknown");
        const vegValue = Number.isFinite(veg?.ndvi) ? veg.ndvi.toFixed(3) : language === "bn" ? "উপাত্ত অনুপলব্ধ" : "unavailable";
        const vegEvi = Number.isFinite(veg?.evi) ? veg.evi.toFixed(3) : language === "bn" ? "উপাত্ত অনুপলব্ধ" : "unavailable";
        const climateRain = Number.isFinite(clim?.annualRainfallTotalMm) ? clim.annualRainfallTotalMm : null;
        const validIntervals = Number.isInteger(dailyRain?.validIntervals) ? dailyRain.validIntervals : null;
        const noDate = language === "bn" ? "তারিখ অনুপলব্ধ" : "date unavailable";
        const dailyRainValue = dailyRain?.completeness === "complete" && dailyRain.validIntervals === 48
          ? language === "bn" ? `${dailyRain.totalPrecipitationMm} মিমি` : `${dailyRain.totalPrecipitationMm} mm`
          : language === "bn" ? "অসম্পূর্ণ বা অনুপস্থিত; মোট প্রকাশ করা হয়নি" : "incomplete or unavailable; total withheld";
        const intervalText = validIntervals == null
          ? (language === "bn" ? "বৈধ ব্যবধানের সংখ্যা অনুপলব্ধ" : "valid interval count unavailable")
          : language === "bn" ? `${validIntervals}/48 বৈধ ব্যবধান` : `${validIntervals}/48 valid intervals`;

        answer = language === "bn"
          ? `আপনার খামার "${envData.farmName}" (${envData.district}${envData.upazila ? `, ${envData.upazila}` : ""})-এর জন্য উপলভ্য নাসা পর্যবেক্ষণ:\n` +
            `- GPM IMERG Final V07 বৃষ্টি: ${dailyRainValue}; ${dailyRain?.dateLabel || noDate}; ${intervalText}।\n` +
            `- SMAP উপরিভাগের আর্দ্রতা (০–৫ সেমি): ${smValue}; ${sm?.date || noDate}; মান পতাকা ${smQuality}, গুণমান ${sm?.qualityClassification || "অজানা"}।\n` +
            `- MODIS উদ্ভিদ সূচক: NDVI ${vegValue}, EVI ${vegEvi}; ${veg?.date || noDate}; গুণমান ${veg?.qualityClassification || "অজানা"}।\n` +
            `- NASA POWER ঐতিহাসিক জলবায়ু: বার্ষিক বৃষ্টির মান ${climateRain == null ? "উপাত্ত অনুপলব্ধ" : `${climateRain} মিমি`}। এটি লাইভ আবহাওয়া নয়।\n\n` +
            "GPM, SMAP ও MODIS আঞ্চলিক স্যাটেলাইট গ্রিডের তথ্য, খামারের সরাসরি সেন্সর নয়। SMAP মূল অঞ্চলের আর্দ্রতা দেখায় না; NDVI/EVI রোগ নির্ণয় নয়।"
          : `Available NASA observations for your farm "${envData.farmName}" (${envData.district}${envData.upazila ? `, ${envData.upazila}` : ""}):\n` +
            `- GPM IMERG Final V07 rainfall: ${dailyRainValue}; ${dailyRain?.dateLabel || noDate}; ${intervalText}.\n` +
            `- SMAP surface moisture (0–5 cm): ${smValue}; ${sm?.date || noDate}; flag ${smQuality}, quality ${sm?.qualityClassification || "unknown"}.\n` +
            `- MODIS vegetation indices: NDVI ${vegValue}, EVI ${vegEvi}; ${veg?.date || noDate}; quality ${veg?.qualityClassification || "unknown"}.\n` +
            `- NASA POWER historical climate: annual rainfall ${climateRain == null ? "unavailable" : `${climateRain} mm`}; this is not live weather.\n\n` +
            "GPM, SMAP, and MODIS are regional satellite-grid products, not direct farm sensors. SMAP does not represent root-zone moisture, and NDVI/EVI are not disease diagnoses.";
      }
      return {
        answer,
        executedTools,
        sources,
        dataDate,
        dataQuality,
        provenance,
        limitations,
        language,
        modelUsed: "deterministic-farm-grounded-engine",
      };
    }

    if (
      normMessage.includes("খামার") ||
      normMessage.includes("জমি") ||
      normMessage.includes("বিবরণ") ||
      normMessage.includes("ফার্ম") ||
      normMessage.includes("farm")
    ) {
      const farmData = await toolExecutors.getMyFarmDetails({ farmId, userId });
      executedTools.push({ toolName: "getMyFarmDetails", result: farmData });
      language = isBanglaMessage(message) ? "bn" : "en";

      if (farmData.error) {
        answer = language === "bn"
          ? "আপনার খামারের বিবরণ এখন পাওয়া যাচ্ছে না।"
          : "Your farm details are currently unavailable.";
      } else {
        sources.push("KrishiBondhu My Farm Registry");
        dataQuality = "verified";
        provenance.push("Farmer Authenticated Profile");

        const unavailable = language === "bn" ? "উল্লেখ নেই" : "not specified";
        answer = language === "bn"
          ? `আপনার খামারের সংরক্ষিত বিবরণ:\n` +
            `- নাম: ${farmData.name || unavailable}\n` +
            `- অবস্থান: ${farmData.districtName || farmData.districtCode || unavailable}${farmData.upazila ? `, ${farmData.upazila}` : ""}\n` +
            `- ফসল: ${farmData.cropName || farmData.cropCode || unavailable}\n` +
            `- জাত: ${farmData.variety && farmData.variety !== "Not specified" ? farmData.variety : unavailable}\n` +
            `- জমির আয়তন: ${farmData.landArea == null ? unavailable : `${farmData.landArea} ${farmData.landUnit || ""}`}\n` +
            `- মাটির ধরন: ${farmData.soilType || unavailable}\n` +
            `- সেচের উৎস: ${farmData.waterSource || unavailable}\n` +
            `- রোপণের তারিখ: ${farmData.plantingDate || unavailable}`
          : `Saved details for your farm:\n` +
            `- Name: ${farmData.name || unavailable}\n` +
            `- Location: ${farmData.districtName || farmData.districtCode || unavailable}${farmData.upazila ? `, ${farmData.upazila}` : ""}\n` +
            `- Crop: ${farmData.cropName || farmData.cropCode || unavailable}\n` +
            `- Variety: ${farmData.variety && farmData.variety !== "Not specified" ? farmData.variety : unavailable}\n` +
            `- Area: ${farmData.landArea == null ? unavailable : `${farmData.landArea} ${farmData.landUnit || ""}`}\n` +
            `- Soil: ${farmData.soilType || unavailable}\n` +
            `- Water source: ${farmData.waterSource || unavailable}\n` +
            `- Planting date: ${farmData.plantingDate || unavailable}`;
      }
      return {
        answer,
        executedTools,
        sources,
        dataDate,
        dataQuality,
        provenance,
        limitations: [language === "bn" ? "তথ্যগুলো আপনার সংরক্ষিত খামার প্রোফাইল থেকে এসেছে।" : "Details come from your saved farm profile."],
        language,
        modelUsed: "deterministic-farm-grounded-engine",
      };
    }
  }

  // Weather Forecast, Alert, or Outlook queries
  if (
    normMessage.includes("পূর্বাভাস") ||
    normMessage.includes("forecast") ||
    normMessage.includes("আবহাওয়া") ||
    normMessage.includes("weather") ||
    normMessage.includes("seasonal") ||
    normMessage.includes("outlook") ||
    normMessage.includes("সাব-সিজন") ||
    normMessage.includes("মৌসুমি") ||
    normMessage.includes("মৌসুমী") ||
    normMessage.includes("সপ্তাহ") ||
    normMessage.includes("মাসিক") ||
    normMessage.includes("সতর্কতা") ||
    normMessage.includes("alert") ||
    normMessage.includes("warning") ||
    normMessage.includes("ঝড়") ||
    normMessage.includes("কালবৈশাখী") ||
    normMessage.includes("তাপদাহ") ||
    normMessage.includes("শৈত্যপ্রবাহ")
  ) {
    let targetLoc = validDistrict || "Chattogram";
    for (const div of ["dhaka", "chattogram", "sylhet", "rajshahi", "khulna", "barishal", "rangpur", "mymensingh", "cumilla"]) {
      if (normMessage.includes(div)) {
        targetLoc = div;
        break;
      }
    }

    const isBangla = isBanglaMessage(message);
    const forecastData = await toolExecutors.getLocationWeatherForecast({ location: targetLoc, farmId, userId })
      .catch(() => ({ error: "WEATHER_UNAVAILABLE", current: null, location: null }));
    const alertsData = await toolExecutors.getActiveWeatherAlerts({ location: targetLoc, crop, farmId, userId })
      .catch(() => ({ error: "WEATHER_RISK_UNAVAILABLE", overallRiskLevel: "DATA_INSUFFICIENT", alertsCount: 0, officialWarningsCount: 0, alerts: [] }));
    executedTools.push({ toolName: "getLocationWeatherForecast", result: forecastData });
    executedTools.push({ toolName: "getActiveWeatherAlerts", result: alertsData });

    const wantsWeeklyOutlook = /week|weekly|সপ্তাহ|সাব-সিজন/.test(normMessage);
    const wantsSeasonalOutlook = /season|monthly|month|মৌসুম|মাসিক/.test(normMessage);
    let weeklyOutlookData = null;
    let seasonalOutlookData = null;
    if (wantsWeeklyOutlook || wantsSeasonalOutlook) {
      const [weeklyResult, seasonalResult] = await Promise.all([
        wantsWeeklyOutlook
          ? toolExecutors.getWeeklyWeatherOutlook({ location: targetLoc, farmId, userId }).catch(() => ({ dataStatus: "DATA_UNAVAILABLE", weeklyTendencies: [] }))
          : Promise.resolve(null),
        wantsSeasonalOutlook
          ? toolExecutors.getSeasonalCropOutlook({ location: targetLoc, crop, farmId, userId }).catch(() => ({ dataStatus: "DATA_UNAVAILABLE", monthlyOutlooks: [] }))
          : Promise.resolve(null),
      ]);
      weeklyOutlookData = weeklyResult;
      seasonalOutlookData = seasonalResult;
      if (weeklyResult) {
        executedTools.push({ toolName: "getWeeklyWeatherOutlook", result: weeklyResult });
        sources.push(weeklyResult.source || "Open-Meteo Seasonal Forecast API");
        if (weeklyResult.disclaimer) limitations.push(weeklyResult.disclaimer);
      }
      if (seasonalResult) {
        executedTools.push({ toolName: "getSeasonalCropOutlook", result: seasonalResult });
        sources.push(seasonalResult.source || "Open-Meteo Seasonal Forecast API");
        if (seasonalResult.guidanceNotice) limitations.push(seasonalResult.guidanceNotice);
      }
      provenance.push("Open-Meteo Seasonal Forecast API; periods are regional outlooks, not local daily forecasts");
    }

    sources.push("Open-Meteo Weather Forecast API");
    const hasOfficialBulletins = (alertsData.officialWarningsCount > 0) ||
      (Array.isArray(alertsData.alerts) && alertsData.alerts.some(a => a.isGovernmentNotice));
    if (hasOfficialBulletins) {
      const authorities = [...new Set((alertsData.alerts || [])
        .filter(alert => alert.isGovernmentNotice && alert.issuingAuthority)
        .map(alert => alert.issuingAuthority))];
      sources.push(...(authorities.length
        ? authorities.map(authority => `Verified government warning: ${authority}`)
        : ["Verified government warnings"]));
    }

    const cur = forecastData.current;
    const locNameEn = forecastData.location?.nameEn || targetLoc;
    const locNameBn = forecastData.location?.nameBn || locNameEn;
    const alertCount = alertsData.alertsCount || 0;
    const overallRisk = alertsData.overallRiskLevel || "DATA_INSUFFICIENT";
    const isDataInsufficient = overallRisk === "DATA_INSUFFICIENT" || !cur || forecastData.error;

    dataDate = cur?.date || null;
    dataQuality = isDataInsufficient ? "insufficient_data" : "verified";
    provenance.push("Open-Meteo Forecast API (Asia/Dhaka) & KrishiBondhu agricultural risk criteria");
    if (alertsData.officialWarningsStatus === "UNAVAILABLE") {
      limitations.push(isBangla
        ? "সরকারি সতর্কতার তথ্যভান্ডার অনুপলব্ধ; কোনো বুলেটিন না ফেরাকে সতর্কতা নেই বলে ধরে নেবেন না।"
        : "Official warning store unavailable; an empty result must not be interpreted as no government warning.");
    }
    limitations.push(
      isBangla
        ? "১-৭ দিনের পূর্বাভাস সংখ্যাভিত্তিক আবহাওয়া মডেলের ওপর ভিত্তি করে তৈরি। বর্ধিত ও মৌসুমী দৃষ্টিভঙ্গিতে স্বাভাবিক অনিশ্চয়তা রয়েছে।"
        : "1–7 day forecasts are based on deterministic numerical weather prediction models; extended horizons carry elevated uncertainty."
    );

    let weatherSummary;

    if (isDataInsufficient) {
      if (isBangla) {
        weatherSummary = `**${locNameBn}-এর আবহাওয়া উপাত্ত:**\n` +
          `সতর্কতা: এই এলাকার জন্য পর্যাপ্ত আবহাওয়া পূর্বাভাস বা ঝুঁকি উপাত্ত বর্তমানে অনুপলব্ধ।\n` +
          `- সামগ্রিক কৃষি ঝুঁকি: উপাত্ত অপর্যাপ্ত (অজানা)\n` +
          `- পরিস্থিতি: প্রয়োজনীয় উপাত্তের অনুপস্থিতিতে আনুমানিক বা কাল্পনিক ঝুঁকি স্তর নির্ধারণ করা বিজ্ঞানসম্মত নয়।\n` +
          `- পরামর্শ: স্প্রে বা সেচের মতো স্পর্শকাতর কৃষিকাজ পরিচালনার আগে স্থানীয় কৃষি কর্মকর্তা বা বিশ্বস্ত আবহাওয়া পর্যবেক্ষকের পরামর্শ নিন।`;
      } else {
        weatherSummary = `**Weather Intelligence for ${locNameEn}:**\n` +
          `Unavailable: Sufficient weather forecast or agronomic risk observations are currently unavailable for this location.\n` +
          `- Overall Agricultural Risk: DATA INSUFFICIENT (UNKNOWN)\n` +
          `- Status: Risk levels and operational safety cannot be safely evaluated without verified provider observations.\n` +
          `- Guidance: Please consult local agricultural extension officers before scheduling chemical spraying or harvesting.`;
      }
    } else {
      const conditionStr = cur.conditionEn || (isBangla ? "তথ্য পাওয়া যায়নি" : "Data unavailable");
      const riskLabelBn = overallRisk === "SEVERE"
        ? "তীব্র (SEVERE)"
        : overallRisk === "HIGH"
        ? "উচ্চ (HIGH)"
        : overallRisk === "MODERATE"
        ? "মাঝারি (MODERATE)"
        : "স্বাভাবিক / কম (LOW)";
      const riskLabelEn = overallRisk;

      const hasRainMetric = typeof cur.todayRainExpectedMm === "number" && Number.isFinite(cur.todayRainExpectedMm);
      const hasRainProb = typeof cur.todayRainProbabilityPercent === "number" && Number.isFinite(cur.todayRainProbabilityPercent);
      const hasWindMetric = typeof cur.maxWindSpeedKmH === "number" && Number.isFinite(cur.maxWindSpeedKmH);

      const rainStrEn = hasRainMetric ? `${cur.todayRainExpectedMm} mm` : "Not observed";
      const rainProbStrEn = hasRainProb ? `${cur.todayRainProbabilityPercent}%` : "Not available";
      const windStrEn = hasWindMetric ? `${cur.maxWindSpeedKmH} km/h` : "Not observed";

      const rainStrBn = hasRainMetric ? `${cur.todayRainExpectedMm} মিমি` : "উপাত্ত নেই";
      const rainProbStrBn = hasRainProb ? `${cur.todayRainProbabilityPercent}%` : "অনুপলব্ধ";
      const windStrBn = hasWindMetric ? `${cur.maxWindSpeedKmH} কিমি/ঘণ্টা` : "উপাত্ত নেই";

      if (isBangla) {
        weatherSummary = `**${locNameBn}-এর আবহাওয়া পূর্বাভাস ও কৃষি সতর্কতা:**\n` +
          `- আজকের পূর্বাভাস: ${conditionStr} (সর্বোচ্চ: ${cur.temperatureMaxC}°সে, সর্বনিম্ন: ${cur.temperatureMinC}°সে)\n` +
          `- আজকের সম্ভাব্য বৃষ্টি: ${rainStrBn} (সম্ভাবনা: ${rainProbStrBn})\n` +
          `- বাতাসের গতি: ${windStrBn}\n` +
          `- সামগ্রিক কৃষি ঝুঁকি: ${riskLabelBn}\n`;

        if (alertCount > 0) {
          weatherSummary += `\n**সক্রিয় কৃষি সতর্কতা (${alertCount}টি):**\n`;
          alertsData.alerts.slice(0, 3).forEach((a, i) => {
            const sourceBadge = a.isGovernmentNotice
              ? `[যাচাইকৃত সরকারি বুলেটিন: ${a.issuingAuthority || "সরকারি কর্তৃপক্ষ"}]`
              : "[পূর্বাভাসভিত্তিক কৃষি সতর্কতা]";
            weatherSummary += `${i + 1}. ${sourceBadge} **${a.titleBn || a.title}**\n   পরামর্শ: ${a.adviceBn || a.advice}\n`;
          });
        } else {
          weatherSummary += alertsData.officialWarningsStatus === "UNAVAILABLE"
            ? `\nসরকারি সতর্কতার তথ্যভান্ডার অনুপলব্ধ; সরকারি সতর্কতা যাচাই করা যায়নি।`
            : `\nবর্তমান প্রাপ্ত ৭ দিনের পূর্বাভাসের ভিত্তিতে কোনো সক্রিয় উচ্চ বা তীব্র কৃষি আবহাওয়া সতর্কতা নেই।`;
        }

        if (alertsData.precautions && alertsData.precautions.length > 0) {
          weatherSummary += `\n**মাঠ পর্যায়ের কৃষিজ পরামর্শ:**\n` + alertsData.precautions.slice(0, 2).map(p => `- ${p}`).join("\n");
        }
      } else {
        weatherSummary = `**Weather Forecast & Agricultural Risks for ${locNameEn}:**\n` +
          `- Today's forecast: ${conditionStr} (Max: ${cur.temperatureMaxC}°C, Min: ${cur.temperatureMinC}°C)\n` +
          `- Expected Rain Today: ${rainStrEn} (Probability: ${rainProbStrEn})\n` +
          `- Peak Wind Speed: ${windStrEn}\n` +
          `- Overall Agricultural Risk: ${riskLabelEn}\n`;

        if (alertCount > 0) {
          weatherSummary += `\n**Active Weather & Risk Alerts (${alertCount}):**\n`;
          alertsData.alerts.slice(0, 3).forEach((a, i) => {
            const sourceBadge = a.isGovernmentNotice
              ? `[Verified Government Warning: ${a.issuingAuthority || "Government authority"}]`
              : "[Forecast Risk Alert]";
            weatherSummary += `${i + 1}. ${sourceBadge} **${a.title}**\n   Advice: ${a.advice}\n`;
          });
        } else {
          weatherSummary += alertsData.officialWarningsStatus === "UNAVAILABLE"
            ? `\nThe official warning store is unavailable; government warnings could not be checked.`
            : `\nNo active high or severe agricultural weather hazards indicated in the current 7-day forecast.`;
        }

        if (alertsData.precautions && alertsData.precautions.length > 0) {
          weatherSummary += `\n**Field Operational Guidance:**\n` + alertsData.precautions.slice(0, 2).map(p => `- ${p}`).join("\n");
        }
      }
    }

    const farmContext = alertsData.farmContext || forecastData.farmContext;
    if (farmContext) {
      const cropStage = farmContext.cropStage
        ? (isBangla ? farmContext.cropStage.stageNameBn : farmContext.cropStage.stageNameEn)
        : (isBangla ? "পর্যায় নির্ধারিত নয়" : "stage unavailable");
      const farmLine = isBangla
        ? `খামারভিত্তিক প্রসঙ্গ: ${farmContext.farmName || "নামহীন খামার"} · ${farmContext.upazila || ""}, ${farmContext.district || farmContext.districtCode || locNameBn}; নির্বাচিত ফসল ${farmContext.cropCode || "নির্বাচিত হয়নি"}; পর্যায় ${cropStage}${farmContext.cropStage ? " (সরকারি ক্যালেন্ডার থেকে আনুমানিক)" : ""}. আবহাওয়া আঞ্চলিক গ্রিডের তথ্য, খামার-পর্যায়ের পরিমাপ নয়।\n\n`
        : `Farm context: ${farmContext.farmName || "Unnamed farm"} · ${farmContext.upazila || ""}, ${farmContext.district || farmContext.districtCode || locNameEn}; selected crop ${farmContext.cropCode || "not selected"}; stage ${cropStage}${farmContext.cropStage ? " (estimated from the official calendar)" : ""}. Weather is regional grid data, not a farm-level measurement.\n\n`;
      weatherSummary = `${farmLine}${weatherSummary}`;
    }

    if (weeklyOutlookData || seasonalOutlookData) {
      const periodLines = [];
      if (weeklyOutlookData) {
        const available = (weeklyOutlookData.weeklyTendencies || []).filter(period => period.status === "AVAILABLE");
        periodLines.push(isBangla ? "\n৬-সপ্তাহের আঞ্চলিক দৃষ্টিভঙ্গি:" : "\nSix-week regional outlook:");
        if (!available.length) {
          periodLines.push(isBangla ? "- উপাত্ত অপ্রাপ্য; কোনো মান অনুমান করা হয়নি।" : "- Unavailable; no values were inferred.");
        } else {
          for (const week of available) {
            const rainfall = Number.isFinite(week.expectedRainfallMeanMm)
              ? `${week.expectedRainfallMeanMm} mm (${week.rainfallRangeMm?.min ?? "—"}–${week.rainfallRangeMm?.max ?? "—"} mm)`
              : (isBangla ? "বৃষ্টি অনুপলব্ধ" : "rain unavailable");
            periodLines.push(`- ${week.week}: ${rainfall}${Number.isFinite(week.expectedTempMeanC) ? `; ${week.expectedTempMeanC}°C mean` : ""}.`);
          }
        }
      }
      if (seasonalOutlookData) {
        const available = (seasonalOutlookData.monthlyOutlooks || []).filter(period => period.status === "AVAILABLE");
        periodLines.push(isBangla ? "\n১–৩ মাসের আঞ্চলিক দৃষ্টিভঙ্গি:" : "\nOne-to-three-month regional outlook:");
        if (!available.length) {
          periodLines.push(isBangla ? "- উপাত্ত অপ্রাপ্য; কোনো মান অনুমান করা হয়নি।" : "- Unavailable; no values were inferred.");
        } else {
          for (const month of available) {
            const rainfall = Number.isFinite(month.rainfallMeanMm)
              ? `${month.rainfallMeanMm} mm (${month.rainfallRangeMm?.min ?? "—"}–${month.rainfallRangeMm?.max ?? "—"} mm)`
              : (isBangla ? "বৃষ্টি অনুপলব্ধ" : "rain unavailable");
            periodLines.push(`- ${month.window}: ${rainfall}${Number.isFinite(month.temperatureMeanC) ? `; ${month.temperatureMeanC}°C mean` : ""}.`);
          }
        }
      }
      periodLines.push(isBangla
        ? "এগুলো Open-Meteo-এর আঞ্চলিক মডেল দৃষ্টিভঙ্গি; খামারভিত্তিক পূর্বাভাস বা ক্যালিব্রেটেড সম্ভাব্যতা নয়।"
        : "These are regional Open-Meteo model outlooks, not farm-level forecasts or calibrated probabilities.");
      weatherSummary += `\n${periodLines.join("\n")}`;
    }

    return {
      answer: weatherSummary,
      language: isBangla ? "bn" : "en",
      executedTools,
      sources,
      dataDate: dataDate || null,
      dataQuality,
      provenance,
      limitations,
      modelUsed: "deterministic-weather-grounded-engine",
    };
  }

  // 0. Check for Unsupported District or Crop in user query text
  const UNSUPPORTED_DISTRICTS_BN = ["রংপুর", "সিলেট", "রাজশাহী", "ঢাকা", "বরিশাল", "খুলনা", "ময়মনসিংহ", "বগুড়া", "দিনাজপুর", "যশোর", "পাবনা", "কুষ্টিয়া"];
  const UNSUPPORTED_CROPS_BN = ["গম", "ভুট্টা", "আলু", "পাট", "তুলা", "ডাল", "পেঁয়াজ"];

  const foundUnsupportedDistrict = UNSUPPORTED_DISTRICTS_BN.find((d) => normMessage.includes(d));
  const cropCatalog = loadCropCatalog();
  const pendingCrop = findCatalogOnlyCropMention(message);
  const legacyUnsupportedCrop = UNSUPPORTED_CROPS_BN.find((c) => normMessage.includes(c));
  const foundUnsupportedCrop = pendingCrop?.nameBn || legacyUnsupportedCrop;
  const asksForMarketData = isMarketQuestion(message);

  if (foundUnsupportedDistrict || (foundUnsupportedCrop && !asksForMarketData && !normMessage.includes("সরিষা") && !normMessage.includes("আমন") && !normMessage.includes("বোরো") && !normMessage.includes("আউশ"))) {
    const isBangla = isBanglaMessage(message);
    const verifiedNames = cropCatalog.crops.filter((item) => item.planningAvailable)
      .map((item) => isBangla ? item.nameBn : item.nameEn).join(isBangla ? "، " : ", ");
    answer = isBangla
      ? pendingCrop
        ? `${foundUnsupportedDistrict ? `${foundUnsupportedDistrict} জেলার তথ্য এবং ` : ""}${pendingCrop.nameBn} ফসলের জন্য যাচাইকৃত কৃষি পরিকল্পনার তথ্য নেই। ফসলটি ক্যাটালগে আছে, কিন্তু স্থানভিত্তিক সরকারি চাষের ক্যালেন্ডার ও সুপারিশ যাচাই করা হয়নি।\n\nযাচাইকৃত পঞ্জিকা আছে: ${verifiedNames}। যাচাই শেষ না হওয়া পর্যন্ত চাষের সময়, পানির চাহিদা বা সারের মাত্রা অনুমান করে দেওয়া হবে না।`
        : `${foundUnsupportedDistrict ? `${foundUnsupportedDistrict} জেলার` : foundUnsupportedCrop ? `${foundUnsupportedCrop} ফসলের` : "এই এলাকার"} জন্য এই মুহূর্তে যাচাইকৃত কৃষি পরিকল্পনার তথ্য নেই। যাচাইকৃত পঞ্জিকা আছে: ${verifiedNames}। চাষের সময়, পানির চাহিদা বা সারের মাত্রা অনুমান করে দেওয়া হবে না।`
      : pendingCrop
        ? `${foundUnsupportedDistrict ? `Verified data for ${foundUnsupportedDistrict} district and ` : ""}${pendingCrop.nameEn} is not currently available for agronomic planning. This crop is in the catalog, but its location-specific official calendar and recommendations have not been verified.\n\nVerified crop calendars are available for: ${verifiedNames}. Planting dates, water needs, and fertilizer rates will not be guessed while verification is pending.`
        : `${foundUnsupportedDistrict ? `Verified data for ${foundUnsupportedDistrict} district` : `${foundUnsupportedCrop || "This area"} crop data`} is not currently available for agronomic planning. Verified crop calendars are available for: ${verifiedNames}. Planting dates, water needs, and fertilizer rates will not be guessed.`;

    sources.push(pendingCrop ? "KrishiBondhu Crop Catalog / BAMIS Crop Calendar Registry" : "BBS / KrishiBondhu Supported District Registry");
    dataDate = "Active Registry";
    dataQuality = foundUnsupportedDistrict ? "district_unsupported" : "crop_catalog_only";
    provenance.push(foundUnsupportedDistrict ? "Administrative boundary & crop scope filter" : "Crop calendar coverage status");
    limitations.push(foundUnsupportedDistrict ? "Only Cumilla (BD2019) and Chattogram (BD2015) are actively validated." : "Crop planning uses only crop calendars verified for the selected supported district.");

    return {
      answer,
      executedTools,
      sources,
      dataDate,
      dataQuality,
      provenance,
      limitations,
      modelUsed: "deterministic-grounded-engine",
    };
  }

  const isPowerQuery = normMessage.includes("nasa power") || normMessage.includes("power");
  const unsupportedPowerTerms = ["ozone", "wind", "pressure", "evapotranspiration", "uv index", "ওজোন", "বায়ুচাপ", "বাতাসের গতি"];
  const unsupportedPowerTerm = unsupportedPowerTerms.find((term) => normMessage.includes(term));
  if (isPowerQuery && unsupportedPowerTerm) {
    const isBangla = isBanglaMessage(message);
    answer = isBangla
      ? `NASA POWER-এর ${unsupportedPowerTerm} বিষয়ে এই সহকারীর যাচাইকৃত query নেই। কোনো মান অনুমান করা হচ্ছে না।`
      : `The deterministic assistant has no verified NASA POWER query for ${unsupportedPowerTerm}. No value is inferred.`;
    dataDate = null;
    dataQuality = "unsupported_parameter";
    sources.push("NASA POWER parameter scope");
    provenance.push("Deterministic assistant capability registry");
    limitations.push("Only implemented and validated parameter queries are answered by the deterministic fallback.");
    return {
      answer,
      executedTools,
      sources,
      dataDate,
      dataQuality,
      provenance,
      limitations,
      language: isBangla ? "bn" : "en",
      modelUsed: "deterministic-grounded-engine",
    };
  }

  // 0b. Check for Real-time Weather Forecasting Refusal (আজ বৃষ্টি / কাল বৃষ্টি / আবহাওয়া পূর্বাভাস)
  if (normMessage.includes("আজ বৃষ্টি") || normMessage.includes("আজকে বৃষ্টি") || normMessage.includes("কাল বৃষ্টি") || normMessage.includes("আজকের বৃষ্টি") || normMessage.includes("পূর্বাভাস") || normMessage.includes("লাইভ বৃষ্টি") || normMessage.includes("will it rain today") || normMessage.includes("weather forecast") || normMessage.includes("live weather")) {
    const rainfallData = await toolExecutors.getClimateRainfall({ district: validDistrict, grouping: "annual" });
    executedTools.push({ toolName: "getClimateRainfall", result: rainfallData });

    sources.push("NASA POWER Daily Point (2001-2025)");
    dataDate = "2001-2025";
    dataQuality = "satellite_reanalysis";
    provenance.push("NASA POWER Daily Historical Climate Grid");
    limitations.push("নাসা পাওয়ার জলবায়ু পুনর্বিশ্লেষণ উপাত্ত কেবল দীর্ঘমেয়াদী ঐতিহাসিক স্বাভাবিকতা নির্দেশ করে, এটি তাৎক্ষণিক দৈনিক আবহাওয়া পূর্বাভাস নয়।");

    const districtBn = validDistrict === "cumilla" ? "কুমিল্লা" : "চট্টগ্রাম";
    const meanMm = getAnnualRainfallMean(rainfallData);
    language = isBanglaMessage(message) ? "bn" : "en";
    if (meanMm == null) {
      dataQuality = "unavailable";
      dataDate = null;
    }

    answer = language === "bn"
      ? `NASA POWER-এর সংরক্ষিত ঐতিহাসিক জলবায়ু উপাত্ত আজকের লাইভ আবহাওয়া বা পূর্বাভাস নয়। আজকের পূর্বাভাসের জন্য বাংলাদেশ আবহাওয়া অধিদপ্তর (BMD) দেখুন।\n\n` +
        (meanMm == null ? `${districtBn} জেলার যাচাইকৃত ঐতিহাসিক বার্ষিক বৃষ্টিপাতের গড় পাওয়া যায়নি; কোনো মান অনুমান করা হচ্ছে না।` : `NASA POWER-এর ২০০১–২০২৫ ঐতিহাসিক রেকর্ডে ${districtBn} জেলার গড় বার্ষিক বৃষ্টিপাত ${meanMm.toFixed(2)} মিমি।`)
      : `NASA POWER provides archived climate observations, not today's live weather or a forecast. Check the Bangladesh Meteorological Department (BMD) for today's forecast.\n\n` +
        (meanMm == null ? `A verified historical annual rainfall mean is unavailable for ${validDistrict}; no value is inferred.` : `In NASA POWER's 2001–2025 historical record, mean annual rainfall for ${validDistrict} is ${meanMm.toFixed(2)} mm.`);

    return {
      answer,
      executedTools,
      sources,
      dataDate,
      dataQuality,
      provenance,
      limitations,
      language,
      modelUsed: "deterministic-grounded-engine",
    };
  }

  // 0c. Check for Historical vs Live Question (লাইভ অবস্থা / আজকের লাইভ / ঐতিহাসিক বনাম লাইভ)
  if (normMessage.includes("লাইভ অবস্থা") || normMessage.includes("আজকের অবস্থা") || normMessage.includes("লাইভ পরিস্থিতি") || normMessage.includes("লাইভ তথ্য")) {
    sources.push("NASA Earth Science Data Systems (SMAP / MODIS / POWER)");
    dataDate = "2001-2025";
    dataQuality = "historical_satellite_record";
    provenance.push("NASA Satellite Observation Archive");
    limitations.push("Satellite observations reflect validated historical snapshots, not real-time IoT sensors.");

    answer = `না, কৃষিবন্ধু সিস্টেমে প্রদর্শিত নাসার উপাত্ত আজকের মুহূর্তের লাইভ পরিস্থিতি নয়। এটি নাসার সংরক্ষিত ঐতিহাসিক স্যাটেলাইট পর্যবেক্ষণ।\n\n` +
      `- মাটির আর্দ্রতা (SMAP): ২০২৩-২০২৪ সালের স্যাটেলাইট পাসের নির্দিষ্ট সংরক্ষিত রেকর্ড।\n` +
      `- উদ্ভিদের সবুজতা (MODIS): ১৬ দিনের কম্পোজিট ঐতিহাসিক রেকর্ড।\n` +
      `- বৃষ্টিপাত ও জলবায়ু (NASA POWER): বিগত ২০০১ থেকে ২০২৫ সালের ২৫ বছরের দীর্ঘমেয়াদী জলবায়ু পুনর্বিশ্লেষণ উপাত্ত।\n\n` +
      `কৃষিবন্ধু ঐতিহাসিক স্বাভাবিকতা ও জলবায়ু প্রবণতা বিশ্লেষণের মাধ্যমে কৃষকের দীর্ঘমেয়াদী সিদ্ধান্ত গ্রহণে সহায়তা করে; এটি কোনো তাৎক্ষণিক লাইভ সেন্সর পর্যবেক্ষণ নয়।`;

    return {
      answer,
      executedTools,
      sources,
      dataDate,
      dataQuality,
      provenance,
      limitations,
      modelUsed: "deterministic-grounded-engine",
    };
  }

  // 0d. Check for Scientific Limitations & Sowing Feasibility (বীজ বোনা যাবে কি / জমিতে বীজ / মাটির আর্দ্রতা দেখে বীজ)
  if (normMessage.includes("বীজ বোনা যাবে") || normMessage.includes("বীজ বপন") || normMessage.includes("নিশ্চিত জমিতে বীজ") || normMessage.includes("বোনা যাবে কি") || normMessage.includes("বীজ বোনা")) {
    const smapData = await toolExecutors.getSoilMoistureLatest({ district: validDistrict });
    executedTools.push({ toolName: "getSoilMoistureLatest", result: smapData });

    sources.push("NASA SMAP SPL3SMP_E V006", "BARI / DAE Agricultural Extension Guidelines");
    dataDate = smapData.date || null;
    dataQuality = smapData.qualityClassification || "recommended";
    provenance.push(smapData.provenance || "NASA SMAP Radiometer");
    limitations.push(
      "Top 0-5 cm surface soil layer only. Satellite moisture alone cannot substitute field-level soil workability (মাটির জো) inspection."
    );

    answer = `না, স্যাটেলাইটের মাটির আর্দ্রতা একাই জমিতে বীজ বোনার শতভাগ নিশ্চয়তা দেয় না। এর দুটি প্রধান বৈজ্ঞানিক কারণ রয়েছে:\n\n` +
      `১. পরিমাপের গভীরতা: নাসা স্ম্যাপ (SMAP) স্যাটেলাইট কেবল মাটির উপরিভাগের ০ থেকে ৫ সেন্টিমিটার গভীরতার আর্দ্রতা পরিমাপ করে। এটি বীজের নিচের শিকড় অঞ্চল বা গভীর মাটির রস নির্দেশ করে না।\n` +
      `২. মাটির জো (Workability): বীজ বপনের জন্য মাটিতে পরিমিত 'জো' (পর্যাপ্ত নরম কিন্তু অতিরিক্ত কাদাময় নয়) থাকা আবশ্যক। অতিরিক্ত আর্দ্রতায় বীজ পচে যায় এবং কম আর্দ্রতায় অঙ্কুরোদগম ব্যাহত হয়।\n\n` +
      `পরামর্শ: স্যাটেলাইটের আর্দ্রতা অঞ্চলের সাধারণ অবস্থা বুঝতে সাহায্য করে, তবে জমিতে বীজ বোনার চূড়ান্ত সিদ্ধান্ত নেওয়ার আগে নিজের জমির মাটির জো সরাসরি হাত দিয়ে পরীক্ষা করা অপরিহার্য।`;

    return {
      answer,
      executedTools,
      sources,
      dataDate,
      dataQuality,
      provenance,
      limitations,
      modelUsed: "deterministic-grounded-engine",
    };
  }

  // 1. Summarize only actual stored historical transition results; do not turn them into forecast advice.
  if ((normMessage.includes("আমন") && normMessage.includes("সরিষা")) || normMessage.includes("হ্যান্ডঅফ") || normMessage.includes("handoff") || (normMessage.includes("বোরো") && normMessage.includes("আউশ")) || (normMessage.includes("aman") && normMessage.includes("mustard")) || (normMessage.includes("boro") && normMessage.includes("aus"))) {
    const isBoroAus = (normMessage.includes("বোরো") && normMessage.includes("আউশ")) || (normMessage.includes("boro") && normMessage.includes("aus"));
    const transition = isBoroAus ? "boro-aus" : "aman-mustard";
    const handoffData = await toolExecutors.getHandoffPlan({ transition, district: validDistrict });
    executedTools.push({ toolName: "getHandoffPlan", result: handoffData });
    language = isBanglaMessage(message) ? "bn" : "en";
    dataQuality = handoffData.error ? "unavailable" : "historical_descriptive";
    if (handoffData.provenance) provenance.push(`Handoff planner: ${handoffData.provenance}`);
    if (handoffData.yearsUsed != null) dataDate = `Historical sample: ${handoffData.yearsUsed} years`;
    if (handoffData.scientificDisclaimer) limitations.push(handoffData.scientificDisclaimer);
    if (handoffData.sampleSizeNote) limitations.push(handoffData.sampleSizeNote);

    if (handoffData.error) {
      answer = language === "bn"
        ? "এই ফসল পরিবর্তনের জন্য যাচাইকৃত ঐতিহাসিক পরিকল্পনা-তথ্য এখন পাওয়া যাচ্ছে না। তাই কোনো সময়, হার বা কাজের পরামর্শ দেওয়া হচ্ছে না।"
        : "Validated historical planning data for this crop transition is currently unavailable. No timing, rate, or action recommendation is provided.";
    } else {
      sources.push("KrishiBondhu Handoff Window Planner");
      const title = isBoroAus ? (language === "bn" ? "বোরো–আউশ" : "Boro–Aus") : (language === "bn" ? "আমন–সরিষা" : "Aman–Mustard");
      const rate = handoffData.historicalOpportunityRate || (language === "bn" ? "অনুপলব্ধ" : "unavailable");
      const window = handoffData.planningWindow || (language === "bn" ? "উল্লেখ নেই" : "not specified");
      const years = handoffData.yearsUsed == null
        ? (language === "bn" ? "নমুনার বছর অনুপলব্ধ" : "sample years unavailable")
        : language === "bn" ? `${handoffData.yearsUsed} বছরের ঐতিহাসিক নমুনা` : `${handoffData.yearsUsed}-year historical sample`;
      const caveat = language === "bn"
        ? "এটি অতীতের বর্ণনামূলক পরিকল্পনা-তথ্য, আসন্ন আবহাওয়ার পূর্বাভাস নয়; পরিকল্পনা-উইন্ডোর উৎস যাচাই বাকি থাকতে পারে। এটিকে একা চাষের সিদ্ধান্ত হিসেবে ব্যবহার করবেন না।"
        : "This is historical descriptive planning information, not a forecast; the planning-window source may still require verification. Do not use it alone to make a crop decision.";
      answer = language === "bn"
        ? `${title} পরিবর্তনের সংরক্ষিত ঐতিহাসিক পরিকল্পনা-তথ্য:\n- পরিকল্পনা-উইন্ডো: ${window}\n- ঐতিহাসিক সুযোগের হার: ${rate}\n- নমুনা: ${years}\n\n${caveat}`
        : `Stored historical planning information for the ${title} transition:\n- Planning window: ${window}\n- Historical opportunity rate: ${rate}\n- Sample: ${years}\n\n${caveat}`;
    }
  }
  // 2. Check for Soil Moisture query (মাটির আর্দ্রতা / SMAP)
  else if (normMessage.includes("মাটির আর্দ্রতা") || normMessage.includes("আর্দ্রতা") || normMessage.includes("soil moisture") || normMessage.includes("smap") || normMessage.includes("স্ম্যাপ")) {
    const smapData = await toolExecutors.getSoilMoistureLatest({ district: validDistrict });
    executedTools.push({ toolName: "getSoilMoistureLatest", result: smapData });

    language = isBanglaMessage(message) ? "bn" : "en";
    if (smapData.error) {
      dataQuality = "unavailable";
      answer = language === "bn"
        ? `NASA SMAP-এর যাচাইকৃত মাটির আর্দ্রতা পর্যবেক্ষণ ${validDistrict} জেলার জন্য সংরক্ষিত নেই। কোনো মান অনুমান করা হচ্ছে না।`
        : `No validated NASA SMAP soil-moisture observation is stored for ${validDistrict}. No value is inferred.`;
    } else {
      dataDate = smapData.date;
      dataQuality = smapData.qualityClassification;
      sources.push("NASA SMAP SPL3SMP_E V006");
      provenance.push(smapData.provenance);
      limitations.push(smapData.measurementDepth);

      const districtBn = validDistrict === "cumilla" ? "কুমিল্লা" : "চট্টগ্রাম";
      answer = language === "bn"
        ? `NASA SMAP SPL3SMP_E V006-এর ঐতিহাসিক পর্যবেক্ষণ (${smapData.date}) অনুযায়ী ${districtBn} জেলার পৃষ্ঠমাটির আর্দ্রতা ${smapData.soilMoisture} ${smapData.unit} (${smapData.percentage})। Retrieval quality flag ${smapData.retrievalQualityFlag}: ${smapData.qualityClassification === "recommended" ? "সুপারিশকৃত" : "সতর্কতামূলক"}। এটি লাইভ সেন্সর নয় এবং কেবল উপরিভাগের ০–৫ সেমি বোঝায়।`
        : `The stored historical NASA SMAP SPL3SMP_E V006 observation for ${validDistrict} is ${smapData.soilMoisture} ${smapData.unit} (${smapData.percentage}) on ${smapData.date}. Retrieval quality flag ${smapData.retrievalQualityFlag}: ${smapData.qualityClassification}. This is a satellite estimate of the top 0–5 cm, not a live sensor reading.`;
    }
  }
  // 3. Check for Vegetation / Greenness (NDVI / EVI / সবুজতা / গাছপালা / উদ্ভিদ)
  else if (normMessage.includes("ndvi") || normMessage.includes("evi") || normMessage.includes("vegetation") || normMessage.includes("সবুজতা") || normMessage.includes("modis") || normMessage.includes("মোডিস") || normMessage.includes("গাছপালা") || normMessage.includes("উদ্ভিদ") || normMessage.includes("ক্যানোপি") || normMessage.includes("গাছপালার অবস্থা") || normMessage.includes("ফসলের অবস্থা")) {
    const modisData = await toolExecutors.getVegetationLatest({ district: validDistrict });
    executedTools.push({ toolName: "getVegetationLatest", result: modisData });
    language = isBanglaMessage(message) ? "bn" : "en";

    if (modisData.error) {
      dataQuality = "unavailable";
      answer = language === "bn"
        ? `${validDistrict === "cumilla" ? "কুমিল্লা" : "চট্টগ্রাম"} জেলার জন্য NASA MODIS-এর যাচাইকৃত উদ্ভিদ পর্যবেক্ষণ সংরক্ষিত নেই। কোনো মান অনুমান করা হচ্ছে না।`
        : `No validated NASA MODIS vegetation observation is stored for ${validDistrict}. No value is inferred.`;
    } else {
      dataDate = modisData.date;
      dataQuality = modisData.qualityClassification;
      sources.push("NASA MODIS MOD13Q1.061");
      provenance.push(modisData.provenance);
      limitations.push(modisData.scientificMeaning);

      const districtBn = validDistrict === "cumilla" ? "কুমিল্লা" : "চট্টগ্রাম";
      answer = `নাসা মোডিস (NASA MODIS) স্যাটেলাইটের সংরক্ষিত ঐতিহাসিক রেকর্ড অনুযায়ী (${modisData.date}, ডেস অফ ইয়ার ${modisData.compositeDayOfYear}) — এটি তৎকালীন স্যাটেলাইট পর্যবেক্ষণ, বর্তমান মুহূর্তের লাইভ অবস্থা নয়।\n\n` +
        `উক্ত তারিখে ${districtBn} জেলায় উদ্ভিদের সবুজতা সূচক:\n` +
        `- এনডিভিআই (NDVI): ${modisData.ndvi}\n` +
        `- ইভিআই (EVI): ${modisData.evi}\n` +
        `- পিক্সেল নির্ভরযোগ্যতা: Rank ${modisData.pixelReliability} (${modisData.qualityClassification})\n\n` +
        `বৈজ্ঞানিক অর্থ ও সীমাবদ্ধতা: NDVI এবং EVI সূচক উদ্ভিদের ক্লোরোফিল শোষণ এবং পাতার ঘনত্ব প্রকাশ করে। এটি ফসলের সরাসরি রোগ নির্ণয় বা মোট ফলন পূর্বাভাস নয়।`;
      if (language === "en") {
        answer = `Stored historical NASA MODIS MOD13Q1.061 observation for ${validDistrict} (${modisData.date}, composite day ${modisData.compositeDayOfYear}):\n` +
          `- NDVI: ${modisData.ndvi}\n- EVI: ${modisData.evi}\n` +
          `- Pixel reliability: rank ${modisData.pixelReliability} (${modisData.qualityClassification})\n\n` +
          `This is a historical 16-day composite. NDVI/EVI are greenness indices, not direct disease diagnoses or yield forecasts.`;
      }
    }
  }
  // 4. Latest GPM satellite precipitation requests must use interval-backed observations.
  else if (normMessage.includes("gpm") || normMessage.includes("imerg") || normMessage.includes("latest rainfall") || normMessage.includes("latest rain") || normMessage.includes("সর্বশেষ বৃষ্টিপাত") || normMessage.includes("সর্বশেষ বৃষ্টি") || normMessage.includes("সাম্প্রতিক বৃষ্টিপাত")) {
    const gpmData = await toolExecutors.getPrecipitationLatest({ district: validDistrict });
    executedTools.push({ toolName: "getPrecipitationLatest", result: gpmData });
    sources.push(gpmData.source || "NASA GPM IMERG Final V07");
    provenance.push(gpmData.datasetKey || "nasa:gpm:imerg:3imerghh:v07");
    dataDate = gpmData.observationDate || null;

    const daily = gpmData.dailySummary;
    const validIntervals = Number.isInteger(daily?.validIntervals) ? daily.validIntervals : null;
    const isComplete = daily?.completeness === "complete" && validIntervals === 48 && Number.isFinite(daily?.totalPrecipitationMm);
    dataQuality = isComplete ? "complete_48_of_48" : "incomplete_or_unavailable";
    limitations.push(gpmData.limitation || "Regional ~0.1° grid estimate; not a farm rain-gauge measurement.");

    const districtBn = validDistrict === "cumilla" ? "কুমিল্লা" : "চট্টগ্রাম";
    const districtEn = validDistrict === "cumilla" ? "Cumilla" : "Chattogram";
    const isBangla = isBanglaMessage(message);
    const ingestedText = gpmData.ingestedAt
      ? new Date(gpmData.ingestedAt).toISOString()
      : null;
    if (gpmData.status !== "AVAILABLE" || !daily) {
      answer = isBangla
        ? `${districtBn} জেলার জন্য যাচাইকৃত GPM IMERG বৃষ্টিপাতের পর্যবেক্ষণ বর্তমানে সংরক্ষিত নেই। কোনো মান অনুমান করা হচ্ছে না।`
        : `No validated GPM IMERG precipitation observations are stored for ${districtEn}. No value is inferred.`;
    } else {
      const intervalText = validIntervals == null
        ? (isBangla ? "বৈধ ব্যবধানের সংখ্যা অনুপলব্ধ" : "valid interval count unavailable")
        : isBangla ? `${validIntervals}/48 বৈধ অর্ধঘণ্টা ব্যবধান` : `${validIntervals}/48 valid half-hour intervals`;
      const dailyValue = isComplete
        ? `${daily.totalPrecipitationMm.toFixed(2)} mm`
        : isBangla
          ? `প্রকাশযোগ্য নয় (${intervalText})`
          : `withheld (${intervalText})`;
      answer = isBangla
        ? `NASA GPM IMERG Final V07-এর সংরক্ষিত ঐতিহাসিক পর্যবেক্ষণ অনুযায়ী ${districtBn} জেলার সর্বশেষ পর্যবেক্ষণ তারিখ ${gpmData.observationDate}।` +
          `\nদৈনিক বৃষ্টিপাত: ${dailyValue}; ${intervalText}।` +
          `${ingestedText ? `\nডেটাবেসে অন্তর্ভুক্তির সময়: ${ingestedText}।` : ""}` +
          `\nএটি প্রায় ০.১° (~১০ কিমি) গ্রিডের আঞ্চলিক অনুমান, খামারের বৃষ্টিমাপক নয়; এটি লাইভ আবহাওয়া নয়।`
        : `According to the stored historical NASA GPM IMERG Final V07 record, the latest observation for ${districtEn} is dated ${gpmData.observationDate}.` +
          `\nDaily precipitation: ${dailyValue}; ${intervalText}.` +
          `${ingestedText ? `\nDatabase ingestion time: ${ingestedText}.` : ""}` +
          `\nThis is a regional ~0.1° (~10 km) grid estimate, not a farm rain gauge or live weather.`;
    }
    return {
      answer,
      language: isBangla ? "bn" : "en",
      executedTools,
      sources,
      dataDate,
      dataQuality,
      provenance,
      limitations,
      modelUsed: "deterministic-grounded-engine",
    };
  }
  // 5. Check for Rainfall / Climate (বৃষ্টিপাত / জলবায়ু / আবহাওয়া)
  else if (normMessage.includes("বৃষ্টি") || normMessage.includes("বৃষ্টিপাত") || normMessage.includes("বৃষ্টি কেমন") || normMessage.includes("তাপমাত্রা") || normMessage.includes("rainfall") || normMessage.includes("precipitation") || normMessage.includes("nasa power")) {
    const rainfallData = await toolExecutors.getClimateRainfall({ district: validDistrict, grouping: "annual" });
    executedTools.push({ toolName: "getClimateRainfall", result: rainfallData });

    sources.push("NASA POWER Daily Point (2001-2025)");
    dataDate = "2001-2025";
    dataQuality = "satellite_reanalysis";
    provenance.push("NASA Langley Research Center POWER Project");
    limitations.push("0.5 x 0.625 degree spatial resolution grid; reflects 25-year historical normals, not daily weather forecast.");

    const districtBn = validDistrict === "cumilla" ? "কুমিল্লা" : "চট্টগ্রাম";
    const meanMm = getAnnualRainfallMean(rainfallData);
    language = isBanglaMessage(message) ? "bn" : "en";

    if (meanMm == null) {
      answer = language === "bn"
        ? `${districtBn} জেলার জন্য NASA POWER-এর যাচাইকৃত ঐতিহাসিক বার্ষিক বৃষ্টিপাতের পরিসংখ্যান পাওয়া যায়নি। কোনো মান অনুমান করা হচ্ছে না।`
        : `No validated historical annual rainfall statistic is available from NASA POWER for ${validDistrict}. No value is inferred.`;
      dataQuality = "unavailable";
      dataDate = null;
    } else {
      answer = language === "bn"
        ? `NASA POWER Daily Point-এর ২০০১–২০২৫ ঐতিহাসিক রেকর্ড অনুযায়ী ${districtBn} জেলার গড় বার্ষিক বৃষ্টিপাত ${meanMm.toFixed(2)} মিমি। এটি ঐতিহাসিক গড়, দৈনিক পূর্বাভাস নয়।`
        : `According to the 2001–2025 historical NASA POWER Daily Point record, mean annual rainfall for ${validDistrict} is ${meanMm.toFixed(2)} mm. This is a historical average, not a daily forecast.`;
    }
  }
  // 5. Answer crop-calendar questions only from the existing district calendar response.
  else if (normMessage.includes("সরিষা") || normMessage.includes("আমন") || normMessage.includes("বোরো") || normMessage.includes("আউশ") || normMessage.includes("ক্যালেন্ডার") || normMessage.includes("বপন") || normMessage.includes("mustard") || normMessage.includes("aman") || normMessage.includes("boro rice") || normMessage.includes("aus rice") || normMessage.includes("crop calendar") || normMessage.includes("sowing period") || normMessage.includes("planting period") || normMessage.includes("harvest period")) {
    let targetCrop = crop && crop !== "all" ? crop : null;
    if (normMessage.includes("আমন") || normMessage.includes("aman")) targetCrop = "monsoon_aman";
    else if (normMessage.includes("বোরো") || normMessage.includes("boro")) targetCrop = "boro_rice";
    else if (normMessage.includes("আউশ") || normMessage.includes("aus")) targetCrop = "aus_rice";
    else if (normMessage.includes("সরিষা") || normMessage.includes("mustard")) targetCrop = "mustard";
    if (!targetCrop) {
      language = isBanglaMessage(message) ? "bn" : "en";
      answer = language === "bn"
        ? "কোন ফসলের পঞ্জিকা জানতে চান? আমন, বোরো, আউশ বা সরিষার নাম বলুন।"
        : "Which crop calendar do you need? Please specify Aman, Boro, Aus, or mustard.";
      dataQuality = "clarification_needed";
      return { answer, executedTools, sources, dataDate: null, dataQuality, provenance, limitations, language, modelUsed: "deterministic-grounded-engine" };
    }

    const calData = await toolExecutors.getCropCalendarAdvisory({ crop: targetCrop, district: validDistrict });
    executedTools.push({ toolName: "getCropCalendarAdvisory", result: calData });
    language = isBanglaMessage(message) ? "bn" : "en";
    sources.push(...(Array.isArray(calData.officialSources) && calData.officialSources.length
      ? calData.officialSources
      : calData.provenance ? [calData.provenance] : []));
    dataQuality = calData.error ? "unavailable" : "official_calendar";
    if (calData.provenance) provenance.push(calData.provenance);
    limitations.push(language === "bn"
      ? "পঞ্জিকার সময়সীমা সাধারণ নির্দেশনা; মাঠের অবস্থা ও স্থানীয় কৃষি কর্মকর্তার পরামর্শ মিলিয়ে নিন।"
      : "Calendar periods are general guidance; consider field conditions and advice from a local agricultural officer.");

    if (calData.error) {
      answer = language === "bn"
        ? "এই ফসল ও জেলার জন্য যাচাইকৃত পঞ্জিকার তথ্য এখন পাওয়া যাচ্ছে না। কোনো তারিখ বা সুপারিশ অনুমান করা হয়নি।"
        : "Verified calendar information for this crop and district is currently unavailable. No dates or recommendations were inferred.";
    } else {
      const varieties = Array.isArray(calData.typicalVarieties) && calData.typicalVarieties.length
        ? calData.typicalVarieties.join(", ")
        : null;
      const stages = (calData.criticalStages || []).slice(0, 3).map((stage) =>
        language === "bn"
          ? `- ${stage.nameBn || stage.nameEn}${stage.durationDays == null ? "" : `: ${stage.durationDays} দিন`}`
          : `- ${stage.nameEn || stage.nameBn}${stage.durationDays == null ? "" : `: ${stage.durationDays} days`}`
      ).join("\n");
      answer = language === "bn"
        ? `${calData.nameBn || calData.nameEn} ফসলের ${calData.district} জেলার পঞ্জিকা তথ্য:\n- বপনের সময়: ${calData.sowingPeriod || "উল্লেখ নেই"}\n` +
          (calData.transplantingPeriod ? `- চারা রোপণের সময়: ${calData.transplantingPeriod}\n` : "") +
          `- কাটার সময়: ${calData.harvestPeriod || "উল্লেখ নেই"}\n- ফসলের সময়কাল: ${calData.totalDurationDays == null ? "উল্লেখ নেই" : `${calData.totalDurationDays} দিন`}\n` +
          `- উল্লেখিত জাত: ${varieties || "উল্লেখ নেই"}${stages ? `\nগুরুত্বপূর্ণ পর্যায়:\n${stages}` : ""}\n\n` +
          "এটি পঞ্জিকা-ভিত্তিক তথ্য; বর্তমান আবহাওয়া বা ব্যক্তিগত ফলনের নিশ্চয়তা নয়।"
        : `Crop-calendar information for ${calData.nameEn || calData.nameBn} in ${calData.district}:\n- Sowing period: ${calData.sowingPeriod || "not specified"}\n` +
          (calData.transplantingPeriod ? `- Transplanting period: ${calData.transplantingPeriod}\n` : "") +
          `- Harvest period: ${calData.harvestPeriod || "not specified"}\n- Crop duration: ${calData.totalDurationDays == null ? "not specified" : `${calData.totalDurationDays} days`}\n` +
          `- Listed varieties: ${varieties || "not specified"}${stages ? `\nKey stages:\n${stages}` : ""}\n\n` +
          "This is calendar guidance, not a current weather forecast or yield guarantee.";
    }
    dataDate = null;
  } else if (isOwnDataRecallQuestion(message) && !isWebsiteHelpQuestion(message)) {
    language = isBanglaMessage(message) ? "bn" : "en";
    if (!userId) {
      answer = language === "bn"
        ? "আপনার ব্যক্তিগত খামার ও সংরক্ষিত তথ্য দেখতে লগইন করুন। অন্য ব্যবহারকারীর তথ্য আমি দেখাতে পারি না।"
        : "Sign in to review your own farm and saved information. I cannot show another user's records.";
      dataQuality = "authentication_required";
    } else {
      const accountContext = await toolExecutors.getMyAccountContext({ userId });
      executedTools.push({ toolName: "getMyAccountContext", result: accountContext });
      sources.push("KrishiBondhu Private User Records");
      dataQuality = accountContext.error ? "unavailable" : "owner_scoped_records";

      if (accountContext.error) {
        answer = language === "bn"
          ? "আপনার সংরক্ষিত তথ্য এখন পাওয়া যাচ্ছে না। পরে আবার চেষ্টা করুন।"
          : "Your saved information is currently unavailable. Please try again later.";
      } else {
        const farms = (accountContext.farms || []).map((farm) => language === "bn"
          ? `${farm.farmName} (${farm.crop?.cropName || farm.crop?.cropCode || "ফসল উল্লেখ নেই"}, ${farm.district || "জেলা উল্লেখ নেই"})`
          : `${farm.farmName} (${farm.crop?.cropCode || "crop unspecified"}, ${farm.district || "district unspecified"})`);
        const activities = (accountContext.recentActivities || []).slice(0, 5).map((activity) =>
          `${activity.title} — ${activity.scheduledDate || (language === "bn" ? "তারিখ নেই" : "no date")}, ${activity.status}`
        );
        const plans = accountContext.savedRotationPlans || [];
        const conversations = accountContext.recentConversations || [];

        answer = language === "bn"
          ? `আপনার সংরক্ষিত তথ্যের সারাংশ:\n` +
            `- প্রোফাইল: ${accountContext.profile?.name || "নাম উল্লেখ নেই"}; পছন্দের জেলা ${accountContext.profile?.preferredDistrict || "উল্লেখ নেই"}\n` +
            `- খামার: ${farms.length ? farms.join("; ") : "কোনো খামার সংরক্ষিত নেই"}${accountContext.farmCount > farms.length ? `; মোট ${accountContext.farmCount}টি খামারের মধ্যে সাম্প্রতিক ${farms.length}টি দেখানো হয়েছে` : ""}\n` +
            `- সাম্প্রতিক কাজ: ${activities.length ? activities.join("; ") : "কোনো কাজ সংরক্ষিত নেই"}\n` +
            `- সংরক্ষিত ফসল পরিকল্পনা: ${accountContext.rotationPlanCount || plans.length}\n` +
            `- অপঠিত নোটিফিকেশন: ${accountContext.unreadNotificationCount || 0}\n` +
            `- সাম্প্রতিক কথোপকথন: ${conversations.length ? conversations.map((item) => item.title).join("; ") : "কোনো সংরক্ষিত কথোপকথন নেই"}`
          : `Summary of your saved information:\n` +
            `- Profile: ${accountContext.profile?.name || "name not specified"}; preferred district ${accountContext.profile?.preferredDistrict || "not specified"}\n` +
            `- Farms: ${farms.length ? farms.join("; ") : "no saved farms"}${accountContext.farmCount > farms.length ? `; showing ${farms.length} recent farms out of ${accountContext.farmCount}` : ""}\n` +
            `- Recent activities: ${activities.length ? activities.join("; ") : "no saved activities"}\n` +
            `- Saved crop plans: ${accountContext.rotationPlanCount || plans.length}\n` +
            `- Unread notifications: ${accountContext.unreadNotificationCount || 0}\n` +
            `- Recent conversations: ${conversations.length ? conversations.map((item) => item.title).join("; ") : "no saved conversations"}`;
        provenance.push("Authenticated current-user records only");
      }
    }
  } else if (isWebsiteHelpQuestion(message)) {
    language = isBanglaMessage(message) ? "bn" : "en";
    const knowledge = await toolExecutors.getPlatformKnowledge({ topic: message });
    executedTools.push({ toolName: "getPlatformKnowledge", result: knowledge });
    sources.push("KrishiBondhu Website Guide");
    dataQuality = "website_feature_guide";
    const titleBn = {
      Home: "হোম পেজ",
      Dashboard: "ড্যাশবোর্ড",
      "My Farm": "আমার খামার",
      "Add or edit a farm": "খামার যোগ বা সম্পাদনা",
      "Farm workspace": "খামারের তথ্য ও কাজ",
      "Crop planning and rotation": "ফসল পরিকল্পনা ও চাষচক্র",
      "Crop rotation demo": "ফসল চক্রের নমুনা",
      "AI Farmer Assistant": "কৃষি সহকারী",
      "Crop Transition (Handoff)": "ফসল পরিবর্তন",
      "Climate and environmental data": "জলবায়ু ও পরিবেশের উপাত্ত",
      "Interactive Map": "ইন্টার‌্যাকটিভ মানচিত্র",
      "Crop Calendar": "ফসলের পঞ্জিকা",
      "Data Sources": "উপাত্তের উৎস",
      Settings: "সেটিংস",
      "Account and location setup": "অ্যাকাউন্ট ও অবস্থান নির্ধারণ",
    };
    const pageNames = (knowledge.pages || []).map((page) =>
      `${language === "bn" ? titleBn[page.title] || page.title : page.title} (${page.route})`
    );
    answer = language === "bn"
      ? `ওয়েবসাইটে এই পেজগুলো আছে: ${pageNames.join("; ")}। কোন পেজে কীভাবে কাজ করবেন, সেটি বললে ধাপে ধাপে বুঝিয়ে দেব।`
      : `The website includes these pages: ${pageNames.join("; ")}. Tell me which page you want to use and I can explain its steps.`;
    provenance.push("KrishiBondhu application feature catalogue");
  }  // 6. Generic or Greeting / Fallback
  else {
    const supported = await toolExecutors.getSupportedDistrictsAndCrops();
    executedTools.push({ toolName: "getSupportedDistrictsAndCrops", result: supported });

    sources.push("KrishiBondhu assistant capability registry");
    dataDate = null;
    dataQuality = "capability_help";
    provenance.push("KrishiBondhu assistant capability registry");
    language = isBanglaMessage(message) ? "bn" : "en";
    answer = language === "bn"
      ? "আমি আপনার নির্বাচিত খামারের সংরক্ষিত ফসল, কার্যক্রম ও জীবনচক্রের তথ্য, উপলভ্য NASA পর্যবেক্ষণ, আবহাওয়া এবং ফসল পঞ্জিকা নিয়ে সাহায্য করতে পারি। কোনো তথ্য না থাকলে তা স্পষ্ট করে জানাব। আপনি কোন বিষয়টি জানতে চান?"
      : "I can help with your selected farm's saved crop, activities and lifecycle, available NASA observations, weather, and crop-calendar information. I will say when information is unavailable. What would you like to know?";
  }

  return {
    answer,
    executedTools,
    sources,
    dataDate,
    dataQuality,
    provenance,
    limitations,
    language,
    modelUsed: "deterministic-grounded-engine",
  };
}

export class AssistantChatService {
  /**
   * Process a farmer chat request.
   */
  async handleChat({
    message,
    district,
    crop = null,
    farmId = null,
    userId = null,
    conversationId = null,
    customHistory = null,
  }) {
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      throw new Error("EMPTY_MESSAGE: A valid non-empty message string is required.");
    }

    const trimmedMessage = message.trim();
    const effectiveConversationId = conversationId || crypto.randomUUID();
    const suppliedHistory = (Array.isArray(customHistory) && customHistory.length > 0)
      ? customHistory
      : getConversationHistory(effectiveConversationId);
    // Standalone, topic-specific questions must not inherit an earlier generic answer.
    const history = isContextualFollowUp(trimmedMessage) ? suppliedHistory.slice(-6) : [];
    const intentContext = detectAgriculturalIntent(trimmedMessage);

    const scope = classifyAssistantScope(trimmedMessage, history);
    if (scope === "out_of_scope" && !isGeneralHelpOrGreeting(trimmedMessage)) {
      const language = isBanglaMessage(trimmedMessage) ? "bn" : "en";
      const answer = language === "bn"
        ? "আমি কৃষি ও খামার-সম্পর্কিত বিষয়ে সাহায্য করি। ফসল, রোগ-পোকা, মাটি, সেচ, আবহাওয়া বা কৃষকের কোনো সমস্যা নিয়ে প্রশ্ন করুন।"
        : "I can help with agriculture and farming. Please ask about crops, pests or diseases, soil, irrigation, weather, or a farmer's problem.";
      updateConversationHistory(effectiveConversationId, trimmedMessage, answer);
      return { answer, language, sources: [], dataDate: null, dataQuality: "out_of_scope", provenance: [], limitations: [], conversationId: effectiveConversationId, meta: { model: "agriculture-scope-router", toolsCalled: [], route: "out_of_scope" } };
    }
    if (scope === "clarification" && !isGeneralHelpOrGreeting(trimmedMessage)) {
      const language = isBanglaMessage(trimmedMessage) ? "bn" : "en";
      const answer = language === "bn"
        ? "কৃষির কোন বিষয়ে সাহায্য চান—ফসল, রোগ-পোকা, মাটি, সেচ, আবহাওয়া, নাকি বাজারদর?"
        : "Which agricultural topic do you need help with: crops, pests or diseases, soil, irrigation, weather, or market prices?";
      updateConversationHistory(effectiveConversationId, trimmedMessage, answer);
      return { answer, language, sources: [], dataDate: null, dataQuality: "clarification_needed", provenance: [], limitations: [], conversationId: effectiveConversationId, meta: { model: "agriculture-scope-router", toolsCalled: [], route: "clarification" } };
    }

    // Validate district against supported list
    const lowerDistrict = typeof district === "string" ? district.trim().toLowerCase() : "";
    const isGreetingOrHelp = isGeneralHelpOrGreeting(trimmedMessage);
    const needsDistrict = requiresVerifiedDistrict(trimmedMessage);
    if (!farmId && needsDistrict && !isGreetingOrHelp && !VALID_DISTRICT_CODES.has(lowerDistrict)) {
      const language = isBanglaMessage(trimmedMessage) ? "bn" : "en";
      const missingDistrict = !lowerDistrict;
      const unsupportedAnswer = language === "bn"
        ? missingDistrict
          ? "আপনি কোন জেলার তথ্য জানতে চান—কুমিল্লা, নাকি চট্টগ্রাম?"
          : `“${district}” জেলার যাচাইকৃত উপাত্ত নেই। বর্তমানে কেবল কুমিল্লা ও চট্টগ্রামের তথ্য ব্যবহার করা যায়।`
        : missingDistrict
          ? "Which district should I use: Cumilla or Chattogram?"
          : `There is no verified dataset for “${district}”. Current coverage includes Cumilla and Chattogram only.`;
      return {
        answer: unsupportedAnswer,
        language,
        sources: ["BBS / KrishiBondhu Supported District Registry"],
        dataDate: null,
        dataQuality: missingDistrict ? "clarification_needed" : "district_unsupported",
        provenance: ["Administrative boundary filter"],
        limitations: ["Only Cumilla (BD2019) and Chattogram (BD2015) are actively validated."],
        conversationId: effectiveConversationId,
        meta: {
          model: "krishi-district-validator",
          toolsCalled: [],
        },
      };
    }

    const catalogCrop = findCatalogOnlyCropMention(trimmedMessage)
      || (getCropByCode(crop)?.planningAvailable === false ? getCropByCode(crop) : null);
    const cropKnowledge = catalogCrop ? getCropKnowledge(catalogCrop.code) : null;
    if (catalogCrop && !isMarketQuestion(trimmedMessage) && !cropKnowledge?.generalGuide) {
      const coverageNotice = buildCropCoverageNotice(catalogCrop, trimmedMessage, lowerDistrict);
      const responsePayload = {
        ...coverageNotice,
        conversationId: effectiveConversationId,
        meta: { model: "crop-catalog-coverage-guard", toolsCalled: [] },
      };
      updateConversationHistory(effectiveConversationId, trimmedMessage, responsePayload.answer);
      return responsePayload;
    }

    let responsePayload = null;

    // Try Gemini Function Calling if configured
    if (geminiAssistantClient.isConfigured()) {
      try {
        const geminiResult = await geminiAssistantClient.generateGroundedResponse({
          message: trimmedMessage,
          district: lowerDistrict,
          crop,
          farmId,
          userId,
          conversationHistory: history,
          intent: intentContext,
        });

        // Extract metadata from executed tools
        const sources = new Set(["Google Gemini 2.5 Flash"]);
        let dataDate = null;
        let dataQuality = "grounded";
        const provenance = [];
        const limitations = [];

        for (const call of geminiResult.executedTools) {
          const res = call.result;
          if (!res) continue;

          if (call.toolName === "getUnifiedFarmAnalysis") {
            sources.add("NASA GPM IMERG, SMAP, MODIS & NASA POWER");
            sources.add("KrishiBondhu Python NumPy Evidence Analysis");
            if (res.meta?.latestSatelliteDateRange) {
              const range = res.meta.latestSatelliteDateRange;
              dataDate = range.earliest && range.latest
                ? `${range.earliest} to ${range.latest}`
                : range.latest || range.earliest || null;
            }
            dataQuality = res.meta?.status || "partial_evidence";
            if (Array.isArray(res.cautions)) limitations.push(...res.cautions);
            provenance.push(`Deterministic analysis ${res.meta?.formulaVersion || ""}`.trim());
          } else if (call.toolName === "getSoilMoistureLatest") {
            sources.add("NASA SMAP SPL3SMP_E V006");
            if (res.date) dataDate = res.date;
            if (res.qualityClassification) dataQuality = res.qualityClassification;
            if (res.provenance) provenance.push(res.provenance);
            if (res.measurementDepth) limitations.push(res.measurementDepth);
          } else if (call.toolName === "getVegetationLatest") {
            sources.add("NASA MODIS MOD13Q1.061");
            if (res.date) dataDate = res.date;
            if (res.qualityClassification) dataQuality = res.qualityClassification;
            if (res.provenance) provenance.push(res.provenance);
            if (res.scientificMeaning) limitations.push(res.scientificMeaning);
          } else if (call.toolName === "getClimateNormals" || call.toolName === "getClimateRainfall") {
            sources.add("NASA POWER Daily Point (2001-2025)");
            if (!dataDate) dataDate = "2001-2025";
            provenance.push("NASA Langley Research Center POWER Project");
          } else if (call.toolName === "getPrecipitationLatest") {
            sources.add(res.source || "NASA GPM IMERG Final V07");
            if (res.observationDate) dataDate = res.observationDate;
            dataQuality = res.dailySummary?.completeness === "complete" && res.dailySummary?.validIntervals === 48
              ? "complete_48_of_48"
              : "incomplete_or_unavailable";
            if (res.datasetKey) provenance.push(res.datasetKey);
            if (res.limitation) limitations.push(res.limitation);
          } else if (call.toolName === "getCropCalendarAdvisory") {
            sources.add("BAMIS (DAE) & BRRI/BARI Research Bulletins");
            if (res.provenance) provenance.push(res.provenance);
            if (Array.isArray(res.officialSources)) provenance.push(...res.officialSources);
          } else if (call.toolName === "getCropKnowledge") {
            for (const source of res.sources || []) sources.add(source.organization);
            for (const source of res.managementGuide?.sources || []) {
              if (source.organization) sources.add(source.organization);
              if (source.url) provenance.push(`${source.title || source.organization}: ${source.url}`);
            }
            if (res.sourceCheckedOn) provenance.push(`Source page checked for this project on ${res.sourceCheckedOn}; original publication date may be earlier or unstated.`);
            dataQuality = res.generalGuide ? "source_linked_general_guidance" : "crop_catalog_only";
            for (const source of res.sources || []) if (source.url) provenance.push(source.url);
            if (res.selectedVarietyGuide?.source) {
              const varietySource = res.selectedVarietyGuide.source;
              sources.add(varietySource.organization);
              provenance.push(`${varietySource.title}; page checked ${varietySource.checkedOn}: ${varietySource.url}`);
              dataQuality = "verified_variety_guidance";
            }
            if (!res.districtCalendarAvailable) limitations.push("No verified district-specific crop calendar is available for this crop.");
          } else if (call.toolName === "getHandoffPlan") {
            sources.add("KrishiBondhu Handoff Window Planner");
            if (res.scientificDisclaimer) limitations.push(res.scientificDisclaimer);
          } else if (call.toolName === "getPlatformKnowledge") {
            sources.add("KrishiBondhu Website Guide");
            provenance.push("KrishiBondhu application feature catalogue");
          } else if (call.toolName === "getMyFarmDetails") {
            sources.add("KrishiBondhu My Farm Registry");
            provenance.push("Farmer Authenticated Profile");
          } else if (call.toolName === "getMyAccountContext") {
            sources.add("KrishiBondhu Private User Records");
            provenance.push("Authenticated current-user profile, farms, and saved records");
          } else if (call.toolName === "getMyFarmLifecycle") {
            sources.add("BAMIS Agro-Meteorological Crop Calendar");
            if (res.provenance?.publisher) provenance.push(res.provenance.publisher);
          } else if (call.toolName === "getMyFarmActivities") {
            sources.add("KrishiBondhu Farm Activity Tracker");
            provenance.push("Official DAE/BAMIS Crop Schedule");
          } else if (call.toolName === "getMyFarmEnvironmentalContext") {
            sources.add("NASA SMAP & MODIS Satellite Observations");
            provenance.push("NASA Earth Science Data Systems");
            if (res.scientificSafeguards?.rootZoneDisclaimer) limitations.push(res.scientificSafeguards.rootZoneDisclaimer);
            if (res.scientificSafeguards?.vegetationDisclaimer) limitations.push(res.scientificSafeguards.vegetationDisclaimer);
          } else if (call.toolName === "getOfficialCropGuidance") {
            sources.add("BAMIS, DAE, BRRI & BARI Official Guidance");
            if (res.source?.publisher) provenance.push(res.source.publisher);
          } else if (call.toolName === "getFarmActivityHistory") {
            sources.add("KrishiBondhu Farm Activity Log");
            provenance.push("Farmer Operational History");
          } else if (call.toolName === "getLocationWeatherForecast") {
            sources.add("Open-Meteo High-Resolution NWP API");
            if (res.current?.date) dataDate = res.current.date;
            if (res.meta?.numericalModel) provenance.push(res.meta.numericalModel);
            limitations.push("1–7 day deterministic NWP; extended days 8–16 have elevated uncertainty.");
          } else if (call.toolName === "getActiveWeatherAlerts") {
            sources.add("Agro-Meteorological Risk Engine");
            const issuingAuthorities = Array.isArray(res.alerts)
              ? [...new Set(res.alerts.filter(alert => alert.isGovernmentNotice && alert.issuingAuthority).map(alert => alert.issuingAuthority))]
              : [];
            for (const authority of issuingAuthorities) {
              sources.add(`${authority} Official Bulletins`);
            }
            provenance.push("KrishiBondhu deterministic agro-weather risk engine");
            limitations.push("Alerts strictly distinguish official government bulletins from internal agro-weather risks.");
            if (res.officialWarningsStatus === "UNAVAILABLE") {
              limitations.push("Official warning storage was unavailable; absence of returned bulletins does not establish that no government warning exists.");
            }
          } else if (call.toolName === "getAgriculturalRiskAssessment") {
            sources.add("KrishiBondhu Agricultural Risk Engine");
            const issuingAuthorities = Array.isArray(res.alerts)
              ? [...new Set(res.alerts.filter(alert => alert.isGovernmentNotice && alert.issuingAuthority).map(alert => alert.issuingAuthority))]
              : [];
            for (const authority of issuingAuthorities) {
              sources.add(`${authority} Official Bulletins`);
            }
            provenance.push("DAE / BRRI Agronomic Thresholds");
          } else if (call.toolName === "getWeeklyWeatherOutlook") {
            sources.add("Open-Meteo Seasonal Forecast API");
            provenance.push(res.source || "Open-Meteo Sub-seasonal Outlook");
            if (res.spatialResolution) limitations.push(res.spatialResolution);
            if (!dataDate) dataDate = res.weeklyTendencies?.find(week => week.status === "AVAILABLE")?.startDate || null;
          } else if (call.toolName === "getSeasonalCropOutlook") {
            sources.add("Open-Meteo Seasonal Forecast API");
            provenance.push(res.source || "Open-Meteo Seasonal Forecast API");
            if (res.spatialResolution) limitations.push(res.spatialResolution);
            if (!dataDate) dataDate = res.monthlyOutlooks?.find(month => month.status === "AVAILABLE")?.startDate || null;
          }
        }

        const cropKnowledgeWasRetrieved = geminiResult.executedTools.some((tool) => tool.toolName === "getCropKnowledge");
        if (catalogCrop && !isMarketQuestion(trimmedMessage) && !cropKnowledgeWasRetrieved) {
          const retrievedKnowledge = await toolExecutors.getCropKnowledge({ crop: catalogCrop.code, farmId, userId });
          const stageCalendar = intentContext.category === "flowering_stage" && catalogCrop.calendarAvailable
            ? await toolExecutors.getCropCalendarAdvisory({ crop: catalogCrop.code, district: lowerDistrict, stage: "flowering" })
            : null;
          responsePayload = buildIntentCropFallback({
            intent: intentContext.category,
            reportedStage: intentContext.farmerReportedStage,
            crop: catalogCrop,
            knowledge: retrievedKnowledge,
            calendar: stageCalendar,
            message: trimmedMessage,
            conversationId: effectiveConversationId,
          });
          responsePayload.meta.toolsCalled = ["getCropKnowledge", ...(stageCalendar ? ["getCropCalendarAdvisory"] : [])];
        } else {
          responsePayload = {
            answer: geminiResult.answer,
            language: isBanglaMessage(trimmedMessage) ? "bn" : "en",
            sources: Array.from(sources),
            dataDate: dataDate || null,
            dataQuality,
            provenance: provenance.length > 0 ? Array.from(new Set(provenance)) : ["KrishiBondhu Unified Intelligence Service"],
            limitations: limitations.length > 0 ? Array.from(new Set(limitations)) : ["Agricultural satellite and historical data subject to regional microclimates."],
            conversationId: effectiveConversationId,
            meta: {
              model: geminiResult.modelUsed,
              toolsCalled: geminiResult.executedTools.map((t) => t.toolName),
            },
          };
        }
      } catch (err) {
        // Fallback gracefully on Gemini error (rate limit, timeout, network failure)
        console.warn(`[chat.service] Gemini invocation failed, falling back to deterministic engine: ${err.message}`);
        responsePayload = null;
      }
    }

    // If Gemini was not configured or threw an error, use the deterministic grounded engine
    if (!responsePayload) {
      {
        const fallbackResult = await generateDeterministicFallback({
          message: trimmedMessage,
          district: lowerDistrict,
          crop,
          farmId,
          userId,
        });

        responsePayload = {
          answer: fallbackResult.answer,
          language: fallbackResult.language || "bn",
          sources: fallbackResult.sources,
          dataDate: fallbackResult.dataDate ?? null,
          dataQuality: fallbackResult.dataQuality,
          provenance: fallbackResult.provenance,
          limitations: fallbackResult.limitations,
          conversationId: effectiveConversationId,
          meta: {
            model: fallbackResult.modelUsed,
            toolsCalled: fallbackResult.executedTools.map((t) => t.toolName),
          },
        };
      }
    }

    // Update conversation session
    updateConversationHistory(effectiveConversationId, trimmedMessage, responsePayload.answer);

    return responsePayload;
  }
}

export const assistantChatService = new AssistantChatService();
