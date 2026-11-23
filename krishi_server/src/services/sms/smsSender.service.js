import { SmsNotificationLog } from "../../models/smsNotificationLog.model.js";
import { hasSmsConsent, maskPhone, smsParts } from "./smsPreferences.js";

/**
 * Reusable, provider-agnostic SMS interface.
 *
 * PART 1 SAFETY RULES:
 *  - There is no live gateway adapter in this part. `sendSms` NEVER contacts a
 *    provider and NEVER sends to a real phone number.
 *  - Every call is recorded in the notification log with a status, timestamp,
 *    attempt count and retry information.
 *  - Phone numbers are masked in every log and result.
 *
 * A future part can register a live adapter via `registerSmsGateway` after
 * explicit configuration; until then `getSmsMode()` always returns "dry_run".
 */
let gatewayAdapter = null;

export function registerSmsGateway(adapter) {
  if (adapter && typeof adapter.send !== "function") throw new Error("SMS gateway adapter must expose send()");
  gatewayAdapter = adapter || null;
}

export function getSmsMode() {
  return gatewayAdapter ? "live" : "dry_run";
}

export function resetSmsGatewayForTests() {
  gatewayAdapter = null;
}

function createLogEntry({ userId, category, phone, dedupeKey, status, mode, parts, attempts, nextRetryAt, lastError, metadata }) {
  return {
    userId: userId || null,
    category,
    phoneLast4: maskPhone(phone),
    dedupeKey: dedupeKey || null,
    status,
    mode,
    provider: gatewayAdapter?.name || "dry-run",
    attempts,
    nextRetryAt: nextRetryAt || null,
    lastError: lastError || null,
    parts,
    metadata: metadata || {},
    occurredAt: new Date(),
  };
}

/**
 * Persist a log entry. Uses the injected logger when provided (tests / other
 * stores), otherwise the MongoDB model. Persistence failure never throws to
 * the caller of sendSms — the result still reports what happened.
 */
async function persistLog(entry, logger) {
  try {
    if (logger?.create) return await logger.create(entry);
    if (typeof SmsNotificationLog?.create === "function") return await SmsNotificationLog.create(entry);
    return entry;
  } catch (error) {
    console.warn("[sms] could not persist notification log:", error?.message || error);
    return entry;
  }
}

async function dedupeLookup({ dedupeKey, userId, category, windowMs, logger }) {
  if (!dedupeKey) return null;
  if (logger?.findRecent) return logger.findRecent({ dedupeKey, userId, category, windowMs });
  if (typeof SmsNotificationLog?.findOne === "function") {
    return SmsNotificationLog.findOne({
      dedupeKey,
      ...(userId ? { userId } : {}),
      category,
      occurredAt: { $gte: new Date(Date.now() - windowMs) },
    }).lean();
  }
  return null;
}

/**
 * Send a notification (dry run in Part 1).
 * @returns {Promise<{status:string, dryRun:boolean, provider:string, parts:number, log:object, reason?:string}>}
 */
export async function sendSms({
  user = {},
  preferences = {},
  text = "",
  category = "system",
  dedupeKey = null,
  now = new Date(),
  windowMs = 10 * 60 * 1000,
  logger = null,
  maxAttempts = 3,
} = {}) {
  const mode = getSmsMode();
  const parts = smsParts(text);
  const base = { userId: user?._id || user?.id || null, category, phone: user?.phone, dedupeKey, parts };

  // 1. Consent gate — before dedupe or any provider work.
  if (!hasSmsConsent({ user, preferences, category, now })) {
    const entry = createLogEntry({
      ...base,
      status: "skipped",
      mode,
      attempts: 0,
      nextRetryAt: null,
      lastError: "no_explicit_consent_or_phone_unverified",
      metadata: { reason: "consent" },
    });
    const log = await persistLog(entry, logger);
    return { status: "skipped", dryRun: true, provider: entry.provider, parts, log, reason: "no_consent" };
  }

  // 2. Duplicate suppression — one alert per dedupe key per window.
  const recent = await dedupeLookup({ dedupeKey, userId: base.userId, category, windowMs, logger });
  if (recent) {
    const entry = createLogEntry({
      ...base,
      status: "skipped",
      mode,
      attempts: 0,
      nextRetryAt: null,
      lastError: "duplicate_within_window",
      metadata: { duplicateOf: recent.dedupeKey || recent._id?.toString?.() || null },
    });
    const log = await persistLog(entry, logger);
    return { status: "skipped", dryRun: true, provider: entry.provider, parts, log, reason: "duplicate" };
  }

  // 3. Part 1: no live provider is registered -> dry run only.
  if (!gatewayAdapter) {
    const entry = createLogEntry({
      ...base,
      status: "dry_run",
      mode: "dry_run",
      attempts: 1,
      nextRetryAt: null,
      metadata: { note: "Part 1 foundation: no SMS is sent", to: maskPhone(user?.phone) },
    });
    const log = await persistLog(entry, logger);
    return { status: "dry_run", dryRun: true, provider: "dry-run", parts, log };
  }

  // 4. Registered adapter path (reserved for a future part; not used yet).
  try {
    const result = await gatewayAdapter.send({ to: user.phone, text, category, dedupeKey });
    const ok = result?.ok === true;
    const entry = createLogEntry({
      ...base,
      status: ok ? "sent" : "failed",
      mode: "live",
      attempts: 1,
      nextRetryAt: ok ? null : new Date(now.getTime() + 15 * 60 * 1000),
      lastError: ok ? null : (result?.error || "provider_error"),
      metadata: { providerMessageId: result?.messageId || null },
    });
    const log = await persistLog(entry, logger);
    return { status: ok ? "sent" : "failed", dryRun: false, provider: gatewayAdapter.name, parts, log };
  } catch (error) {
    const entry = createLogEntry({
      ...base,
      status: "failed",
      mode: "live",
      attempts: 1,
      nextRetryAt: new Date(now.getTime() + 15 * 60 * 1000),
      lastError: error?.message || "provider_exception",
      metadata: { maxAttempts },
    });
    const log = await persistLog(entry, logger);
    return { status: "failed", dryRun: false, provider: gatewayAdapter.name, parts, log, reason: "provider_error" };
  }
}
