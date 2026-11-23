import { hasSmsConsent } from "./smsPreferences.js";
import { assertPhoneVerified } from "./smsSubscription.service.js";
import {
  evaluateMarketPriceSeries,
  buildMarketDedupeKey,
} from "./marketPriceAlertEngine.js";
import { farmerLocationMatches } from "./marketPriceAlert.service.js";
import { enqueueSmsAlert } from "./smsOutbox.service.js";

/**
 * Market price alert -> SMS outbox adapter (Part 3D.4G).
 *
 * Uses the existing market evaluator and enqueue service only. It never calls
 * sendSms(), writes a notification log, imports prices or schedules anything.
 * All source/freshness/comparability rules live in the market engine.
 */

export async function evaluateFarmerMarketPriceAlertForOutbox({
  user = {},
  preferences = {},
  observations = [],
  selection = {},
  now = new Date(),
  thresholds,
  outboxModel,
} = {}) {
  const userId = user._id || user.id || null;
  const denied = (reason) => ({
    queued: false,
    reason,
    evaluation: { shouldAlert: false, reason, alert: null },
    dedupeKey: null,
    outbox: null,
  });

  // 1. Verified phone and explicit market consent.
  const verified = assertPhoneVerified(user, { now });
  if (!verified.ok) return denied(verified.code);
  if (!hasSmsConsent({ user, preferences, category: "market", now })) return denied("NO_CONSENT");

  // 2. Farmer's selected crop/market and matching district/division.
  if (!selection.commodityKey && !selection.commodity) return denied("NO_CROP_SELECTED");
  if (!selection.market) return denied("NO_MARKET_SELECTED");
  if (!farmerLocationMatches({ user, selection })) return denied("LOCATION_MISMATCH");

  // 3. Existing engine: verified official observations, freshness, comparable
  //    unit/grade/source series and documented change thresholds.
  const evaluation = evaluateMarketPriceSeries({
    observations,
    selection,
    now,
    ...(thresholds ? { thresholds } : {}),
  });
  if (!evaluation.shouldAlert || !evaluation.alert) {
    return { queued: false, reason: evaluation.reason, evaluation, dedupeKey: null, outbox: null };
  }

  // 4. Per-farmer key, now also scoped by grade/frequency/source/date.
  const dedupeKey = buildMarketDedupeKey({ userId, alert: evaluation.alert });
  const enqueued = await enqueueSmsAlert({
    user,
    preferences,
    category: "market",
    text: evaluation.alert.messageBn,
    dedupeKey,
    now,
    ...(outboxModel ? { model: outboxModel } : {}),
  });

  return {
    queued: enqueued.enqueued,
    reason: enqueued.enqueued ? "QUEUED" : enqueued.reason,
    evaluation,
    dedupeKey,
    outbox: enqueued.outbox,
  };
}
