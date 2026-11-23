import { BMD_THRESHOLDS, AGRONOMIC_THRESHOLDS } from "../../config/weather.config.js";
import { DISTRICTS } from "../../config/climate.config.js";

/**
 * Weather alert DECISION ENGINE (Part 3C.1).
 *
 * Pure functions only: no network, no timers, no database, no SMS delivery.
 * Alerts are produced only from a verified, recent Open-Meteo forecast that
 * matches the farmer's configured district. Uncertain, stale or mismatched
 * data fails closed (no alert).
 *
 * Documented thresholds are reused from the existing risk engine config:
 *  - BMD rainfall: heavy >= 44 mm / very heavy >= 89 mm (24h)
 *  - Squall/lodging danger gust >= 55 km/h
 *  - WMO thunderstorm codes 95/96/99 are flagged hazards
 */

export const WEATHER_SOURCE = "Open-Meteo Weather Forecast API";
export const WEATHER_ALERT_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
export const WEATHER_ALERT_HORIZON_DAYS = 3; // days 1-3 only (short-range reliable)
const THUNDERSTORM_CODES = new Set([95, 96, 99]);

const normalise = (value) => String(value || "").trim().toLowerCase();

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const toBengaliDigits = (value) => String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);

export function resolveWeatherDistrict(districtCode) {
  if (!districtCode) return null;
  const code = normalise(districtCode);
  return DISTRICTS.find((d) => d.code === code || normalise(d.nameEn) === code) || null;
}

/** Fail-closed location check: forecast must name the farmer's configured district. */
export function locationMatchesForecast(forecast, districtCode) {
  const district = resolveWeatherDistrict(districtCode);
  const name = forecast?.location?.nameEn;
  if (!district || !name) return false;
  const candidate = normalise(name);
  return candidate === normalise(district.nameEn) || candidate === district.code;
}

function sourceIsTrusted(forecast) {
  const meta = forecast?.meta;
  if (!meta || meta.provider !== WEATHER_SOURCE) return false;
  if (meta.dataStatus && meta.dataStatus !== "AVAILABLE") return false;
  // A cached copy is fine only when the service did not mark it stale.
  if (meta.isStale === true || (typeof meta.staleNotice === "string" && meta.staleNotice.length > 0)) return false;
  return true;
}

function dataIsRecent(forecast, now, maxAgeMs) {
  const timestamp = forecast?.meta?.fetchTimestamp;
  if (!timestamp) return false;
  const fetchedAt = new Date(timestamp).getTime();
  if (!Number.isFinite(fetchedAt)) return false;
  if (fetchedAt > now.getTime() + 60_000) return false; // future timestamp
  return now.getTime() - fetchedAt <= maxAgeMs;
}

/** Build a short Bengali SMS: location, warning, time, source. */
export function buildBengaliWeatherMessage({ alert, district, fetchedAt }) {
  const location = district.nameBn || district.nameEn;
  const when = alert.date || "-";
  const sourceTime = fetchedAt ? new Date(fetchedAt).toISOString().slice(0, 16).replace("T", " ") : "অজানা";
  if (alert.type === "HEAVY_RAINFALL") {
    const label = alert.severity === "VERY_HEAVY" ? "অতি ভারী বৃষ্টি" : "ভারী বৃষ্টি";
    return `${location}: ${when} ${label} ${toBengaliDigits(alert.metricMm)} মিমি হতে পারে। সতর্কতা: পানি জমা ও ফসল ক্ষতির সম্ভাবনা। উৎস: Open-Meteo পূর্বাভাস (${sourceTime} UTC)। কৃষিবন্ধু।`;
  }
  const gustPart = Number.isFinite(alert.gustKmH) ? ` ${toBengaliDigits(alert.gustKmH)} কিমি/ঘণ্টা` : "";
  return `${location}: ${when} ঝড়/ভারী বজ্রপাতের সতর্কতা${gustPart}। মাঠের কাজ এড়িয়ে নিরাপদ আশ্রয় নিন। উৎস: Open-Meteo পূর্বাভাস (${sourceTime} UTC)। কৃষিবন্ধু।`;
}

/**
 * Evaluate a forecast against documented warning thresholds.
 * @returns {{shouldAlert:boolean, reason:string, alert:object|null}}
 */
export function evaluateWeatherForecast({ forecast, districtCode, now = new Date(), maxAgeMs = WEATHER_ALERT_MAX_AGE_MS } = {}) {
  const result = { shouldAlert: false, reason: null, alert: null };
  const district = resolveWeatherDistrict(districtCode);
  if (!district) return { ...result, reason: "UNKNOWN_LOCATION" };
  if (!forecast || !Array.isArray(forecast.shortRangeForecast) || forecast.shortRangeForecast.length === 0) {
    return { ...result, reason: "NO_FORECAST_DATA" };
  }
  if (!sourceIsTrusted(forecast)) return { ...result, reason: "SOURCE_UNAVAILABLE" };
  if (!dataIsRecent(forecast, now, maxAgeMs)) return { ...result, reason: "STALE_DATA" };
  if (!locationMatchesForecast(forecast, districtCode)) return { ...result, reason: "LOCATION_MISMATCH" };

  const days = forecast.shortRangeForecast.filter(
    (d) => d && d.isExtended !== true && (!Number.isFinite(d.dayIndex) || d.dayIndex <= WEATHER_ALERT_HORIZON_DAYS)
  );

  for (const day of days) {
    const rain = day.precipitationSumMm;
    if (Number.isFinite(rain) && rain >= BMD_THRESHOLDS.rainfall.heavyMinMm) {
      const severity = rain >= BMD_THRESHOLDS.rainfall.veryHeavyMinMm ? "VERY_HEAVY" : "HEAVY";
      const alert = {
        type: "HEAVY_RAINFALL",
        severity,
        metricMm: rain,
        date: day.date || null,
        thresholdMm: BMD_THRESHOLDS.rainfall.heavyMinMm,
      };
      alert.messageBn = buildBengaliWeatherMessage({ alert, district, fetchedAt: forecast.meta.fetchTimestamp });
      return { shouldAlert: true, reason: "HEAVY_RAINFALL", alert };
    }

    const gust = day.windGustsMaxKmH;
    const thunderstorm = THUNDERSTORM_CODES.has(day.weatherCode);
    const severeGust = Number.isFinite(gust) && gust >= AGRONOMIC_THRESHOLDS.windLodging.squallLodgingDangerGustKmH;
    if (thunderstorm || severeGust) {
      const alert = {
        type: "SEVERE_WEATHER",
        severity: severeGust ? "SQUALL" : "THUNDERSTORM",
        gustKmH: Number.isFinite(gust) ? gust : null,
        weatherCode: day.weatherCode ?? null,
        date: day.date || null,
        thresholdKmH: AGRONOMIC_THRESHOLDS.windLodging.squallLodgingDangerGustKmH,
      };
      alert.messageBn = buildBengaliWeatherMessage({ alert, district, fetchedAt: forecast.meta.fetchTimestamp });
      return { shouldAlert: true, reason: "SEVERE_WEATHER", alert };
    }
  }

  return { ...result, reason: "NO_WARNING_CONDITION" };
}

/** Stable dedupe key so an equivalent alert is not created twice. */
export function buildWeatherDedupeKey({ districtCode, alert }) {
  if (!alert?.type) return null;
  return `weather:${normalise(districtCode)}:${alert.type}:${alert.date || "unknown"}`;
}
