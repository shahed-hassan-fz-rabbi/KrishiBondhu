import { SMS_CATEGORIES, normalizeSmsPreferences, updateCategoryConsent, revokeAllSmsConsent, maskPhone } from "./smsPreferences.js";

/** Map friendly route names to stored preference category keys. */
const CATEGORY_ALIASES = Object.freeze({
  weather: "weather",
  market: "market",
  "market-price": "market",
  "farm-reminder": "farmReminder",
  farmReminder: "farmReminder",
  reminder: "farmReminder",
});

export function resolveCategory(value) {
  return CATEGORY_ALIASES[String(value || "")] || null;
}

export function listSupportedCategories() {
  return ["weather", "market", "farmReminder"];
}

/**
 * Strict input validation. `enabled` must be an explicit boolean; missing or
 * truthy strings never enable a subscription (no accidental opt-in).
 */
export function validateCategoryUpdate(params = {}, body = {}) {
  const category = resolveCategory(params.category);
  if (!category || !SMS_CATEGORIES.includes(category)) {
    return { ok: false, code: "INVALID_SMS_CATEGORY", message: "Unknown SMS subscription category" };
  }
  if (typeof body.enabled !== "boolean") {
    return { ok: false, code: "INVALID_CONSENT_VALUE", message: "enabled must be explicitly true or false" };
  }
  if (body.source !== undefined && (typeof body.source !== "string" || body.source.length > 60)) {
    return { ok: false, code: "INVALID_CONSENT_SOURCE", message: "Invalid consent source" };
  }
  return { ok: true, category, enabled: body.enabled, source: body.source || "settings" };
}

/** Verify that the authenticated user's own phone is verified before opting in. */
export function assertPhoneVerified(user, { now = new Date() } = {}) {
  if (!user?.phone || !user.phoneVerifiedAt) {
    return { ok: false, code: "PHONE_NOT_VERIFIED", message: "Verify your phone number before enabling SMS alerts" };
  }
  if (new Date(user.phoneVerifiedAt) > now) {
    return { ok: false, code: "PHONE_NOT_VERIFIED", message: "Verify your phone number before enabling SMS alerts" };
  }
  return { ok: true };
}

/** Build a safe API view. Never include full phone, tokens or credentials. */
export function toPublicSmsPreferences({ preferences = {}, user = {}, now = new Date() } = {}) {
  const prefs = normalizeSmsPreferences(preferences);
  const categories = {};
  for (const category of SMS_CATEGORIES) {
    const entry = prefs.categories[category];
    categories[category] = {
      enabled: entry.enabled === true,
      subscribedAt: entry.subscribedAt,
      unsubscribedAt: entry.unsubscribedAt,
    };
  }
  return {
    categories,
    consent: {
      givenAt: prefs.consentGivenAt,
      revokedAt: prefs.consentRevokedAt,
      source: prefs.consentSource,
    },
    phone: {
      verified: Boolean(user.phoneVerifiedAt && new Date(user.phoneVerifiedAt) <= now),
      last4: maskPhone(user.phone),
    },
  };
}

/** Produce the patched preference document for a category opt-in/out. */
export function applyCategoryChange(preferences, { category, enabled, source }, { now = new Date() } = {}) {
  return updateCategoryConsent(preferences, category, enabled, { now, source });
}

/** Produce the patched preference document for a global unsubscribe. */
export function applyUnsubscribeAll(preferences, { now = new Date() } = {}) {
  return revokeAllSmsConsent(preferences, { now });
}

/**
 * Convert the pure helper shape (flat consent fields) into the shape stored by
 * the SmsPreferences Mongoose model (nested `consent` object). Without this,
 * consent timestamps would be written to fields the model does not persist.
 */
export function toModelPatch(patch = {}) {
  return {
    categories: patch.categories,
    consent: {
      givenAt: patch.consentGivenAt || patch.consent?.givenAt || null,
      source: patch.consentSource || patch.consent?.source || null,
      revokedAt: patch.consentRevokedAt || patch.consent?.revokedAt || null,
    },
  };
}
