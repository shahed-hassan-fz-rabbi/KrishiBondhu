import {
  SmsOutbox,
  DEFAULT_MAX_OUTBOX_ATTEMPTS,
} from "../../models/smsOutbox.model.js";
import { transitionOutboxStatus } from "./smsOutbox.service.js";

/**
 * Safe retry scheduling for the DRY-RUN outbox worker (Part 3D.4C).
 * No scheduler, timers or delivery are started here — only a future
 * nextAttemptAt timestamp is written atomically on the job document.
 */

export const DEFAULT_RETRY_BASE_MS = 60 * 1000;
export const DEFAULT_RETRY_MAX_MS = 15 * 60 * 1000;

export function computeBackoffMs({
  attempts = 1,
  baseDelayMs = DEFAULT_RETRY_BASE_MS,
  maxDelayMs = DEFAULT_RETRY_MAX_MS,
} = {}) {
  const attempt = Math.max(1, Number(attempts) || 1);
  const base = Math.max(1, Number(baseDelayMs) || DEFAULT_RETRY_BASE_MS);
  const cap = Math.max(base, Number(maxDelayMs) || DEFAULT_RETRY_MAX_MS);
  return Math.min(cap, base * 2 ** (attempt - 1));
}

/**
 * Atomically schedule a temporary failure for a later attempt, or mark it as
 * terminally failed once the attempt budget is exhausted.
 */
export async function scheduleOutboxRetry({
  id,
  leaseOwner,
  attempts = 1,
  maxAttempts = DEFAULT_MAX_OUTBOX_ATTEMPTS,
  now = new Date(),
  lastError = "TEMPORARY_FAILURE",
  baseDelayMs = DEFAULT_RETRY_BASE_MS,
  maxDelayMs = DEFAULT_RETRY_MAX_MS,
  model = SmsOutbox,
} = {}) {
  if (Number(attempts) >= Number(maxAttempts)) {
    const result = await transitionOutboxStatus({
      id, from: "processing", to: "failed", leaseOwner, now,
      extra: {
        lastError: "RETRY_EXHAUSTED",
        failureCategory: "temporary",
        nextAttemptAt: null,
      },
      model,
    });
    return {
      scheduled: false,
      exhausted: true,
      reason: result.ok ? "RETRY_EXHAUSTED" : (result.reason || "TRANSITION_CONFLICT"),
    };
  }

  const delayMs = computeBackoffMs({ attempts, baseDelayMs, maxDelayMs });
  const nextAttemptAt = new Date(now.getTime() + delayMs);
  const result = await transitionOutboxStatus({
    id, from: "processing", to: "pending", leaseOwner, now,
    extra: {
      nextAttemptAt,
      failureCategory: "temporary",
      lastError: lastError || "TEMPORARY_FAILURE",
    },
    model,
  });
  return result.ok
    ? { scheduled: true, exhausted: false, delayMs, nextAttemptAt }
    : { scheduled: false, exhausted: false, reason: result.reason || "TRANSITION_CONFLICT" };
}
