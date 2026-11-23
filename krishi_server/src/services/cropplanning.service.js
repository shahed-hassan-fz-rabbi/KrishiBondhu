/**
 * Crop Planning & Recommendation Engine.
 * Deterministic suitability filtering grounded in BAMIS / DAE / BRRI / BARI crop calendars,
 * enriched with NASA satellite observations and explained via Gemini (with deterministic fallback).
 *
 * Scientific Safeguards:
 * - Suitability is derived from verified agronomic factors (season, water, land type).
 * - No arbitrary numerical percentages or fake star ratings.
 * - Categorization: "supported", "potential", or "insufficient_info".
 * - Never invents fertilizer dosages, yield promises, or profit claims.
 */

import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.config.js";
import { loadOfficialCropCalendars } from "./croplifecycle.service.js";
import { SmapObservation } from "../models/smapobservation.model.js";
import { ModisObservation } from "../models/modisobservation.model.js";
import { snapshotService } from "./snapshot.service.js";
import { findLatestRecommendedSmapObservation, latestRecommendedSmapSnapshot } from "./nasa/smap.quality.js";
import { findLatestGoodModisObservation, latestGoodModisSnapshot } from "./nasa/modis.quality.js";
import { DISTRICT_UPAZILAS } from "../config/upazilas.config.js";

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const BENGALI_SOWING_PERIODS = {
  "Late June to Early July (Mid Asharh)": "জুনের শেষ থেকে জুলাইয়ের শুরু (মধ্য আষাঢ়)",
  "Early July to Mid July (Late Asharh)": "জুলাইয়ের শুরু থেকে মাঝামাঝি (শেষ আষাঢ়)",
  "Mid November to Early December (Agrahayan)": "নভেম্বরের মাঝামাঝি থেকে ডিসেম্বরের শুরু (অগ্রহায়ণ)",
  "Late November to Mid December (Agrahayan)": "নভেম্বরের শেষ থেকে ডিসেম্বরের মাঝামাঝি (অগ্রহায়ণ)",
  "Mid March to Mid April (Chaitra-Baishakh)": "মার্চের মাঝামাঝি থেকে এপ্রিলের মাঝামাঝি (চৈত্র-বৈশাখ)",
  "Late March to Mid April (Chaitra-Baishakh)": "মার্চের শেষ থেকে এপ্রিলের মাঝামাঝি (চৈত্র-বৈশাখ)",
  "Early November to Mid November (Kartik)": "নভেম্বরের শুরু থেকে মাঝামাঝি (কার্তিক)",
  "Late November to Early December (Agrahayan)": "নভেম্বরের শেষ থেকে ডিসেম্বরের শুরু (অগ্রহায়ণ)",
};

function localizeSowingPeriodBn(period) {
  return BENGALI_SOWING_PERIODS[period] || "সরকারি ক্যালেন্ডারে উল্লেখিত বপনের সময়";
}

function localizeCropMessageBn(message, crop) {
  const water = crop.waterRequirementMmTotal ?? "—";
  const period = localizeSowingPeriodBn(crop.sowingPeriod);
  const season = crop.seasonBn || "নির্ধারিত";
  if (message.startsWith("Aligned with official ")) return `${season} মৌসুমের সরকারি ক্যালেন্ডারের সঙ্গে মেলে। বপনের সময়: ${period}।`;
  if (message.startsWith("Crop is traditionally cultivated in ")) return `এই ফসল সাধারণত ${season} মৌসুমে (${period}) চাষ করা হয়, যা আপনার পছন্দের মৌসুমের সঙ্গে মেলে না।`;
  if (message === "Direct match for farmer's crop interest.") return "আপনার পছন্দের ফসলের সঙ্গে মেলে।";
  if (message.startsWith("Boro rice requires high cumulative irrigation")) return `শুষ্ক রবি মৌসুমে বোরো ধানে মোট প্রায় ${water} মিমি সেচের পানি লাগে। নিশ্চিত সেচ না থাকলে শুধু বৃষ্টির পানিতে চাষে ফসল নষ্ট হওয়ার ঝুঁকি আছে।`;
  if (message.startsWith("Requires careful Alternate Wetting and Drying")) return `সেচের পানি সীমিত হওয়ায় বোরো ধানে পালাক্রমে ভেজানো ও শুকানোর (AWD) পদ্ধতিতে সতর্কভাবে পানি ব্যবস্থাপনা দরকার (প্রায় ${water} মিমি)।`;
  if (message.startsWith("Assured irrigation meets")) return `নিশ্চিত সেচের ব্যবস্থা বোরোর শুষ্ক মৌসুমের ${water} মিমি পানির চাহিদা পূরণ করে।`;
  if (message.startsWith("Irrigation availability is unknown, so Boro")) return "সেচের পানির প্রাপ্যতা জানা নেই, তাই দেওয়া তথ্য থেকে বোরো ধানের পানির ব্যবস্থা যাচাই করা যাচ্ছে না।";
  if (message.startsWith("Low moisture requirement")) return `সরিষার পানির চাহিদা কম (প্রায় ${water} মিমি)। জমিতে থাকা অবশিষ্ট আর্দ্রতা ও ১–২ বার হালকা সেচে চাষ করা যেতে পারে।`;
  if (message.startsWith("Irrigation availability is unknown; residual soil moisture")) return "সেচের পানির প্রাপ্যতা জানা নেই। জমির অবশিষ্ট আর্দ্রতা ও প্রয়োজনে সেচের ব্যবস্থা স্থানীয়ভাবে যাচাই করুন।";
  if (message.startsWith("Can be cultivated with residual soil moisture")) return `আমন ধান কাটার পর জমিতে থাকা আর্দ্রতায় সরিষা চাষ করা যেতে পারে (মোট পানির চাহিদা প্রায় ${water} মিমি)।`;
  if (message.startsWith("Primary monsoon-fed crop")) return "খরিফ-২ মৌসুমের এই প্রধান ফসল বৃষ্টিনির্ভর; এলাকার বর্ষার বৃষ্টি সাধারণত চাষে সহায়তা করে।";
  if (message.startsWith("Monsoon rainfall supported with supplemental irrigation")) return "কুশি গঠন বা শীষ বের হওয়ার সময় বৃষ্টি কম হলে অতিরিক্ত সেচ দিয়ে আমন ধানের চাষে সহায়তা করা যায়।";
  if (message.startsWith("Moderate water requirement")) return `খরিফ-১ মৌসুমে আউশ ধানের পানির চাহিদা মাঝারি (প্রায় ${water} মিমি)।`;
  if (message.startsWith("Lowland is prone to deep monsoon submergence")) return "নিচু জমি বর্ষায় ৫০ সেন্টিমিটারের বেশি পানিতে ডুবে যেতে পারে। চারা নষ্ট হওয়া ঠেকাতে বন্যা-সহনশীল জাত (যেমন BRRI dhan51/52) বেছে নিন।";
  if (message.startsWith("Lowland is well-suited for Boro rice")) return "শীতের শুরুতে উপরিভাগের বন্যার পানি নেমে যাওয়ায় নিচু জমি বোরো ধানের জন্য উপযোগী হতে পারে।";
  if (message.startsWith("Lowland may stay waterlogged after monsoon")) return "বর্ষার পর নিচু জমিতে পানি জমে থাকতে পারে। সরিষার বীজ পচা এড়াতে সময়মতো পানি নিষ্কাশন দরকার।";
  if (message.startsWith("High to medium-high land provides good drainage")) return "উঁচু ও মাঝারি-উঁচু জমিতে পানি ভালোভাবে নেমে যায়, যা সরিষার শিকড়ের বাতাস চলাচল ও বীজ গজানোর জন্য দরকারি।";
  if (message.startsWith("Medium-high land is prime")) return "নিয়ন্ত্রিত আইলসহ রোপা আমন ধানের জন্য মাঝারি-উঁচু জমি উপযোগী।";
  if (message.startsWith("Waterlogged drainage is detrimental to mustard")) return "জমিতে পানি জমে থাকলে সরিষার চারা গজানো বাধাগ্রস্ত হয়। উঁচু বেড তৈরি বা নালা কেটে পানি নিষ্কাশন করুন।";
  if (message.startsWith("Selected planting date falls within")) return `আপনার বেছে নেওয়া রোপণের তারিখ সরকারি বপন-সময়ের মধ্যে: ${period}।`;
  if (message.startsWith("Selected planting date is outside")) return `আপনার বেছে নেওয়া রোপণের তারিখ সরকারি বপন-সময়ের বাইরে। উপযুক্ত সময় ${period}; স্থানীয় কৃষি কর্মকর্তার সঙ্গে মিলিয়ে নিন।`;
  if (message.startsWith("The official sowing window could not be compared")) return "সরকারি বপন-সময়ের সঙ্গে আপনার তারিখের তুলনা করা যায়নি। স্থানীয় কৃষি কর্মকর্তার সঙ্গে সময়টি যাচাই করুন।";
  return "এই ফসলের উপযোগিতা ও চাষের সময় স্থানীয় কৃষি কর্মকর্তার সঙ্গে যাচাই করুন।";
}

function parseCalendarEndpoint(value) {
  const match = value.trim().match(/^(Early|Mid|Late)\s+(January|February|March|April|May|June|July|August|September|October|November|December)$/i);
  if (!match) return null;
  const [, portion, monthName] = match;
  const month = MONTHS[monthName.toLowerCase()];
  const day = portion.toLowerCase() === "early" ? 1 : portion.toLowerCase() === "mid" ? 11 : 21;
  const lastDay = new Date(Date.UTC(2024, month, 0)).getUTCDate();
  return { month, day: portion.toLowerCase() === "late" ? lastDay : portion.toLowerCase() === "mid" ? Math.min(20, lastDay) : 10 };
}

function getPlantingWindowStatus(sowingPeriod, targetPlantingPeriod) {
  if (!targetPlantingPeriod) return "not_requested";
  const [year, month, day] = targetPlantingPeriod.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day));
  const range = sowingPeriod?.replace(/\s*\([^)]*\)\s*$/, "").split(/\s+to\s+/i);
  if (!range || range.length !== 2) return "window_unparsed";
  const start = parseCalendarEndpoint(range[0]);
  const end = parseCalendarEndpoint(range[1]);
  if (!start || !end) return "window_unparsed";
  const value = month * 100 + day;
  const startValue = start.month * 100 + start.day;
  const endValue = end.month * 100 + end.day;
  return value >= startValue && value <= endValue ? "within_window" : "outside_window";
}

/**
 * Evaluates candidate crops for a given district and land/water profile.
 */
export function evaluateCropEligibility({
  districtCode,
  upazila,
  landType = "unknown",
  soilType = "unknown",
  drainage = "unknown",
  irrigationAvailability = "unknown",
  waterSource = "",
  seasonPreference = null,
  preferredCrop = null,
  targetPlantingPeriod = null,
}) {
  const calendars = loadOfficialCropCalendars();
  const lowerDistrict = (districtCode || "").trim().toLowerCase();

  if (targetPlantingPeriod) {
    const parsedDate = new Date(`${targetPlantingPeriod}T00:00:00.000Z`);
    if (typeof targetPlantingPeriod !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(targetPlantingPeriod) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== targetPlantingPeriod) {
      return { isValid: false, error: "Target planting date must be a valid YYYY-MM-DD date." };
    }
  }

  // Validate district
  if (!calendars.metadata.districts.includes(lowerDistrict)) {
    return {
      isValid: false,
      error: `District '${districtCode}' is not currently supported for official crop planning. Supported districts: ${calendars.metadata.districts.join(", ")}.`,
    };
  }

  const eligibleCrops = [];
  const missingInfo = [];
  const preferredCropCode = typeof preferredCrop === "string" ? preferredCrop.trim().toLowerCase() : "";

  // Identify missing optional inputs
  if (!soilType || soilType === "unknown") {
    missingInfo.push("Soil type not specified; soil-dependent suitability is incomplete. A local soil test is recommended.");
  }
  if (!landType || landType === "unknown" || landType === "unspecified") {
    missingInfo.push("Land elevation/type not specified; land-dependent suitability is incomplete.");
  }
  if (!drainage || drainage === "unknown") {
    missingInfo.push("Drainage condition not provided; drainage-dependent suitability cannot be fully assessed.");
  }
  if (!irrigationAvailability || irrigationAvailability === "unknown") {
    missingInfo.push("Irrigation availability not confirmed; water access cannot be assumed.");
  }
  if (!waterSource && irrigationAvailability !== "unavailable") {
    missingInfo.push("Water source unspecified.");
  }

  // Iterate over verified crops in official dataset
  for (const crop of calendars.crops) {
    const districtCal = crop.districts[lowerDistrict];
    if (!districtCal) continue;

    const reasons = [];
    const constraints = [];
    let suitabilityCategory = "supported"; // 'supported' | 'potential' | 'insufficient_info'

    // 1. Season Alignment
    const cropSeason = crop.season.toLowerCase(); // 'kharif-1', 'kharif-2', 'robi' / 'rabi'
    let isSeasonMatch = true;

    if (seasonPreference) {
      const pref = seasonPreference.trim().toLowerCase();
      if (pref.includes("rabi") || pref.includes("robi") || pref === "winter") {
        isSeasonMatch = cropSeason.includes("rabi") || cropSeason.includes("robi");
      } else if (pref.includes("kharif-1") || pref.includes("aus") || pref === "early_monsoon") {
        isSeasonMatch = cropSeason.includes("kharif-1");
      } else if (pref.includes("kharif-2") || pref.includes("aman") || pref === "monsoon") {
        isSeasonMatch = cropSeason.includes("kharif-2");
      }
    }

    if (!isSeasonMatch) {
      // If user specified a different season, downgrade or note season divergence
      suitabilityCategory = "potential";
      constraints.push(`Crop is traditionally cultivated in ${crop.season} (${districtCal.sowingPeriod}), which differs from preferred season '${seasonPreference}'.`);
    } else {
      reasons.push(`Aligned with official ${crop.season} season (${districtCal.sowingPeriod}).`);
    }

    // 2. Preferred Crop Filter
    const isPreferred = Boolean(preferredCropCode && crop.cropId.toLowerCase() === preferredCropCode);
    if (preferredCropCode) {
      if (isPreferred) {
        reasons.push("Direct match for farmer's crop interest.");
      }
    }

    // 3. Water Availability Evaluation
    const waterMm = districtCal.waterRequirementMmTotal;
    if (crop.cropId === "boro_rice") {
      if (irrigationAvailability === "unavailable") {
        suitabilityCategory = "potential";
        constraints.push(`Boro rice requires high cumulative irrigation (~${waterMm} mm) during dry Rabi season. Rainfed cultivation without assured irrigation risks total crop failure.`);
      } else if (irrigationAvailability === "limited") {
        suitabilityCategory = "potential";
        constraints.push(`Requires careful Alternate Wetting and Drying (AWD) water management due to limited irrigation (~${waterMm} mm demand).`);
      } else if (irrigationAvailability === "available") {
        reasons.push(`Assured irrigation meets the ${waterMm} mm dry-season requirement for Boro rice.`);
      } else {
        suitabilityCategory = "potential";
        constraints.push("Irrigation availability is unknown, so Boro water supply cannot be assessed from the provided profile.");
      }
    } else if (crop.cropId === "mustard") {
      if (irrigationAvailability === "available" || irrigationAvailability === "limited") {
        reasons.push(`Low moisture requirement (~${waterMm} mm) makes mustard highly compatible with residual soil moisture and 1-2 light supplemental irrigations.`);
      } else if (irrigationAvailability === "unknown") {
        suitabilityCategory = "potential";
        constraints.push("Irrigation availability is unknown; residual soil moisture and supplemental water access must be checked locally.");
      } else {
        reasons.push(`Can be cultivated with residual soil moisture (~${waterMm} mm total requirement) following Aman harvest.`);
      }
    } else if (crop.cropId === "monsoon_aman") {
      if (irrigationAvailability === "unavailable") {
        reasons.push("Primary monsoon-fed crop (Kharif-2); naturally supported by regional monsoon rainfall.");
      } else {
        reasons.push("Monsoon rainfall supported with supplemental irrigation for dry spells during tillering or panicle initiation.");
      }
    } else if (crop.cropId === "aus_rice") {
      reasons.push(`Moderate water requirement (~${waterMm} mm) during early monsoon Kharif-I.`);
    }

    // 4. Land Type Evaluation
    const lowerLandType = (landType || "").toLowerCase();
    if (lowerLandType === "low") {
      if (crop.cropId === "monsoon_aman") {
        suitabilityCategory = "potential";
        constraints.push("Lowland is prone to deep monsoon submergence (>50 cm); requires flood-tolerant varieties (e.g. BRRI dhan51/52) to avoid seedling drowning.");
      } else if (crop.cropId === "boro_rice") {
        reasons.push("Lowland is well-suited for Boro rice as surface floodwaters recede in early winter.");
      } else if (crop.cropId === "mustard") {
        suitabilityCategory = "potential";
        constraints.push("Lowland may stay waterlogged after monsoon; mustard requires timely drying to avoid seed rot.");
      }
    } else if (lowerLandType === "high" || lowerLandType === "medium_high") {
      if (crop.cropId === "mustard") {
        reasons.push("High to medium-high land provides good drainage essential for mustard root aeration and seed germination.");
      } else if (crop.cropId === "monsoon_aman") {
        reasons.push("Medium-high land is prime for transplanted Aman rice with controlled bunding.");
      }
    }

    // Drainage alert
    if (["poor", "waterlogged"].includes(drainage) && crop.cropId === "mustard") {
      suitabilityCategory = "potential";
      constraints.push("Waterlogged drainage is detrimental to mustard emergence. Raised beds or drainage ditches required.");
    }

    const plantingTimingStatus = getPlantingWindowStatus(districtCal.sowingPeriod, targetPlantingPeriod);
    if (plantingTimingStatus === "within_window") {
      reasons.push(`Selected planting date falls within the broad official sowing window (${districtCal.sowingPeriod}).`);
    } else if (plantingTimingStatus === "outside_window") {
      if (suitabilityCategory === "supported") suitabilityCategory = "potential";
      constraints.push(`Selected planting date is outside the broad official sowing window (${districtCal.sowingPeriod}); confirm timing with a local DAE officer.`);
    } else if (plantingTimingStatus === "window_unparsed") {
      constraints.push("The official sowing window could not be compared with the selected date; confirm timing with a local DAE officer.");
    }

    eligibleCrops.push({
      cropCode: crop.cropId,
      cropNameEn: crop.nameEn,
      cropNameBn: crop.nameBn,
      scientificName: crop.scientificName,
      season: crop.season,
      seasonBn: crop.seasonBn,
      typicalVarieties: crop.typicalVarieties,
      recommendedVarieties:
        typeof crop.typicalVarieties === "string"
          ? crop.typicalVarieties.split(",").map((s) => s.trim())
          : Array.isArray(crop.typicalVarieties)
          ? crop.typicalVarieties
          : [],
      totalDurationDays: districtCal.totalDurationDays,
      sowingPeriod: districtCal.sowingPeriod,
      transplantingPeriod: districtCal.transplantingPeriod,
      harvestingPeriod: districtCal.harvestingPeriod,
      plantingTimingStatus,
      waterRequirementMmTotal: districtCal.waterRequirementMmTotal,
      suitabilityCategory,
      suitability: suitabilityCategory,
      isPreferred,
      reasons,
      constraints,
      weatherHazardsSummary: districtCal.stages.map((s) => s.weatherHazards).filter(Boolean).slice(0, 2),
      sourceReferences: {
        title: districtCal.sourceDocumentTitle,
        publisher: districtCal.sourcePublisher,
        url: districtCal.sourceDocumentUrl,
        daeRegion: districtCal.daeRegion,
      },
    });
  }

  // Respect the farmer's stated crop interest while retaining all calendar-backed
  // alternatives so the result remains useful when the preferred crop has constraints.
  eligibleCrops.sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred));

  return {
    isValid: true,
    districtCode: lowerDistrict,
    districtName: lowerDistrict === "cumilla" ? "Cumilla" : "Chattogram",
    upazila: upazila || null,
    crops: eligibleCrops,
    eligibleCrops,
    missingInfo,
    metadata: calendars.metadata,
    evaluationTimestamp: new Date().toISOString(),
  };
}

/**
 * Retrieves latest NASA environmental context for the planning district.
 */
export async function getPlanningSatelliteContext(districtCode) {
  const lowerDistrict = typeof districtCode === "string" ? districtCode.trim().toLowerCase() : "";
  if (!["cumilla", "chattogram"].includes(lowerDistrict)) {
    return { districtCode: lowerDistrict || null, status: "UNAVAILABLE", reason: "unsupported_or_missing_district", smap: null, modis: null, soilMoistureProxy: null, vegetationIndexProxy: null };
  }
  let smap = null;
  let modis = null;

  if (snapshotService.isDbConnected()) {
    try {
      smap = await findLatestRecommendedSmapObservation(SmapObservation, lowerDistrict);
      modis = await findLatestGoodModisObservation(ModisObservation, lowerDistrict);
    } catch {
      // Fallback
    }
  }

  if (!smap) {
    smap = latestRecommendedSmapSnapshot(snapshotService.getSmapSnapshot(lowerDistrict), lowerDistrict);
  }
  if (!modis) {
    modis = latestGoodModisSnapshot(snapshotService.getModisSnapshot(lowerDistrict), lowerDistrict);
  }

  return {
    districtCode: lowerDistrict,
    status: smap || modis ? "AVAILABLE" : "UNAVAILABLE",
    smap: smap
      ? {
          soilMoistureM3M3: smap.soilMoisture,
          unit: smap.unit || "m³/m³",
          dateLabel: smap.dateLabel,
          qualityClassification: smap.qualityClassification,
        }
      : null,
    modis: modis
      ? {
          ndviMean: modis.ndvi,
          eviMean: modis.evi,
          dateLabel: modis.dateLabel,
          qualityClassification: modis.qualityClassification,
        }
      : null,
    soilMoistureProxy: smap
      ? {
          value: smap.soilMoisture,
          unit: smap.unit || "m³/m³",
          observedDate: smap.dateLabel,
          quality: smap.qualityClassification,
          disclaimer: "NASA SMAP measures top 0-5 cm surface soil moisture proxy, not root-zone saturation.",
        }
      : null,
    vegetationIndexProxy: modis
      ? {
          ndvi: modis.ndvi,
          evi: modis.evi,
          observedDate: modis.dateLabel,
          quality: modis.qualityClassification,
          disclaimer: "NASA MODIS 250m indicates regional canopy greenness, not a plant pathology diagnosis.",
        }
      : null,
  };
}

/**
 * Generates natural language planning explanation using Gemini,
 * falling back to a deterministic explanation on quota or network failure.
 */
export async function generatePlanningExplanation(args = {}) {
  const language = args.language === "en" ? "en" : "bn";
  const isBangla = language === "bn";

  // Normalize parameters whether passed nested or flat
  const farmerProfile = args.farmerProfile || {
    upazila: args.upazila,
    land: args.land || {},
    water: args.water || {},
    preferences: args.preferences || {},
  };

  const evaluationResult = args.evaluationResult || {
    districtCode: args.districtCode,
    districtName: (args.districtCode || "").toLowerCase() === "cumilla" ? "Cumilla" : "Chattogram",
    eligibleCrops: args.eligibleCrops || args.crops || [],
  };

  const environmentalContext = args.environmentalContext || args.satelliteContext || {};
  const apiKey = env.geminiApiKey;
  let geminiOutput = null;
  const upazilaBn = Object.values(DISTRICT_UPAZILAS)
    .flat()
    .find((item) => item.nameEn.toLowerCase() === String(farmerProfile.upazila || "").toLowerCase())?.nameBn || "";
  const districtName = isBangla
    ? ((evaluationResult.districtCode || "").toLowerCase() === "cumilla" ? "কুমিল্লা" : "চট্টগ্রাম")
    : evaluationResult.districtName;
  const placeName = isBangla ? upazilaBn : farmerProfile.upazila;
  const localizedCrops = evaluationResult.eligibleCrops.map((crop) => ({
    ...crop,
    displayName: isBangla ? crop.cropNameBn : crop.cropNameEn,
    displaySeason: isBangla ? crop.seasonBn : crop.season,
    displaySowingPeriod: isBangla ? localizeSowingPeriodBn(crop.sowingPeriod) : crop.sowingPeriod,
    displayReasons: isBangla ? crop.reasons.map((reason) => localizeCropMessageBn(reason, crop)) : crop.reasons,
    displayConstraints: isBangla ? crop.constraints.map((item) => localizeCropMessageBn(item, crop)) : crop.constraints,
    displaySuitability: isBangla
      ? ({ supported: "তথ্য অনুযায়ী উপযোগী", potential: "বিবেচনা প্রয়োজন", insufficient_info: "তথ্য অপর্যাপ্ত" }[crop.suitabilityCategory] || "তথ্য অপর্যাপ্ত")
      : crop.suitabilityCategory,
  }));
  const landTypeLabelsBn = {
    high: "উঁচু জমি",
    medium_high: "মাঝারি-উঁচু জমি",
    low: "নিচু জমি",
    unspecified: "উল্লেখ করা হয়নি",
    unknown: "জানা নেই",
  };
  const irrigationLabelsBn = {
    available: "পর্যাপ্ত",
    limited: "সীমিত",
    unavailable: "নেই",
    unknown: "জানা নেই",
  };

  // Attempt Gemini if configured
  if (apiKey && apiKey.length > 20 && !apiKey.startsWith("YOUR_")) {
    try {
      const ai = new GoogleGenAI({ apiKey, apiVersion: "v1beta" });
      const prompt = `
You are the grounded agricultural planning advisor of KrishiBondhu.
Explain the following verified crop planning evaluation to a Bangladeshi farmer in simple, respectful, and crystal-clear ${isBangla ? "Bangla (চলিত বাংলা)" : "English"}.
${isBangla ? "Write every explanatory sentence only in Bangla. Do not use English prose, English season names, English month names, or English crop explanations. Keep only official abbreviations, scientific names, and variety identifiers as written." : "Write the full response in English."}

STRICT RULES:
1. Ground your answer ONLY in the provided verified data below.
2. DO NOT invent fertilizer dosage, pesticide quantities, seed costs, yield figures, or profit guarantees.
3. If irrigation or land conditions present a constraint, explain why gently and constructively.
4. Distinguish between crops supported by data and those requiring field adjustments.
5. Advise the farmer to consult their local DAE (উপজেলা কৃষি অফিস) Sub-Assistant Agriculture Officer (SAAO) for field-level seed selection and soil test fertilizer guidance.
6. No emojis, no markdown tables. Keep paragraphs natural and readable.

Farmer & Plot Context:
- District: ${districtName} (${evaluationResult.districtCode})
- Upazila: ${placeName || (isBangla ? "উল্লেখ করা হয়নি" : "Not specified")}
- Land Area: ${farmerProfile.land?.area || "N/A"} ${farmerProfile.land?.unit || "decimal"}
- Land Type: ${isBangla ? landTypeLabelsBn[farmerProfile.land?.landType] || "জানা নেই" : farmerProfile.land?.landType || "unknown / not supplied"}
- Irrigation Availability: ${isBangla ? irrigationLabelsBn[farmerProfile.water?.irrigationAvailability] || "জানা নেই" : farmerProfile.water?.irrigationAvailability || "unknown"}

Verified Eligible Crops from Official BAMIS / DAE Crop Calendars:
${localizedCrops
  .map(
    (c) => `
* ${c.displayName} - Season: ${c.displaySeason} (~${c.totalDurationDays} ${isBangla ? "দিন" : "days"})
  - Official Planting Period: ${c.displaySowingPeriod}
  - Suitability Status: ${c.displaySuitability}
  - Key Agronomic Reasons: ${c.displayReasons.join("; ")}
  - Constraints/Cautions: ${c.displayConstraints.length > 0 ? c.displayConstraints.join("; ") : isBangla ? "ক্যালেন্ডারে কোনো সতর্কতা উল্লেখ নেই" : "None reported in calendar"}
`
  )
  .join("\n")}

NASA Environmental Satellite Context:
- Surface Soil Moisture (SMAP 0-5 cm): ${environmentalContext.soilMoistureProxy ? `${environmentalContext.soilMoistureProxy.value} m³/m³ (Date: ${environmentalContext.soilMoistureProxy.observedDate})` : "Unavailable: no quality-approved observation is available; do not infer soil moisture."}
- Regional Canopy Greenness (MODIS NDVI): ${environmentalContext.vegetationIndexProxy ? `${environmentalContext.vegetationIndexProxy.ndvi} (Date: ${environmentalContext.vegetationIndexProxy.observedDate})` : "Unavailable: no rank-0 quality observation is available; do not infer vegetation condition."}
`;

      const geminiPromise = ai.models.generateContent({
        model: env.geminiModel || "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Gemini generation timed out after 7000ms")), 7000)
      );
      const response = await Promise.race([geminiPromise, timeoutPromise]);

      if (response && response.text) {
        geminiOutput = response.text.trim();
        // A few English prose words indicate the model ignored the requested language.
        // Fall back to the fully localized, deterministic explanation in that case.
        const englishProse = /\b(?:the|and|is|are|was|were|with|from|for|or|to|in|on|of|this|that|your|crop|soil|water|season|official|planting|window|requires|suitable|supported|irrigation|rainfall|harvest|november|december|january|february|march|april|may|june|july|august|september|october|based|because|also|during|check|consult|recommend|recommended|locally|area|district|report|according|limited|available|data|low|high|rice|mustard|aman|boro|aus|kharif|rabi|robi|decimal|acre|hectare|potential|profile|advisory|agriculture)\b/i;
        if (isBangla && englishProse.test(geminiOutput)) geminiOutput = null;
      }
    } catch (err) {
      console.warn(`[cropplanning.service] Gemini explanation failed, falling back to deterministic explanation: ${err.message}`);
    }
  }

  // Deterministic Grounded Fallback
  if (!geminiOutput) {
    if (isBangla) {
      const topCrops = evaluationResult.eligibleCrops.filter((c) => c.suitabilityCategory === "supported");
      const potentialCrops = evaluationResult.eligibleCrops.filter((c) => c.suitabilityCategory === "potential");

      let text = `আপনার ${districtName} জেলার ${placeName || ""} এলাকার জমির জন্য সরকারি বিএএমআইএস (BAMIS) ও ডিএই (DAE) ফসল পঞ্জিকা অনুযায়ী ফসলের উপযোগিতা যাচাই করা হয়েছে।\n\n`;

      if (topCrops.length > 0) {
        text += `বিদ্যমান তথ্যানুযায়ী সরাসরি উপযোগী ফসল:\n`;
        localizedCrops.filter((c) => c.suitabilityCategory === "supported").forEach((c) => {
          text += `• ${c.cropNameBn} (${c.seasonBn}): রোপণের উপযুক্ত সময় ${c.displaySowingPeriod}। জীবনকাল প্রায় ${c.totalDurationDays} দিন। পানির চাহিদা প্রায় ${c.waterRequirementMmTotal} মিমি। ${c.displayReasons.join(" ")}\n`;
        });
        text += `\n`;
      }

      if (potentialCrops.length > 0) {
        text += `বিবেচনাধীন বিকল্পসমূহ:\n`;
        localizedCrops.filter((c) => c.suitabilityCategory === "potential").forEach((c) => {
          text += `• ${c.cropNameBn}: ${c.displayConstraints.join(" ")}\n`;
        });
        text += `\n`;
      }

      text += `পরিবেশগত সতর্কতা:\nনাসা এসএমএপি (NASA SMAP) অনুযায়ী মাটির উপরিভাগের (০-৫ সেমি) আর্দ্রতা এবং বিএএমআইএস আবহাওয়া সতর্কবার্তা অনুসারে জাত নির্বাচন করুন। রাসায়নিক সারের সঠিক মাত্রার জন্য স্থানীয় উপজেলা কৃষি কর্মকর্তা (DAE / SAAO)-এর পরামর্শ নিন।`;

      geminiOutput = text;
    } else {
      const topCrops = evaluationResult.eligibleCrops.filter((c) => c.suitabilityCategory === "supported");
      const potentialCrops = evaluationResult.eligibleCrops.filter((c) => c.suitabilityCategory === "potential");

      let text = `Based on official BAMIS and DAE agricultural crop calendars for ${evaluationResult.districtName} District (${farmerProfile.upazila || ""}), crop options have been evaluated:\n\n`;

      if (topCrops.length > 0) {
        text += `Directly Supported Options:\n`;
        localizedCrops.filter((c) => c.suitabilityCategory === "supported").forEach((c) => {
          text += `• ${c.cropNameEn} (${c.season}): Recommended sowing period is ${c.displaySowingPeriod} with an estimated duration of ${c.totalDurationDays} days. Water demand is ~${c.waterRequirementMmTotal} mm. ${c.displayReasons.join(" ")}\n`;
        });
        text += `\n`;
      }

      if (potentialCrops.length > 0) {
        text += `Options with Field Considerations:\n`;
        localizedCrops.filter((c) => c.suitabilityCategory === "potential").forEach((c) => {
          text += `• ${c.cropNameEn}: ${c.displayConstraints.join(" ")}\n`;
        });
        text += `\n`;
      }

      text += `Environmental Context:\nNASA SMAP indicates regional top-soil moisture proxies. Consult your local DAE Upazila Agriculture Officer (SAAO) for soil test fertilizer dosages and certified seed selection.`;

      geminiOutput = text;
    }
  }

  return geminiOutput;
}
