import { env } from "../../config/env.config.js";
import { User } from "../../models/user.model.js";
import { SmsPreferences } from "../../models/smsPreferences.model.js";
import { SmsNotificationLog } from "../../models/smsNotificationLog.model.js";
import { SmsOutbox, outboxMessageRef } from "../../models/smsOutbox.model.js";
import { isSmsLiveEnabled } from "./smsSender.service.js";
import {
  revalidateForDelivery,
  transitionOutboxStatus,
  toSafeOutboxView,
} from "./smsOutbox.service.js";

/**
 * Safe dry-run outbox worker (Part 3D.4B).
 *
 * This worker NEVER contacts an SMS gateway. It atomically claims pending (or
 * expired-lease) jobs, revalidates consent/phone, then records a dry-run
 * outcome in a terminal `dry_run` state. No scheduler, retries or webhooks.
 */

const DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 20;

/** Refuse to run unless SMS_LIVE=0 and no live gateway is active. */
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
        { status: "pending" },
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
} = {}) {
  const summary = {
    claimed: 0,
    processed: 0,
    dryRuns: 0,
    cancelled: 0,
    failed: 0,
    conflicts: 0,
    errors: 0,
    refused: false,
    reason: null,
    results: [],
  };

  const guard = dryRunGuard || assertDryRunOnly({ envConfig, liveEnabled });
  if (!guard.ok) {
    return { ...summary, refused: true, reason: guard.reason };
  }

  const size = Math.max(1, Math.min(100, Number(limit) || DEFAULT_LIMIT));
  const seenIds = new Set();

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
      // Reject tampered content before any simulated delivery.
      const actualRef = outboxMessageRef({ dedupeKey: job.dedupeKey, text: job.message || "" });
      if (job.messageRef && actualRef !== job.messageRef) {
        const failed = await transitionOutboxStatus({
          id: job._id, from: "processing", to: "failed", leaseOwner, now,
          extra: { lastError: "MESSAGE_INTEGRITY_MISMATCH" }, model,
        });
        if (failed.ok) { summary.failed += 1; summary.results.push(safeResult(job, "failed", "MESSAGE_INTEGRITY_MISMATCH")); }
        else { summary.conflicts += 1; }
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
          extra: { lastError: check.code, cancellationReason: check.code }, model,
        });
        if (cancelled.ok) {
          summary.cancelled += 1;
          summary.results.push(safeResult(job, "cancelled", check.code));
        } else {
          summary.conflicts += 1;
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
      if (!done.ok) { summary.conflicts += 1; continue; }

      await recordDryRunLog({ job, check: { ...check, phoneLast4: job.phoneLast4 }, now, notificationLogModel });
      summary.dryRuns += 1;
      summary.processed += 1;
      summary.results.push(safeResult(job, "dry_run", "DRY_RUN_RECORDED"));
    } catch {
      // There is no retry worker yet: fail the job and clear its lease rather
      // than returning it to pending where it would be re-claimed immediately.
      try {
        await transitionOutboxStatus({
          id: job._id, from: "processing", to: "failed", leaseOwner, now,
          extra: { lastError: "PROCESSING_ERROR" }, model,
        });
      } catch { /* best-effort lease release */ }
      summary.errors += 1;
      summary.failed += 1;
      summary.results.push(safeResult(job, "failed", "PROCESSING_ERROR"));
    }
  }

  return summary;
}
