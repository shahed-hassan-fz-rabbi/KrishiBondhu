import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const catalogPath = path.resolve(__dirname, "../../data/crops/crop_catalog.json");
const calendarsPath = path.resolve(__dirname, "../../data/crops/official_crop_calendars.json");
const knowledgePath = path.resolve(__dirname, "../../data/crops/crop_knowledge.json");
const managementPath = path.resolve(__dirname, "../../data/crops/crop_management.json");

let cachedCatalog;
let cachedCalendars;
let cachedKnowledge;
let cachedManagement;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadCropCatalog() {
  if (!cachedCatalog) cachedCatalog = readJson(catalogPath);
  if (!cachedCalendars) cachedCalendars = readJson(calendarsPath);
  if (!cachedKnowledge) cachedKnowledge = readJson(knowledgePath);
  if (!cachedManagement) cachedManagement = readJson(managementPath);
  const verifiedCrops = new Map(cachedCalendars.crops.map((crop) => [crop.cropId, crop]));
  const knowledgeCrops = new Map(cachedKnowledge.crops.map((crop) => [crop.cropId, crop]));
  return {
    metadata: {
      ...cachedCatalog.metadata,
      generalKnowledgeCheckedOn: cachedKnowledge.metadata.sourceCheckedOn,
      generalKnowledgeScope: cachedKnowledge.metadata.scope,
      managementReferenceCheckedOn: cachedManagement.metadata.sourceCheckedOn,
      managementReferenceScope: cachedManagement.metadata.scope,
    },
    crops: cachedCatalog.crops.map((item) => {
      const calendar = verifiedCrops.get(item.code);
      const knowledge = knowledgeCrops.get(item.code);
      const management = cachedManagement.crops[item.code];
      const managementFields = management?.fields || {};
      const verifiedManagementFields = Object.entries(managementFields)
        .filter(([, field]) => String(field.status || "").startsWith("verified"))
        .map(([field]) => field);
      if (calendar) {
        for (const field of ["lifecycle", "timing", "water"]) {
          if (!verifiedManagementFields.includes(field)) verifiedManagementFields.push(field);
        }
      }
      const officialCalendarDistricts = calendar ? Object.keys(calendar.districts || {}) : [];
      return {
        ...item,
        cropId: item.code,
        knowledgeAvailable: Boolean(knowledge?.generalGuide),
        generalGuide: knowledge?.generalGuide || null,
        knowledgeTopics: knowledge?.topics || [],
        knowledgeSources: knowledge?.sources || [],
        managementStatus: verifiedManagementFields.length === 5 ? "verified" : (verifiedManagementFields.length ? "partially_verified" : "not_verified"),
        verifiedManagementFields,
        verificationNote: knowledge?.verificationNote || null,
        ...(calendar ? {
          nameEn: calendar.nameEn,
          nameBn: calendar.nameBn,
          season: calendar.season,
          seasonBn: calendar.seasonBn,
          scientificName: calendar.scientificName,
          typicalVarieties: calendar.typicalVarieties
            ? calendar.typicalVarieties.split(",").map((variety) => variety.trim()).filter(Boolean)
            : [],
        } : { typicalVarieties: [] }),
        officialCalendarDistricts,
        calendarAvailable: officialCalendarDistricts.length > 0,
        planningAvailable: officialCalendarDistricts.length > 0 || verifiedManagementFields.length > 0,
        dataStatus: officialCalendarDistricts.length > 0
          ? "verified_calendar"
          : verifiedManagementFields.length > 0 ? "verified_management" : (knowledge?.generalGuide ? "general_reference" : "catalog_only"),
      };
    }),
  };
}

export function getCropByCode(code) {
  const normalized = String(code || "").trim().toLowerCase();
  return loadCropCatalog().crops.find((crop) => crop.code === normalized) || null;
}

export function getCropKnowledge(code) {
  const normalized = String(code || "").trim().toLowerCase();
  if (!cachedKnowledge) cachedKnowledge = readJson(knowledgePath);
  return cachedKnowledge.crops.find((crop) => crop.cropId === normalized) || null;
}

export function isRegisteredCropCode(code) {
  return Boolean(getCropByCode(code));
}
