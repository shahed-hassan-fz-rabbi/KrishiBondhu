import { env } from "../../config/env.config.js";
import { User } from "../../models/user.model.js";
import { SmsPreferences } from "../../models/smsPreferences.model.js";
import { SmsNotificationLog } from "../../models/smsNotificationLog.model.js";
import { SmsOutbox, outboxMessageRef } from "../../models/smsOutbox.model.js";
import {
  decryptOutboxMessage,
  encryptionRequirement,
  MESSAGE_ALGORITHM,
} from "./smsOutboxCrypto.service.js";
import {
  reserveSmsQuota as defaultReserveQuota,
  releaseSmsQuota,
} from "./smsOutboxQuota.service.js";
import { isSmsLiveEnabled, sendSms, getSmsMode } from "./smsSender.service.js";
import { configureSmsGatewayFromEnv } from "./configureSmsGateway.js";
import { readSmsOutboxLiveConfig } from "../../config/smsOutboxLive.config.js";
import {
  revalidateForDelivery,
  transitionOutboxStatus,
  toSafeOutboxView,
} from "./smsOutbox.service.js";
import {
  scheduleOutboxRetry,
  DEFAULT_RETRY_BASE_MS,
  DEFAULT_RETRY_MAX_MS,
} from "./smsOutboxRetry.service.js";

/**
 * Safe outbox worker. Default mode is DRY-RUN and never contacts a gateway.
 * Live delivery is possible only when BOTH SMS_LIVE=1 and
 * SMS_OUTBOX_LIVE_ENABLED=1 are set in the same process and no scheduler flag
 * is active. Even then, every safety gate still applies and an accepted
 * provider submission is recorded as `submitted`, never `delivered`.
 */

const DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 20;

/** Legacy guard retained: strictly refuses any live mode. */
export function assertDryRunOnly({
  envConfig = env,
  liveEnabled = null,
  rawEnv = process.env,
} = {}) {
  const rawLive = String(rawEnv.SMS_LIVE || "").trim() === "1";
  const live = liveEnabled === null ? isSmsLiveEnabled() : liveEnabled === true;
  if (rawLive || envConfig.smsLive === true || live) {
    return { ok: false, reason: "LIVE_SMS_ENABLED" };
  }
  return { ok: true };
}

/** New explicit gate: dry-run by default; live requires both flags + no schedulers. */
export function assertDeliveryMode({
  rawEnv = process.env,
  liveConfig = null,
  liveEnabled = null,
} = {}) {
  const config = liveConfig || readSmsOutboxLiveConfig(rawEnv);
  if (config.mode === "live") {
    if (liveEnabled === false) return { ok: false, mode: "live", reason: "LIVE_DISABLED_BY_CALLER" };
    return { ok: true, mode: "live" };
  }
  // Any live signal without the full explicit gate is an error, never a
  // silent fall back to dry-run.
  const rawLive = String(rawEnv.SMS_LIVE || "").trim() === "1" || isSmsLiveEnabled();
  if (rawLive || config.reasons.length) {
    return { ok: false, mode: "dry_run", reason: config.reasons[0] || "LIVE_SMS_ENABLED" };
  }
  return { ok: true, mode: "dry_run" };
}

/** Atomic claim: pending jobs, or processing jobs whose lease has expired. */
export async function claimNextOutboxJob({
  model = SmsOutbox,
  leaseOwner,
  now = new Date(),
  leaseTtlMs = DEFAULT_LEASE_TTL_MS,
} = {}) {
  const query = model.findOneAndUpdate(
    {
      $or: [
        {
          status: "pending",
          $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
        },
        { status: "processing", leaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: "processing",
        leaseOwner,
        leaseExpiresAt: new Date(now.getTime() + leaseTtlMs),
        lastAttemptAt: now,
        updatedAt: now,
        lastError: null,
        nextAttemptAt: null,
      },
      $inc: { attempts: 1 },
    },
    { new: true }
  );
  // Protected message content must be present for the integrity check.
  return typeof query?.select === "function" ? query.select("+message") : query;
}

function safeResult(job, outcome, reason) {
  return {
    id: job._id?.toString?.() || job._id || null,
    dedupeKey: job.dedupeKey || null,
    category: job.category || null,
    phoneLast4: job.phoneLast4 || null,
    outcome,
    reason,
  };
}

/** Simulated delivery result. No provider, no phone, no message text. */
function simulateDryRun({ job, now }) {
  return {
    mode: "dry_run",
    provider: null,
    providerMessageId: null,
    sent: false,
    parts: Number(job.parts) || 0,
    at: now.toISOString(),
  };
}

async function recordDryRunLog({ job, check, now, notificationLogModel }) {
  if (!notificationLogModel) return;
  try {
    await notificationLogModel.create({
      userId: job.userId,
      category: job.category,
      phoneLast4: job.phoneLast4 || check.phoneLast4 || null,
      dedupeKey: job.dedupeKey,
      status: "dry_run",
      mode: "dry_run",
      provider: "dry-run",
      providerMessageId: null,
      attempts: Number(job.attempts) || 1,
      parts: Number(job.parts) || 0,
      metadata: {
        source: "sms_outbox_dry_run",
        outboxId: job._id?.toString?.() || job._id || null,
        messageRef: job.messageRef || null,
        note: "No SMS was sent",
      },
      occurredAt: now,
    });
  } catch {
    // Audit persistence failure never converts a dry run into a real send.
  }
}

export async function processSmsOutboxBatch({
  limit = DEFAULT_LIMIT,
  leaseOwner = `dry-run-worker-${process.pid}`,
  leaseTtlMs = DEFAULT_LEASE_TTL_MS,
  now = new Date(),
  model = SmsOutbox,
  userModel = User,
  preferencesModel = SmsPreferences,
  notificationLogModel = SmsNotificationLog,
  envConfig = env,
  liveEnabled = null,
  dryRunGuard = null,
  revalidate = revalidateForDelivery,
  retryScheduler = scheduleOutboxRetry,
  retryBaseMs = DEFAULT_RETRY_BASE_MS,
  retryMaxMs = DEFAULT_RETRY_MAX_MS,
  maxPerFarmerPerDay = 5,
  globalDailyLimit = 200,
  encryptionKey,
  requireEncryption,
  quotaModel,
  reserveQuota = defaultReserveQuota,
  rawEnv = process.env,
  liveConfig,
  deliveryMode,
  configureGateway = configureSmsGatewayFromEnv,
  send = sendSms,
} = {}) {
  const summary = {
    claimed: 0,
    processed: 0,
    dryRuns: 0,
    liveSubmissions: 0,
    ambiguousSubmissions: 0,
    cancelled: 0,
    failed: 0,
    conflicts: 0,
    errors: 0,
    retryScheduled: 0,
    retriesExhausted: 0,
    limitSkipped: 0,
    refused: false,
    reason: null,
    stoppedEarly: null,
    results: [],
  };

  const guard = dryRunGuard || (deliveryMode
    ? { ok: true, mode: deliveryMode }
    : assertDeliveryMode({ rawEnv, liveConfig, liveEnabled }));
  if (!guard.ok) {
    return { ...summary, refused: true, reason: guard.reason };
  }
  const mode = guard.mode || "dry_run";
  summary.mode = mode;

  if (mode === "live") {
    const cryptoCheck = encryptionRequirement({ envConfig, requireEncryption: true });
    if (!cryptoCheck.ok) return { ...summary, refused: true, reason: cryptoCheck.reason };
    const wired = configureGateway();
    if (!wired.registered || getSmsMode() !== "live") {
      return { ...summary, refused: true, reason: "GATEWAY_NOT_LIVE" };
    }
    summary.provider = wired.name;
  }

  const size = Math.max(1, Math.min(100, Number(limit) || DEFAULT_LIMIT));
  const seenIds = new Set();
  const startOfDay = new Date(now.getTime());
  startOfDay.setUTCHours(0, 0, 0, 0);

  // Daily counters from the notification log. Only aggregate counts are used;
  // no phone numbers or message bodies are read into memory here.
  let globalCount = 0;
  const farmerCounts = new Map();
  try {
    if (notificationLogModel?.aggregate) {
      const rows = await notificationLogModel.aggregate([
        { $match: { occurredAt: { $gte: startOfDay }, status: { $ne: "skipped" } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
      ]);
      for (const row of rows) {
        globalCount += Number(row.count) || 0;
        if (row._id) farmerCounts.set(String(row._id), Number(row.count) || 0);
      }
    }
  } catch { /* fail closed to local in-batch counters only */ }

  for (let index = 0; index < size; index += 1) {
    let job;
    try {
      job = await claimNextOutboxJob({ model, leaseOwner, now, leaseTtlMs });
    } catch {
      summary.errors += 1;
      break;
    }
    if (!job) break;
    const jobId = job._id?.toString?.() || job._id;
    // A job released back to pending after a failure must not be re-claimed
    // repeatedly inside the same batch.
    if (seenIds.has(jobId)) break;
    seenIds.add(jobId);
    summary.claimed += 1;

    try {
      // Reject tampered content before any simulated delivery. Legacy
      // plaintext is never exposed; it is blocked outright in live mode.
      const cryptoCheck = encryptionRequirement({ envConfig, requireEncryption });
      let actualRef = null;
      let plainText = null;
      let legacyPlaintext = false;
      if (job.messageProtected && job.messageAlgorithm === MESSAGE_ALGORITHM) {
        try {
          plainText = decryptOutboxMessage(job.message, { key: encryptionKey });
          actualRef = outboxMessageRef({ dedupeKey: job.dedupeKey, text: plainText });
        } catch {
          actualRef = null;
        }
      } else if (job.messageProtected) {
        actualRef = null;
      } else {
        legacyPlaintext = true;
        plainText = job.message || "";
        actualRef = outboxMessageRef({ dedupeKey: job.dedupeKey, text: plainText });
      }
      if (legacyPlaintext && (mode === "live" || !cryptoCheck.ok)) {
        const blocked = await transitionOutboxStatus({
          id: job._id, from: "processing", to: "cancelled", leaseOwner, now,
          extra: {
            lastError: "LEGACY_PLAINTEXT_BLOCKED",
            cancellationReason: "LEGACY_PLAINTEXT_BLOCKED",
            failureCategory: "permanent",
            nextAttemptAt: null,
          }, model,
        });
        if (blocked.ok) {
          summary.cancelled += 1;
          summary.results.push(safeResult(job, "cancelled", "LEGACY_PLAINTEXT_BLOCKED"));
        } else {
          summary.conflicts += 1;
        }
        continue;
      }
      if (job.messageRef && actualRef !== job.messageRef) {
        const failed = await transitionOutboxStatus({
          id: job._id, from: "processing", to: "failed", leaseOwner, now,
          extra: {
            lastError: "MESSAGE_INTEGRITY_MISMATCH",
            failureCategory: "permanent",
            nextAttemptAt: null,
          }, model,
        });
        if (failed.ok) { summary.failed += 1; summary.results.push(safeResult(job, "failed", "MESSAGE_INTEGRITY_MISMATCH")); }
        else { summary.conflicts += 1; }
        continue;
      }

      // Delivery-time freshness: a queued alert whose source observation has
      // expired must be cancelled, never simulated or sent.
      if (job.expiresAt && new Date(job.expiresAt) <= now) {
        const stale = await transitionOutboxStatus({
          id: job._id, from: "processing", to: "cancelled", leaseOwner, now,
          extra: {
            lastError: "STALE_ALERT_AT_DELIVERY",
            cancellationReason: "STALE_ALERT_AT_DELIVERY",
            failureCategory: "permanent",
            nextAttemptAt: null,
          }, model,
        });
        if (stale.ok) {
          summary.cancelled += 1;
          summary.results.push(safeResult(job, "cancelled", "STALE_ALERT_AT_DELIVERY"));
        } else {
          summary.conflicts += 1;
        }
        continue;
      }

      const [user, preferences] = await Promise.all([
        userModel.findById(job.userId).select("phone phoneVerifiedAt role preferredDistrict").lean(),
        preferencesModel.findOne({ userId: job.userId }).lean(),
      ]);
      const check = revalidate({
        user: user || {},
        preferences: preferences || {},
        category: job.category,
        now,
      });

      if (!check.ok) {
        // Revoked consent / unverified phone: cancel safely, never send.
        const cancelled = await transitionOutboxStatus({
          id: job._id, from: "processing", to: "cancelled", leaseOwner, now,
          extra: {
            lastError: check.code,
            cancellationReason: check.code,
            failureCategory: "permanent",
            nextAttemptAt: null,
          }, model,
        });
        if (cancelled.ok) {
          summary.cancelled += 1;
          summary.results.push(safeResult(job, "cancelled", check.code));
        } else {
          summary.conflicts += 1;
        }
        continue;
      }

      // Per-farmer and global daily caps (aggregate counts only).
      if (globalCount >= globalDailyLimit) {
        summary.stoppedEarly = "GLOBAL_DAILY_LIMIT";
        break;
      }
      const farmerKey = String(job.userId || "unknown");
      const farmerCount = farmerCounts.get(farmerKey) || 0;
      if (farmerCount >= maxPerFarmerPerDay) {
        const limited = await transitionOutboxStatus({
          id: job._id, from: "processing", to: "cancelled", leaseOwner, now,
          extra: {
            lastError: "FARMER_DAILY_LIMIT",
            cancellationReason: "FARMER_DAILY_LIMIT",
            failureCategory: "permanent",
            nextAttemptAt: null,
          }, model,
        });
        if (limited.ok) {
          summary.cancelled += 1;
          summary.limitSkipped += 1;
          summary.results.push(safeResult(job, "cancelled", "FARMER_DAILY_LIMIT"));
        } else {
          summary.conflicts += 1;
        }
        continue;
      }

      const day = now.toISOString().slice(0, 10);
      const reservation = await reserveQuota({
        userId: job.userId, day,
        farmerLimit: maxPerFarmerPerDay,
        globalLimit: globalDailyLimit,
        ...(quotaModel ? { model: quotaModel } : {}),
      });
      if (!reservation.allowed) {
        const limited = await transitionOutboxStatus({
          id: job._id, from: "processing", to: "cancelled", leaseOwner, now,
          extra: {
            lastError: reservation.reason,
            cancellationReason: reservation.reason,
            failureCategory: "permanent",
            nextAttemptAt: null,
          }, model,
        });
        if (limited.ok) {
          summary.cancelled += 1;
          summary.limitSkipped += 1;
          summary.results.push(safeResult(job, "cancelled", reservation.reason));
        } else {
          summary.conflicts += 1;
        }
        continue;
      }

      if (mode === "live") {
        // Live path: the sender rechecks consent/phone and enforces its own
        // dedupe. Accepted submissions are terminal `submitted`, never "delivered".
        let result;
        try {
          result = await send({
            user,
            preferences,
            text: plainText,
            category: job.category,
            dedupeKey: job.dedupeKey,
            now,
            logger: notificationLogModel,
          });
        } catch {
          result = { status: "failed", reason: "provider_exception" };
        }

        if (["duplicate", "no_consent", "unverified_recipient"].includes(result.reason)) {
          const cancelled = await transitionOutboxStatus({
            id: job._id, from: "processing", to: "cancelled", leaseOwner, now,
            extra: {
              lastError: result.reason,
              cancellationReason: result.reason,
              failureCategory: "permanent",
              nextAttemptAt: null,
            }, model,
          });
          if (cancelled.ok) {
            summary.cancelled += 1;
            summary.results.push(safeResult(job, "cancelled", result.reason));
          } else {
            summary.conflicts += 1;
          }
          continue;
        }

        const accepted = result.status === "submitted" || result.status === "sent";
        const ambiguous = result.reason === "ambiguous_submission_no_retry";
        const toStatus = accepted ? "submitted" : "failed";
        const done = await transitionOutboxStatus({
          id: job._id, from: "processing", to: toStatus, leaseOwner, now,
          extra: {
            lastError: accepted ? null : (result.reason || "provider_rejected"),
            provider: summary.provider || null,
            providerRequestId: result.log?.metadata?.providerRequestId || result.requestId || null,
            providerStatus: result.log?.metadata?.providerStatus || (accepted ? "submitted" : null),
            deliveryConfirmed: false,
            ambiguous,
            nextAttemptAt: null,
          }, model,
        });
        if (!done.ok) { summary.conflicts += 1; continue; }
        globalCount += 1;
        farmerCounts.set(farmerKey, farmerCount + 1);
        summary.processed += 1;
        if (accepted) {
          summary.liveSubmissions += 1;
          summary.results.push(safeResult(job, "submitted", "PROVIDER_ACCEPTED"));
        } else {
          summary.failed += 1;
          if (ambiguous) summary.ambiguousSubmissions += 1;
          summary.results.push(safeResult(job, "failed", result.reason || "provider_rejected"));
        }
        continue;
      }

      const simulated = simulateDryRun({ job, now });
      const done = await transitionOutboxStatus({
        id: job._id, from: "processing", to: "dry_run", leaseOwner, now,
        extra: {
          dryRunProvider: "dry-run",
          dryRunNote: simulated.mode + ": No SMS was sent",
          parts: simulated.parts,
          lastError: null,
        },
        model,
      });
      if (!done.ok) {
        await releaseSmsQuota({
          userId: job.userId, day,
          ...(quotaModel ? { model: quotaModel } : {}),
        }).catch(() => {});
        summary.conflicts += 1;
        continue;
      }

      await recordDryRunLog({ job, check: { ...check, phoneLast4: job.phoneLast4 }, now, notificationLogModel });
      globalCount += 1;
      farmerCounts.set(farmerKey, farmerCount + 1);
      summary.dryRuns += 1;
      summary.processed += 1;
      summary.results.push(safeResult(job, "dry_run", "DRY_RUN_RECORDED"));
    } catch {
      // Only unexpected processing errors are temporary. Scheduling is atomic
      // and honours the attempt budget; every later attempt revalidates.
      let retry;
      try {
        retry = await retryScheduler({
          id: job._id,
          leaseOwner,
          attempts: Number(job.attempts) || 1,
          maxAttempts: Number(job.maxAttempts) || 3,
          now,
          lastError: "TEMPORARY_FAILURE",
          baseDelayMs: retryBaseMs,
          maxDelayMs: retryMaxMs,
          model,
        });
      } catch {
        retry = { scheduled: false, exhausted: false, reason: "RETRY_SCHEDULE_ERROR" };
      }
      summary.errors += 1;
      if (retry.scheduled) {
        summary.retryScheduled += 1;
        summary.results.push(safeResult(job, "retry_scheduled", "TEMPORARY_FAILURE"));
      } else if (retry.exhausted) {
        summary.retriesExhausted += 1;
        summary.failed += 1;
        summary.results.push(safeResult(job, "failed", "RETRY_EXHAUSTED"));
      } else {
        summary.failed += 1;
        summary.results.push(safeResult(job, "failed", retry.reason || "TEMPORARY_FAILURE"));
      }
    }
  }

  return summary;
}
