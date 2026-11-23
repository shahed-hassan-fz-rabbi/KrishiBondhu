import mongoose from "mongoose";

/**
 * Explicit, per-category SMS notification preferences.
 *
 * Consent is never implied: a verified phone plus an explicit opt-in is required
 * for every category. Revoking consent keeps the historical record but disables
 * all future sends. The actual phone number stays on the User document; this
 * model stores only a masked suffix so logs and admin views cannot leak it.
 */
const CHANNELS = ["weather", "market", "farmReminder"];

const subscriptionSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    subscribedAt: { type: Date, default: null },
    unsubscribedAt: { type: Date, default: null },
  },
  { _id: false }
);

const smsPreferencesSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    phoneLast4: { type: String, default: null, match: /^\d{4}$/ },
    phoneVerifiedAtSnapshot: { type: Date, default: null },
    categories: {
      type: Object,
      default: () => ({
        weather: { enabled: false, subscribedAt: null, unsubscribedAt: null },
        market: { enabled: false, subscribedAt: null, unsubscribedAt: null },
        farmReminder: { enabled: false, subscribedAt: null, unsubscribedAt: null },
      }),
    },
    consent: {
      givenAt: { type: Date, default: null },
      source: { type: String, default: null },
      revokedAt: { type: Date, default: null },
    },
    /** High-entropy token hashed at rest; the raw token is returned once on subscribe. */
    unsubscribeTokenHash: { type: String, default: null, select: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "smspreferences", timestamps: true }
);

smsPreferencesSchema.index({ userId: 1 }, { name: "uniq_sms_prefs_user", unique: true });

smsPreferencesSchema.statics.CHANNELS = CHANNELS;

smsPreferencesSchema.methods.enabledCategories = function enabledCategories() {
  return CHANNELS.filter((category) => this.categories?.[category]?.enabled === true);
};

export const SmsPreferences = mongoose.model("SmsPreferences", smsPreferencesSchema);
