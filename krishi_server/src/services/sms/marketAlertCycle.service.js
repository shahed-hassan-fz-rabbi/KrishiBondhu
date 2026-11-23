import { User } from "../../models/user.model.js";
import { SmsPreferences } from "../../models/smsPreferences.model.js";
import { MarketPriceAlert } from "../../models/marketpricealert.model.js";
import { MarketPriceObservation } from "../../models/marketpriceobservation.model.js";
import {
  MarketAlertCycleLock,
  MARKET_CYCLE_LOCK_ID,
} from "../../models/marketAlertCycleLock.model.js";
import { resolveWarningDivision } from "../../config/weather.config.js";
import { OFFICIAL_MARKET_SOURCE_HOSTS } from "../../config/marketAlert.config.js";
import { hasSmsConsent } from "./smsPreferences.js";
import { evaluateFarmerMarketPriceAlertForOutbox } from "./marketPriceAlertOutbox.service.js";

/**
 * Market price alert cycle (dry-run only). Reads real market subscriptions and
 * saved crop/market preferences, uses only recent administrator-verified
 * official observations, and enqueues alerts through the SMS outbox.
 * No scheduler, price fetching, retries or delivery are implemented here.
 */

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_USERS = 500;
const DEFAULT_MAX_ALERTS_PER_FARMER = 5;
const DEFAULT_OBSERVATIONS_PER_SERIES = 500;
const DEFAULT_LOCK_TTL_MS = 10 * 60 * 1000;
const MAX_FRESHNESS_DAYS = 100;

function observationUnit(unit) {
  const value = String(unit || "").trim().toLowerCase();
  if (value === "kg") return "BDT/kg";
  if (value === "maund") return "BDT/maund";
  return String(unit || "").trim();
}

function createMarketCycleLock(model = MarketAlertCycleLock) {
  return {
    async acquire({ runId, now, ttlMs }) {
      await model.updateOne(
        { _id: MARKET_CYCLE_LOCK_ID },
        { $setOnInsert: { status: "idle", expiresAt: new Date(0) } },
        { upsert: true }
      );
      const result = await model.updateOne(
        { _id: MARKET_CYCLE_LOCK_ID, $or: [{ status: "idle" }, { expiresAt: { $lte: now } }] },
        { $set: { status: "running", runId, startedAt: now, expiresAt: new Date(now.getTime() + ttlMs), finishedAt: null } }
      );
      return result.modifiedCount === 1;
    },
    async release({ runId, now }) {
      await model.updateOne(
        { _id: MARKET_CYCLE_LOCK_ID, runId },
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
    eligible: 0,
    evaluated: 0,
    queued: 0,
    duplicate: 0,
    skipped: 0,
    failed: 0,
    errors: 0,
    skipReasons: {},
    stoppedEarly: null,
  };
}

function bump(summary, reason) {
  summary.skipped += 1;
  summary.skipReasons[reason] = (summary.skipReasons[reason] || 0) + 1;
}

async function loadCandidates(preferencesModel, lastId, size, now) {
  const query = { "categories.market.enabled": true, "consent.givenAt": { $ne: null } };
  if (lastId) query._id = { $gt: lastId };
  return preferencesModel.find(query).sort({ _id: 1 }).limit(size).lean();
}

export async function runMarketAlertCycle({
  userModel = User,
  preferencesModel = SmsPreferences,
  savedAlertModel = MarketPriceAlert,
  observationModel = MarketPriceObservation,
  lockModel = MarketAlertCycleLock,
  lock = null,
  evaluate = evaluateFarmerMarketPriceAlertForOutbox,
  outboxModel,
  now = new Date(),
  batchSize = DEFAULT_BATCH_SIZE,
  maxUsers = DEFAULT_MAX_USERS,
  maxAlertsPerFarmer = DEFAULT_MAX_ALERTS_PER_FARMER,
  observationsPerSeries = DEFAULT_OBSERVATIONS_PER_SERIES,
  lockTtlMs = DEFAULT_LOCK_TTL_MS,
  runId = `market-cycle-${now.getTime()}`,
} = {}) {
  const summary = emptySummary(runId, now);
  const cycleLock = lock || createMarketCycleLock(lockModel);

  try {
    if (!(await cycleLock.acquire({ runId, now, ttlMs: lockTtlMs }))) {
      return { ...summary, locked: true, skipReasons: { CYCLE_ALREADY_RUNNING: 1 }, skipped: 1 };
    }
  } catch {
    summary.errors += 1;
    summary.skipReasons.LOCK_ERROR = 1;
    return summary;
  }

  const size = Math.max(1, Math.min(500, Number(batchSize) || DEFAULT_BATCH_SIZE));
  const cap = Math.max(0, Math.min(5000, Number(maxUsers) || DEFAULT_MAX_USERS));
  const alertCap = Math.max(1, Math.min(50, Number(maxAlertsPerFarmer) || DEFAULT_MAX_ALERTS_PER_FARMER));
  const observationCap = Math.max(2, Math.min(5000, Number(observationsPerSeries) || DEFAULT_OBSERVATIONS_PER_SERIES));
  const cutoff = new Date(now.getTime() - MAX_FRESHNESS_DAYS * 86_400_000);
  let lastId = null;
  let processed = 0;

  try {
    while (processed < cap) {
      const prefs = await loadCandidates(preferencesModel, lastId, size, now);
      if (!prefs.length) break;
      const users = await userModel.find({ _id: { $in: prefs.map((p) => p.userId || p._id) }, role: "farmer" }).lean();
      const byId = new Map(users.map((user) => [String(user._id), user]));

      for (const preferences of prefs) {
        if (processed >= cap) { summary.stoppedEarly = "MAX_USERS"; break; }
        const user = byId.get(String(preferences.userId || preferences._id));
        if (!user) { bump(summary, "NO_FARMER"); continue; }
        if (!user.phone || !user.phoneVerifiedAt || new Date(user.phoneVerifiedAt) > now) {
          bump(summary, "PHONE_NOT_VERIFIED"); continue;
        }
        if (!hasSmsConsent({ user, preferences, category: "market", now })) {
          bump(summary, "NO_CONSENT"); continue;
        }
        const division = resolveWarningDivision(user.preferredDistrict);
        if (!user.preferredDistrict || !division) { bump(summary, "MISSING_DISTRICT"); continue; }

        let saved;
        try {
          saved = await savedAlertModel.find({ userId: user._id }).limit(alertCap).lean();
        } catch {
          summary.errors += 1; bump(summary, "PREFERENCES_ERROR"); continue;
        }
        if (!saved.length) { bump(summary, "NO_MARKET_SELECTION"); continue; }
        summary.eligible += 1;
        processed += 1;

        for (const preference of saved) {
          if (!preference.commodity || !preference.market || !preference.priceType || !preference.unit) {
            bump(summary, "INCOMPLETE_SELECTION"); continue;
          }
          const unit = observationUnit(preference.unit);
          const selection = {
            commodityKey: String(preference.commodity).trim().toLowerCase(),
            market: preference.market,
            priceType: preference.priceType,
            unit,
            frequency: "daily",
            district: user.preferredDistrict,
            division,
          };
          let observations;
          try {
            observations = await observationModel
              .find({
                commodityKey: selection.commodityKey,
                market: selection.market,
                priceType: selection.priceType,
                unit: selection.unit,
                qualityStatus: "verified",
                observedOn: { $gte: cutoff, $lte: now },
              })
              .sort({ observedOn: -1 })
              .limit(observationCap)
              .lean();
          } catch {
            summary.errors += 1; bump(summary, "OBSERVATION_ERROR"); continue;
          }
          const official = observations.filter((row) => {
            try {
              return OFFICIAL_MARKET_SOURCE_HOSTS.includes(new URL(row.sourceUrl).hostname.toLowerCase());
            } catch { return false; }
          });
          if (official.length < 2) { bump(summary, "INSUFFICIENT_HISTORY"); continue; }

          summary.evaluated += 1;
          try {
            const result = await evaluate({
              user, preferences, observations: official, selection, now,
              ...(outboxModel ? { outboxModel } : {}),
            });
            if (result.queued) summary.queued += 1;
            else if (result.reason === "DUPLICATE") summary.duplicate += 1;
            else if (["ENQUEUE_ERROR", "INVALID_DEDUPE_KEY", "EMPTY_MESSAGE"].includes(result.reason)) summary.failed += 1;
            else bump(summary, result.reason || "NOT_CREATED");
          } catch {
            summary.errors += 1; bump(summary, "EVALUATION_ERROR");
          }
        }
      }
      lastId = prefs[prefs.length - 1]._id;
      if (summary.stoppedEarly) break;
      if (prefs.length < size) break;
    }
  } catch {
    summary.errors += 1;
    summary.stoppedEarly = "CYCLE_ERROR";
  }

  summary.finishedAt = new Date().toISOString();
  try { await cycleLock.release({ runId, now: new Date() }); }
  catch { summary.errors += 1; }
  return summary;
}
