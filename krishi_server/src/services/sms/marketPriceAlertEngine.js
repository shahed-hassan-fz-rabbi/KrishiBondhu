import {
  OFFICIAL_MARKET_SOURCE_HOSTS,
  resolveMarketAlertThresholds,
} from "../../config/marketAlert.config.js";

/**
 * Market price SMS alert DECISION ENGINE (Part 3C.2).
 *
 * Pure functions: no network, no database, no timers, no SMS delivery.
 * Only administrator-verified DAM/Ministry observations are accepted. Modeled
 * World Bank estimates, historical archives, research rows and forecast
 * outputs are never treated as a live price. Uncertain data fails closed.
 */

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const toBengaliDigits = (value) => String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
const normalise = (value) => String(value ?? "").trim().toLocaleLowerCase("en");

export function officialSourceHost(sourceUrl) {
  try {
    return new URL(String(sourceUrl || "")).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isOfficialVerifiedObservation(observation) {
  if (!observation || observation.qualityStatus !== "verified") return false;
  if (!OFFICIAL_MARKET_SOURCE_HOSTS.includes(officialSourceHost(observation.sourceUrl))) return false;
  const { priceMin, priceMax } = observation;
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax) || priceMin <= 0 || priceMax < priceMin) return false;
  const day = observationDateKey(observation.observedOn);
  return Boolean(day);
}

export function observationDateKey(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const key = date.toISOString().slice(0, 10);
  return key === String(value).slice(0, 10) || value instanceof Date ? key : null;
}

export function representativePrice(observation) {
  return (observation.priceMin + observation.priceMax) / 2;
}

/** Identity of one comparable series. Grade mismatch produces a separate group. */
function seriesIdentity(observation) {
  return JSON.stringify([
    normalise(observation.commodityKey || observation.commodity),
    normalise(observation.division),
    normalise(observation.district),
    normalise(observation.upazila),
    normalise(observation.market),
    normalise(observation.priceType),
    normalise(observation.unit),
    normalise(observation.frequency),
    normalise(observation.source),
    normalise(observation.grade),
  ]);
}

function selectionMatches(observation, selection) {
  const fields = ["commodity", "market", "division", "district", "upazila", "priceType", "unit", "frequency", "source", "grade"];
  for (const field of fields) {
    const expected = selection[field];
    if (expected === undefined || expected === null || expected === "") continue;
    const actual = field === "commodity"
      ? observation.commodityKey || observation.commodity
      : observation[field];
    if (normalise(expected) !== normalise(actual)) return false;
  }
  return true;
}

function unitLabelEnToBn(unit) {
  const normalised = String(unit || "").trim().toLowerCase();
  if (normalised === "bdt/kg" || normalised === "kg") return "কেজি";
  if (normalised === "bdt/maund" || normalised === "maund") return "মণ";
  return String(unit || "একক");
}

export function buildBengaliMarketMessage(alert) {
  const direction = alert.direction === "UP" ? "বেড়েছে" : "কমেছে";
  const unit = unitLabelEnToBn(alert.unit);
  const change = toBengaliDigits(Math.round(alert.absoluteChange * 100) / 100);
  const percent = toBengaliDigits(Math.round(alert.changePercent * 10) / 10);
  const previous = toBengaliDigits(Math.round(alert.previousPrice * 100) / 100);
  const latest = toBengaliDigits(Math.round(alert.latestPrice * 100) / 100);
  return `${alert.market || "বাজার"}: ${alert.commodity} দাম ${direction} ${change} টাকা/${unit} (${percent}%)। ${previous} → ${latest} টাকা/${unit}, ${alert.observedOn}। উৎস: ${alert.source}। কৃষিবন্ধু।`;
}

/**
 * Compare a farmer's verified price series.
 * @returns {{shouldAlert:boolean, reason:string, alert:object|null}}
 */
export function evaluateMarketPriceSeries({
  observations = [],
  selection = {},
  now = new Date(),
  thresholds = {},
} = {}) {
  const result = { shouldAlert: false, reason: null, alert: null };
  const policy = resolveMarketAlertThresholds(thresholds);

  if (!selection.commodityKey && !selection.commodity) return { ...result, reason: "NO_CROP_SELECTED" };
  if (!selection.market) return { ...result, reason: "NO_MARKET_SELECTED" };
  if (!selection.unit || !selection.priceType || !selection.frequency) return { ...result, reason: "NO_MEASUREMENT_SELECTED" };

  const valid = (Array.isArray(observations) ? observations : []).filter(isOfficialVerifiedObservation);
  if (valid.length < policy.minObservations) return { ...result, reason: "INSUFFICIENT_HISTORY" };

  const identities = new Set(valid.map(seriesIdentity));
  if (identities.size > 1) return { ...result, reason: "AMBIGUOUS_SERIES" };
  if (!valid.every((item) => selectionMatches(item, selection))) return { ...result, reason: "SELECTION_MISMATCH" };

  // One price per date; conflicting quotes on the same date are not usable.
  const byDate = new Map();
  for (const item of valid) {
    const day = observationDateKey(item.observedOn);
    const price = representativePrice(item);
    if (byDate.has(day) && Math.abs(byDate.get(day) - price) > 0.0001) {
      return { ...result, reason: "AMBIGUOUS_PRICE" };
    }
    byDate.set(day, price);
  }
  const ordered = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (ordered.length < policy.minObservations) return { ...result, reason: "INSUFFICIENT_HISTORY" };

  const [previousDate, previousPrice] = ordered[ordered.length - 2];
  const [observedOn, latestPrice] = ordered[ordered.length - 1];
  const maxAgeDays = policy.maxObservationAgeDays[selection.frequency];
  if (!Number.isFinite(maxAgeDays)) return { ...result, reason: "UNSUPPORTED_FREQUENCY" };
  const ageDays = (now.getTime() - new Date(`${observedOn}T00:00:00.000Z`).getTime()) / 86_400_000;
  if (ageDays < -1 || ageDays > maxAgeDays) return { ...result, reason: "STALE_DATA" };

  const absoluteChange = latestPrice - previousPrice;
  const changePercent = (absoluteChange / previousPrice) * 100;
  const meaningful =
    Math.abs(changePercent) >= policy.minChangePercent &&
    Math.abs(absoluteChange) >= policy.minAbsoluteChange;
  if (!meaningful) return { ...result, reason: "NO_MEANINGFUL_CHANGE" };

  const sample = valid[valid.length - 1];
  const alert = {
    type: absoluteChange > 0 ? "PRICE_INCREASE" : "PRICE_DECREASE",
    direction: absoluteChange > 0 ? "UP" : "DOWN",
    commodity: sample.commodity,
    commodityKey: sample.commodityKey || normalise(sample.commodity),
    market: sample.market,
    division: sample.division,
    district: sample.district || "",
    unit: sample.unit,
    priceType: sample.priceType,
    frequency: sample.frequency,
    grade: sample.grade || null,
    previousDate,
    previousPrice,
    observedOn,
    latestPrice,
    absoluteChange,
    changePercent,
    source: sample.source,
    sourceUrl: sample.sourceUrl,
    thresholds: {
      minChangePercent: policy.minChangePercent,
      minAbsoluteChange: policy.minAbsoluteChange,
    },
  };
  alert.messageBn = buildBengaliMarketMessage(alert);
  return { shouldAlert: true, reason: alert.type, alert };
}

/** Per-farmer, per-series dedupe key (never shared between farmers). */
export function buildMarketDedupeKey({ userId, alert }) {
  if (!userId || !alert?.commodityKey) return null;
  return [
    "market",
    String(userId),
    normalise(alert.commodityKey),
    normalise(alert.market),
    normalise(alert.unit),
    normalise(alert.priceType),
    normalise(alert.frequency),
    alert.grade ? normalise(alert.grade) : "none",
    normalise(alert.source),
    alert.observedOn || "unknown",
  ].join(":");
}
