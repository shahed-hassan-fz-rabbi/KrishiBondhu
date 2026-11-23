import mongoose from "mongoose";

/**
 * Append-only audit log for every SMS attempt (including dry runs and skips).
 * Phone numbers are never stored here; only a masked suffix is retained.
 */
const smsNotificationLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    category: {
      type: String,
      enum: ["weather", "market", "farmReminder", "verification", "system"],
      required: true,
    },
    phoneLast4: { type: String, default: null, match: /^\d{4}$/ },
    dedupeKey: { type: String, default: null, index: true },
    status: {
      type: String,
      // `submitted` means the provider accepted the request; `sent` is reserved
  // for confirmed handset delivery (not available without a DLR webhook).
  enum: ["dry_run", "submitted", "sent", "failed", "skipped", "queued", "cancelled"],
      required: true,
    },
    mode: { type: String, enum: ["dry_run", "live"], default: "dry_run" },
    provider: { type: String, default: "dry-run" },
    providerMessageId: { type: String, default: null },
    attempts: { type: Number, default: 1, min: 0 },
    nextRetryAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    /** Number of segments estimated for the message (Bangla Unicode = 70/67). */
    parts: { type: Number, default: 1, min: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { collection: "smsnotificationlogs", timestamps: true }
);

smsNotificationLogSchema.index({ dedupeKey: 1, occurredAt: -1 }, { name: "sms_dedupe_lookup" });
smsNotificationLogSchema.index({ userId: 1, category: 1, occurredAt: -1 }, { name: "sms_user_category_lookup" });

export const SmsNotificationLog = mongoose.model("SmsNotificationLog", smsNotificationLogSchema);
