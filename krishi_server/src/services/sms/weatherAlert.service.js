import { SmsNotificationLog } from "../../models/smsNotificationLog.model.js";
import { hasSmsConsent } from "./smsPreferences.js";
import { assertPhoneVerified } from "./smsSubscription.service.js";
import { sendSms } from "./smsSender.service.js";
import {
  buildWeatherDedupeKey,
  evaluateWeatherForecast,
} from "./weatherAlertEngine.js";

/**
 * Weather SMS orchestration (Part 3C.1).
 *
 * No scheduler, no real delivery, no retries. The only send path is the
 * existing dry-run `sendSms()` foundation; live mode stays disabled.
 * Every decision is recorded through the notification log.
 */

async function findRecentAlert({ dedupeKey, userId, windowMs, logger }) {
  if (!dedupeKey) return null;
  if (logger?.findRecent) return logger.findRecent({ dedupeKey, userId, windowMs });
  try {
    return await SmsNotificationLog.findOne({
      dedupeKey,
      userId,
      category: "weather",
      status: { $ne: "skipped" },
      occurredAt: { $gte: new Date(Date.now() - windowMs) },
    }).lean();
  } catch {
    return null;
  }
}

/**
 * Evaluate one farmer + one forecast and create at most one DRY-RUN alert.
 * @returns {Promise<{created:boolean, reason:string, evaluation:object, delivery:object|null}>}
 */
export async function evaluateFarmerWeatherAlert({
  user = {},
  preferences = {},
  forecast = null,
  districtCode = null,
  now = new Date(),
  windowMs = 12 * 60 * 60 * 1000,
  logger = null,
  maxAgeMs,
} = {}) {
  const userId = user._id || user.id || null;

  // 1. A complete, verified phone must be available server-side.
  const verified = assertPhoneVerified(user, { now });
  if (!verified.ok) {
    return { created: false, reason: verified.code, evaluation: { shouldAlert: false, reason: verified.code, alert: null }, delivery: null };
  }

  // 2. Explicit per-category weather consent (revocation also fails here).
  if (!hasSmsConsent({ user, preferences, category: "weather", now })) {
    return { created: false, reason: "NO_CONSENT", evaluation: { shouldAlert: false, reason: "NO_CONSENT", alert: null }, delivery: null };
  }

  // 3. Weather decision using documented thresholds + freshness + location gates.
  const evaluation = evaluateWeatherForecast({ forecast, districtCode, now, ...(maxAgeMs ? { maxAgeMs } : {}) });
  if (!evaluation.shouldAlert || !evaluation.alert) {
    return { created: false, reason: evaluation.reason, evaluation, delivery: null };
  }

  // 4. Duplicate suppression for an equivalent alert.
  const dedupeKey = buildWeatherDedupeKey({ districtCode, alert: evaluation.alert, userId });
  const duplicate = await findRecentAlert({ dedupeKey, userId, windowMs, logger });
  if (duplicate) {
    return { created: false, reason: "DUPLICATE", evaluation, delivery: null };
  }

  // 5. The dry-run sender re-checks consent/dedupe and records the notification
  //    log itself. No pre-write with the same dedupe key (that would self-suppress).

  // 6. Existing dry-run sender performs consent/dedupe checks again and logs.
  const delivery = await sendSms({
    user,
    preferences,
    text: evaluation.alert.messageBn,
    category: "weather",
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
