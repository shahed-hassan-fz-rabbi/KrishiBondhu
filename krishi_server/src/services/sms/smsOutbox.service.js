import {
  SmsOutbox,
  SMS_OUTBOX_TRANSITIONS,
  outboxMessageRef,
} from "../../models/smsOutbox.model.js";
import { env } from "../../config/env.config.js";
import { hasSmsConsent, smsParts } from "./smsPreferences.js";
import { extractVerifiedPhone } from "./smsRecipient.service.js";
import { resolveCategory } from "./smsSubscription.service.js";
import {
  encryptOutboxMessage,
  isOutboxEncryptionConfigured,
  encryptionRequirement,
  MESSAGE_ALGORITHM,
} from "./smsOutboxCrypto.service.js";

/**
 * Persistent SMS outbox foundation (Part 3D.4A).
 *
 * Enqueueing is idempotent per recipient via the unique (userId, dedupeKey)
 * index. This module NEVER sends, retries, schedules or calls a gateway. A
 * future delivery worker must call revalidateForDelivery() again immediately
 * before sending, because consent or phone verification may have changed.
 */

const DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000;

/** Consent + recipient checks, shared by enqueue and future delivery. */
export function revalidateForDelivery({ user = {}, preferences = {}, category, now = new Date() } = {}) {
  const resolved = resolveCategory(category);
  if (!resolved) return { ok: false, code: "INVALID_CATEGORY" };
  // Validate the recipient first so an unverified/invalid phone is reported
  // distinctly from a consent withdrawal.
  const recipient = extractVerifiedPhone(user, { now });
  if (!recipient) return { ok: false, code: "INVALID_RECIPIENT" };
  if (!hasSmsConsent({ user, preferences, category: resolved, now })) {
    return { ok: false, code: "NO_CONSENT" };
  }
  return { ok: true, category: resolved, phoneLast4: recipient.phoneLast4 };
}

/** Never include message text, full phones, credentials or tokens. */
export function toSafeOutboxView(document = {}) {
  return {
    id: document._id?.toString?.() || document._id || null,
    userId: document.userId?.toString?.() || document.userId || null,
    category: document.category || null,
    dedupeKey: document.dedupeKey || null,
    messageRef: document.messageRef || null,
    parts: document.parts ?? null,
    status: document.status || null,
    attempts: document.attempts ?? 0,
    maxAttempts: document.maxAttempts ?? null,
    nextAttemptAt: document.nextAttemptAt || null,
    failureCategory: document.failureCategory || null,
    phoneLast4: document.phoneLast4 || null,
    createdAt: document.createdAt || null,
  };
}

export async function enqueueSmsAlert({
  user = {},
  preferences = {},
  category,
  text = "",
  dedupeKey = "",
  now = new Date(),
  sourceObservedAt = null,
  freshnessMaxAgeMs = null,
  model = SmsOutbox,
  encryptionKey,
  requireEncryption,
  envConfig = env,
} = {}) {
  const cryptoCheck = encryptionRequirement({ envConfig, requireEncryption });
  if (!cryptoCheck.ok) return { enqueued: false, reason: cryptoCheck.reason, outbox: null };
  const validation = revalidateForDelivery({ user, preferences, category, now });
  if (!validation.ok) return { enqueued: false, reason: validation.code, outbox: null };

  if (typeof dedupeKey !== "string" || !dedupeKey.trim()) {
    return { enqueued: false, reason: "INVALID_DEDUPE_KEY", outbox: null };
  }
  if (typeof text !== "string" || !text.trim()) {
    return { enqueued: false, reason: "EMPTY_MESSAGE", outbox: null };
  }

  const key = dedupeKey.trim();
  const messageRef = outboxMessageRef({ dedupeKey: key, text });
  const cryptoKey = encryptionKey !== undefined ? encryptionKey : envConfig.smsOutboxEncryptionKey;
  const configured = isOutboxEncryptionConfigured({ smsOutboxEncryptionKey: cryptoKey });
  if (encryptionKey !== undefined && !configured) {
    return { enqueued: false, reason: "ENCRYPTION_NOT_CONFIGURED", outbox: null };
  }
  let storedMessage = text;
  let messageProtected = false;
  let messageAlgorithm = null;
  if (configured) {
    try {
      storedMessage = encryptOutboxMessage(text, { key: cryptoKey });
      messageProtected = true;
      messageAlgorithm = MESSAGE_ALGORITHM;
    } catch {
      return { enqueued: false, reason: "ENCRYPTION_FAILED", outbox: null };
    }
  }
  try {
    const created = await model.create({
      userId: user._id || user.id || null,
      category: validation.category,
      dedupeKey: key,
      messageRef,
      message: storedMessage,
      messageProtected,
      messageAlgorithm,
      parts: smsParts(text),
      sourceObservedAt: sourceObservedAt ? new Date(sourceObservedAt) : null,
      freshnessMaxAgeMs: Number.isFinite(freshnessMaxAgeMs) ? freshnessMaxAgeMs : null,
      expiresAt: sourceObservedAt && Number.isFinite(freshnessMaxAgeMs)
        ? new Date(new Date(sourceObservedAt).getTime() + freshnessMaxAgeMs)
        : null,
      status: "pending",
      attempts: 0,
      phoneLast4: validation.phoneLast4,
      consentGivenAt: preferences?.consent?.givenAt || preferences?.consentGivenAt || null,
      consentSource: preferences?.consent?.source || preferences?.consentSource || null,
      leaseOwner: null,
      leaseExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    });
    return { enqueued: true, reason: "ENQUEUED", outbox: toSafeOutboxView(created) };
  } catch (error) {
    if (error?.code === 11000 || /E11000|duplicate key/i.test(String(error?.message || ""))) {
      return { enqueued: false, reason: "DUPLICATE", outbox: null };
    }
    return { enqueued: false, reason: "ENQUEUE_ERROR", outbox: null };
  }
}

/**
 * Atomic, guarded status transition. Only a caller matching the current state
 * (and lease owner, when supplied) can move an item forward.
 */
export async function transitionOutboxStatus({
  id,
  from,
  to,
  leaseOwner = null,
  now = new Date(),
  leaseTtlMs = DEFAULT_LEASE_TTL_MS,
  extra = {},
  model = SmsOutbox,
} = {}) {
  if (!SMS_OUTBOX_TRANSITIONS[from]?.includes(to)) {
    return { ok: false, reason: "INVALID_TRANSITION" };
  }
  const filter = { _id: id, status: from };
  // An owner is only required to match when releasing an existing lease.
  // Claiming a pending item assigns the owner instead.
  if (leaseOwner && from === "processing") filter.leaseOwner = leaseOwner;

  const update = { $set: { status: to, updatedAt: now } };
  if (to === "processing") {
    update.$set.leaseOwner = leaseOwner;
    update.$set.leaseExpiresAt = new Date(now.getTime() + leaseTtlMs);
    update.$inc = { attempts: 1 };
    update.$set.lastAttemptAt = now;
  } else {
    update.$set.leaseOwner = null;
    update.$set.leaseExpiresAt = null;
  }
  if (to === "submitted") update.$set.submittedAt = now;
  if (to === "dry_run") update.$set.dryRunAt = now;
  if (to === "failed") update.$set.failedAt = now;
  if (to === "cancelled") update.$set.cancelledAt = now;
  for (const [key, value] of Object.entries(extra)) {
    if (key !== "status" && key !== "attempts") update.$set[key] = value;
  }

  try {
    const updated = await model.findOneAndUpdate(filter, update, { new: true });
    if (!updated) return { ok: false, reason: "NOT_FOUND_OR_CONFLICT" };
    return { ok: true, outbox: toSafeOutboxView(updated) };
  } catch (error) {
    return { ok: false, reason: "TRANSITION_ERROR" };
  }
}
