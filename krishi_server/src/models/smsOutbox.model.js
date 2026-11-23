import { createHash } from "node:crypto";
import mongoose from "mongoose";

/**
 * Durable SMS outbox (Part 3D.4A) — foundation only.
 *
 * No delivery worker, retry loop or scheduler consumes this collection yet.
 * The unique (userId, dedupeKey) index makes enqueue idempotent per recipient.
 * The full message is stored in a non-selected field: ordinary queries and
 * logs never return it. Credentials and full phone numbers are never stored.
 */

export const SMS_OUTBOX_STATUSES = Object.freeze([
  "pending",
  "processing",
  "submitted",
  "failed",
  "cancelled",
]);

export const SMS_OUTBOX_TRANSITIONS = Object.freeze({
  pending: ["processing", "cancelled"],
  processing: ["submitted", "failed", "pending"],
  submitted: [],
  failed: ["pending", "cancelled"],
  cancelled: [],
});

export function outboxMessageRef({ dedupeKey = "", text = "" } = {}) {
  return createHash("sha256").update(`${dedupeKey}\u0000${text}`).digest("hex");
}

const smsOutboxSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: {
      type: String,
      enum: ["weather", "market", "farmReminder"],
      required: true,
    },
    dedupeKey: { type: String, trim: true, required: true, maxlength: 240 },
    /** Integrity reference. Never a credential or a phone number. */
    messageRef: { type: String, required: true, maxlength: 64 },
    /** Protected content: excluded from default queries, logs and API views. */
    message: { type: String, select: false, maxlength: 2000 },
    parts: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: SMS_OUTBOX_STATUSES,
      default: "pending",
      required: true,
      index: true,
    },
    attempts: { type: Number, min: 0, default: 0 },
    phoneLast4: { type: String, default: null, match: /^\d{4}$/ },
    /** Consent snapshot (timestamps only, no PII) for later revalidation audit. */
    consentGivenAt: { type: Date, default: null },
    consentSource: { type: String, default: null },
    lastAttemptAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    /** Reserved for a future worker; never used for live sending in this part. */
    leaseOwner: { type: String, default: null },
    leaseExpiresAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { collection: "smsoutbox", timestamps: true }
);

smsOutboxSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, name: "sms_outbox_user_dedupe_unique" }
);
smsOutboxSchema.index({ status: 1, createdAt: 1 }, { name: "sms_outbox_status_created" });
smsOutboxSchema.index({ dedupeKey: 1 }, { name: "sms_outbox_dedupe_lookup" });

export const SmsOutbox =
  mongoose.models.SmsOutbox || mongoose.model("SmsOutbox", smsOutboxSchema);
