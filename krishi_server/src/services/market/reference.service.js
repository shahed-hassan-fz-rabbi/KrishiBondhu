import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const serviceDir = path.dirname(fileURLToPath(import.meta.url));
const referenceDir = path.resolve(serviceDir, "../../../science/data/reference");
const historyFile = path.join(referenceDir, "worldbank_reference_history.json.gz");
const forecastFile = path.join(referenceDir, "worldbank_reference_forecasts.json");
const ALIASES = new Map([
  ["lentil", "lentils-masur"], ["lentils", "lentils-masur"], ["masur", "lentils-masur"], ["masoor", "lentils-masur"], ["মসুর", "lentils-masur"], ["মসুর ডাল", "lentils-masur"],
  ["oil", "oil-palm"], ["palm oil", "oil-palm"], ["তেল", "oil-palm"], ["পাম তেল", "oil-palm"],
  ["rice", "rice-coarse"], ["coarse rice", "rice-coarse"], ["চাল", "rice-coarse"], ["মোটা চাল", "rice-coarse"],
  ["wheat flour", "wheat-flour"], ["flour", "wheat-flour"], ["atta", "wheat-flour"], ["আটা", "wheat-flour"],
]);
const DIVISION_ALIASES = new Map([
  ["barisal", "Barishal"], ["barishal", "Barishal"], ["chattogram", "Chattogram"], ["চট্টগ্রাম", "Chattogram"], ["chittagong", "Chattogram"], ["chattagram", "Chattogram"], ["cumilla", "Chattogram"], ["কুমিল্লা", "Chattogram"],
  ["ঢাকা", "Dhaka"], ["খুলনা", "Khulna"], ["রাজশাহী", "Rajshahi"], ["রংপুর", "Rangpur"], ["সিলেট", "Sylhet"], ["ময়মনসিংহ", "Mymensingh"], ["জাতীয়", "National"], ["national", "National"], ["all", "National"],
]);
let historyCache;
let forecastCache;

export class MarketReferenceError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = "MarketReferenceError";
    this.code = code;
    this.status = status;
  }
}

async function readHistory() {
  if (!historyCache) {
    const bytes = await fs.readFile(historyFile);
    historyCache = JSON.parse(gunzipSync(bytes).toString("utf8"));
  }
  return historyCache;
}

async function readForecasts() {
  if (!forecastCache) forecastCache = JSON.parse(await fs.readFile(forecastFile, "utf8"));
  return forecastCache;
}

export function normalizeReferenceCrop(value) {
  const normalized = String(value || "").trim().toLocaleLowerCase("en");
  if (ALIASES.has(normalized)) return ALIASES.get(normalized);
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function normalizeReferenceDivision(value) {
  const normalized = String(value || "National").trim();
  return DIVISION_ALIASES.get(normalized.toLocaleLowerCase("en")) || normalized;
}

export async function getMarketReferenceCatalog() {
  let history;
  try { history = await readHistory(); }
  catch { throw new MarketReferenceError("REFERENCE_DATA_NOT_READY", 503, "Monthly reference prices are not built yet."); }
  const crops = new Map();
  const divisions = new Set();
  for (const point of history.points) {
    crops.set(point.cropId, { cropId: point.cropId, cropNameEn: point.cropNameEn, cropNameBn: point.cropNameBn, unit: point.unit });
    divisions.add(point.division);
  }
  return {
    crops: [...crops.values()].sort((a, b) => a.cropNameEn.localeCompare(b.cropNameEn)),
    divisions: [...divisions].sort((a, b) => a === "National" ? -1 : b === "National" ? 1 : a.localeCompare(b)),
    frequency: history.frequency, priceType: history.priceType,
    source: history.source, sourceUrl: history.sourceUrl,
    datasetVersion: history.datasetVersion, updatedAt: history.updatedAt,
    limitations: history.limitations,
  };
}

export async function getMarketReferenceSeries({ cropId, division = "National" } = {}) {
  let history;
  let forecasts;
  try { [history, forecasts] = await Promise.all([readHistory(), readForecasts()]); }
  catch { throw new MarketReferenceError("REFERENCE_DATA_NOT_READY", 503, "Monthly reference prices are not built yet."); }
  const selectedCropId = normalizeReferenceCrop(cropId);
  const selectedDivision = normalizeReferenceDivision(division);
  const observations = history.points.filter((point) => point.cropId === selectedCropId && point.division === selectedDivision);
  if (!observations.length) {
    throw new MarketReferenceError("REFERENCE_SERIES_UNAVAILABLE", 404, "No monthly reference series is available for that crop and division.");
  }
  const latest = observations[observations.length - 1];
  return {
    cropId: latest.cropId, cropNameEn: latest.cropNameEn, cropNameBn: latest.cropNameBn,
    division: selectedDivision, unit: latest.unit, priceType: history.priceType,
    frequency: history.frequency, source: history.source, sourceUrl: history.sourceUrl,
    datasetVersion: history.datasetVersion, dataUpdatedAt: history.updatedAt,
    aggregation: latest.aggregation, observations,
    forecast: forecasts.forecasts.find((item) => item.cropId === selectedCropId && item.division === selectedDivision) || null,
    forecastModelVersion: forecasts.modelVersion, forecastHorizon: forecasts.horizonSupported,
    limitations: history.limitations,
  };
}
