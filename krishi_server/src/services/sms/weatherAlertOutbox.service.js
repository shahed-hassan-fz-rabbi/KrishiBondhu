import { hasSmsConsent } from "./smsPreferences.js";
import { assertPhoneVerified } from "./smsSubscription.service.js";
import {
  evaluateWeatherForecast,
  buildWeatherDedupeKey,
  WEATHER_ALERT_MAX_AGE_MS,
} from "./weatherAlertEngine.js";
import { enqueueSmsAlert } from "./smsOutbox.service.js";

/**
 * Weather alert -> SMS outbox adapter (Part 3D.4D).
 *
 * This is the ONLY weather alert path used by the cycle now. It never calls
 * sendSms() or writes a delivery log: a qualified farmer gets a pending
 * outbox job that a future dry-run worker may process.
 */

export async function evaluateFarmerWeatherAlertForOutbox({
  user = {},
  preferences = {},
  forecast = null,
  districtCode = null,
  now = new Date(),
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

  // 1. Verified phone and explicit weather consent (rechecked by enqueue too).
  const verified = assertPhoneVerified(user, { now });
  if (!verified.ok) return denied(verified.code);
  if (!hasSmsConsent({ user, preferences, category: "weather", now })) return denied("NO_CONSENT");

  // 2. Existing weather rules: trusted source, freshness, location, thresholds.
  const evaluation = evaluateWeatherForecast({ forecast, districtCode, now });
  if (!evaluation.shouldAlert || !evaluation.alert) {
    return { queued: false, reason: evaluation.reason, evaluation, dedupeKey: null, outbox: null };
  }

  // 3. Per-farmer dedupe key: one farmer cannot suppress another's alert.
  const dedupeKey = buildWeatherDedupeKey({ districtCode, alert: evaluation.alert, userId });
  const enqueued = await enqueueSmsAlert({
    user,
    preferences,
    category: "weather",
    text: evaluation.alert.messageBn,
    dedupeKey,
    now,
    // Revalidated at delivery time by the worker.
    sourceObservedAt: forecast?.meta?.fetchTimestamp || null,
    freshnessMaxAgeMs: WEATHER_ALERT_MAX_AGE_MS,
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
