import { SmsNotificationLog } from "../../models/smsNotificationLog.model.js";
import { resolveWarningDivision } from "../../config/weather.config.js";
import { hasSmsConsent } from "./smsPreferences.js";
import { assertPhoneVerified } from "./smsSubscription.service.js";
import { sendSms } from "./smsSender.service.js";
import {
  buildMarketDedupeKey,
  evaluateMarketPriceSeries,
} from "./marketPriceAlertEngine.js";

/**
 * Market price SMS orchestration (Part 3C.2).
 *
 * No scheduler, no real delivery, no retries, no database reads here: the
 * caller supplies verified observations and the farmer's own market selection.
 * The only send path is the existing dry-run `sendSms()` foundation.
 */

async function findRecentAlert({ dedupeKey, userId, windowMs, logger }) {
  if (!dedupeKey) return null;
  if (logger?.findRecent) return logger.findRecent({ dedupeKey, userId, windowMs });
  try {
    return await SmsNotificationLog.findOne({
      dedupeKey,
      userId,
      category: "market",
      status: { $ne: "skipped" },
      occurredAt: { $gte: new Date(Date.now() - windowMs) },
    }).lean();
  } catch {
    return null;
  }
}

export function farmerLocationMatches({ user = {}, selection = {} }) {
  const district = selection.district || user.preferredDistrict || null;
  if (!district) return false;
  const farmerDistrict = user.preferredDistrict;
  if (farmerDistrict && String(district).trim().toLowerCase() !== String(farmerDistrict).trim().toLowerCase()) {
    return false;
  }
  if (selection.division) {
    const expected = resolveWarningDivision(farmerDistrict || district);
    if (!expected || String(selection.division).trim().toLowerCase() !== expected.toLowerCase()) return false;
  }
  return true;
}

/**
 * Evaluate one farmer + one verified price series and create at most one
 * DRY-RUN alert.
 * @returns {Promise<{created:boolean, reason:string, evaluation:object, delivery:object|null}>}
 */
export async function evaluateFarmerMarketPriceAlert({
  user = {},
  preferences = {},
  observations = [],
  selection = {},
  now = new Date(),
  windowMs = 12 * 60 * 60 * 1000,
  logger = null,
  thresholds,
} = {}) {
  const userId = user._id || user.id || null;

  // 1. Verified phone, then explicit per-category market consent.
  const verified = assertPhoneVerified(user, { now });
  if (!verified.ok) {
    return { created: false, reason: verified.code, evaluation: { shouldAlert: false, reason: verified.code, alert: null }, delivery: null };
  }
  if (!hasSmsConsent({ user, preferences, category: "market", now })) {
    return { created: false, reason: "NO_CONSENT", evaluation: { shouldAlert: false, reason: "NO_CONSENT", alert: null }, delivery: null };
  }

  // 2. The market/crop must be the farmer's own selection and location.
  if (!farmerLocationMatches({ user, selection })) {
    return { created: false, reason: "LOCATION_MISMATCH", evaluation: { shouldAlert: false, reason: "LOCATION_MISMATCH", alert: null }, delivery: null };
  }

  // 3. Source, history, unit/grade and threshold evaluation.
  const evaluation = evaluateMarketPriceSeries({
    observations,
    selection,
    now,
    ...(thresholds ? { thresholds } : {}),
  });
  if (!evaluation.shouldAlert || !evaluation.alert) {
    return { created: false, reason: evaluation.reason, evaluation, delivery: null };
  }

  // 4. Per-farmer duplicate suppression for this exact price observation.
  const dedupeKey = buildMarketDedupeKey({ userId, alert: evaluation.alert });
  const duplicate = await findRecentAlert({ dedupeKey, userId, windowMs, logger });
  if (duplicate) {
    return { created: false, reason: "DUPLICATE", evaluation, delivery: null };
  }

  // 5. The dry-run sender re-checks consent/dedupe and writes the log itself.
  const delivery = await sendSms({
    user,
    preferences,
    text: evaluation.alert.messageBn,
    category: "market",
    dedupeKey,
    now,
    windowMs,
    logger,
  });

  return {
    created: delivery.status === "dry_run",
    reason: delivery.status === "dry_run" ? "DRY_RUN_CREATED" : delivery.reason || delivery.status,
    evaluation,
    delivery,
  };
}
