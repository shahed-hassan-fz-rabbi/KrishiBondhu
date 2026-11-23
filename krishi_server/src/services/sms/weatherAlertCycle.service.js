import { User } from "../../models/user.model.js";
import { SmsPreferences } from "../../models/smsPreferences.model.js";
import {
  WeatherAlertCycleLock,
  WEATHER_CYCLE_LOCK_ID,
} from "../../models/weatherAlertCycleLock.model.js";
import { getLiveForecast } from "../weather/forecast.service.js";
import { hasSmsConsent } from "./smsPreferences.js";
import { evaluateWeatherForecast, resolveWeatherDistrict } from "./weatherAlertEngine.js";
import { evaluateFarmerWeatherAlert } from "./weatherAlert.service.js";

/**
 * ONE-CYCLE weather alert runner (Part 3D.1).
 *
 * Not a scheduler: a caller invokes this once. No queues, no retries and no
 * real delivery — all alerts go through the dry-run `sendSms()` foundation.
 * A database-backed single-document lock prevents overlapping cycles.
 *
 * The returned summary contains counts and reasons only, never phone numbers
 * or other farmer identifiers.
 */

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_USERS = 500;
const DEFAULT_LOCK_TTL_MS = 10 * 60 * 1000;
const DEFAULT_WINDOW_MS = 12 * 60 * 60 * 1000;

function createDbCycleLock(model = WeatherAlertCycleLock) {
  return {
    async acquire({ runId, now, ttlMs }) {
      await model.updateOne(
        { _id: WEATHER_CYCLE_LOCK_ID },
        { $setOnInsert: { status: "idle", expiresAt: new Date(0) } },
        { upsert: true }
      );
      const result = await model.updateOne(
        {
          _id: WEATHER_CYCLE_LOCK_ID,
          $or: [{ status: "idle" }, { expiresAt: { $lte: now } }],
        },
        {
          $set: {
            status: "running",
            runId,
            startedAt: now,
            expiresAt: new Date(now.getTime() + ttlMs),
            finishedAt: null,
          },
        }
      );
      return result.modifiedCount === 1;
    },
    async release({ runId, now }) {
      await model.updateOne(
        { _id: WEATHER_CYCLE_LOCK_ID, runId },
        { $set: { status: "idle", finishedAt: now, expiresAt: new Date(0) } }
      );
    },
  };
}

function emptySummary(runId, now) {
  return {
    runId,
    startedAt: now.toISOString(),
    finishedAt: now.toISOString(),
    locked: false,
    evaluated: 0,
    eligible: 0,
    dryRunAlerts: 0,
    skipped: 0,
    errors: 0,
    skipReasons: {},
    districtsProcessed: [],
    stoppedEarly: null,
  };
}

function bump(summary, reason) {
  summary.skipped += 1;
  summary.skipReasons[reason] = (summary.skipReasons[reason] || 0) + 1;
}

async function loadCandidateBatch(preferencesModel, lastId, batchSize, now) {
  const query = {
    "categories.weather.enabled": true,
    "consent.givenAt": { $ne: null },
  };
  if (lastId) query._id = { $gt: lastId };
  return preferencesModel.find(query).sort({ _id: 1 }).limit(batchSize).lean();
}

async function loadUsers(userModel, ids) {
  if (!ids.length) return new Map();
  const users = await userModel.find({ _id: { $in: ids }, role: "farmer" }).lean();
  return new Map(users.map((user) => [String(user._id), user]));
}

function forecastIsUsable(forecast, districtCode, now) {
  if (!forecast) return false;
  const check = evaluateWeatherForecast({ forecast, districtCode, now });
  return !["SOURCE_UNAVAILABLE", "STALE_DATA", "LOCATION_MISMATCH", "NO_FORECAST_DATA", "UNKNOWN_LOCATION"].includes(check.reason);
}

/**
 * Run one bounded weather alert cycle.
 * All collaborators are injectable so the cycle is testable without MongoDB
 * or network access.
 */
export async function runWeatherAlertCycle({
  userModel = User,
  preferencesModel = SmsPreferences,
  lockModel = WeatherAlertCycleLock,
  lock = null,
  getForecast = getLiveForecast,
  evaluate = evaluateFarmerWeatherAlert,
  logger = null,
  now = new Date(),
  batchSize = DEFAULT_BATCH_SIZE,
  maxUsers = DEFAULT_MAX_USERS,
  windowMs = DEFAULT_WINDOW_MS,
  lockTtlMs = DEFAULT_LOCK_TTL_MS,
  runId = `weather-cycle-${now.getTime()}`,
} = {}) {
  const summary = emptySummary(runId, now);
  const cycleLock = lock || createDbCycleLock(lockModel);

  let acquired = false;
  try {
    acquired = await cycleLock.acquire({ runId, now, ttlMs: lockTtlMs });
  } catch (error) {
    summary.errors += 1;
    summary.skipReasons.LOCK_ERROR = 1;
    return summary;
  }
  if (!acquired) {
    return { ...summary, locked: true, skipReasons: { CYCLE_ALREADY_RUNNING: 1 }, skipped: 1 };
  }

  const size = Math.max(1, Math.min(500, Number(batchSize) || DEFAULT_BATCH_SIZE));
  const cap = Math.max(0, Math.min(5000, Number(maxUsers) || DEFAULT_MAX_USERS));
  const forecasts = new Map(); // district code -> { ok, forecast }
  let lastId = null;
  let processed = 0;

  try {
    while (processed < cap) {
      const batch = await loadCandidateBatch(preferencesModel, lastId, size, now);
      if (!batch.length) break;

      const users = await loadUsers(userModel, batch.map((prefs) => prefs.userId || prefs._id));
      let reachedCap = false;

      for (const preferences of batch) {
        if (processed >= cap) { reachedCap = true; break; }
        const user = users.get(String(preferences.userId || preferences._id));
        if (!user || user.role !== "farmer") { bump(summary, "NO_FARMER"); continue; }
        if (!user.phone || !user.phoneVerifiedAt || new Date(user.phoneVerifiedAt) > now) {
          bump(summary, "PHONE_NOT_VERIFIED");
          continue;
        }
        if (!hasSmsConsent({ user, preferences, category: "weather", now })) {
          bump(summary, "NO_CONSENT");
          continue;
        }
        const districtCode = user.preferredDistrict;
        if (!districtCode || !resolveWeatherDistrict(districtCode)) {
          bump(summary, "MISSING_DISTRICT");
          continue;
        }

        summary.eligible += 1;
        processed += 1;

        if (!forecasts.has(districtCode)) {
          try {
            const forecast = await getForecast({ locationIdentifier: districtCode });
            forecasts.set(districtCode, {
              ok: forecastIsUsable(forecast, districtCode, now),
              forecast,
            });
          } catch (error) {
            summary.errors += 1;
            forecasts.set(districtCode, { ok: false, forecast: null });
          }
        }

        const entry = forecasts.get(districtCode);
        if (!entry.ok) { bump(summary, "FORECAST_UNAVAILABLE"); continue; }

        summary.evaluated += 1;
        try {
          const result = await evaluate({
            user,
            preferences,
            forecast: entry.forecast,
            districtCode,
            now,
            windowMs,
            logger,
          });
          if (result.created) summary.dryRunAlerts += 1;
          else bump(summary, result.reason || "NOT_CREATED");
        } catch (error) {
          summary.errors += 1;
          bump(summary, "EVALUATION_ERROR");
        }
      }

      lastId = batch[batch.length - 1]._id;
      if (reachedCap) { summary.stoppedEarly = "MAX_USERS"; break; }
      if (batch.length < size) break;
    }
  } catch (error) {
    summary.errors += 1;
    summary.stoppedEarly = "CYCLE_ERROR";
  }

  summary.districtsProcessed = [...forecasts.keys()].sort();
  summary.finishedAt = new Date().toISOString();

  try {
    await cycleLock.release({ runId, now: new Date() });
  } catch (error) {
    summary.errors += 1;
  }

  return summary;
}
