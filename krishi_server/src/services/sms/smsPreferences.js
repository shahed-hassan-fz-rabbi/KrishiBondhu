import { createHash, randomBytes } from "node:crypto";

/** Subscription categories this foundation supports. */
export const SMS_CATEGORIES = Object.freeze(["weather", "market", "farmReminder"]);

export const DEFAULT_SMS_PREFERENCES = Object.freeze({
  weather: { enabled: false, subscribedAt: null, unsubscribedAt: null },
  market: { enabled: false, subscribedAt: null, unsubscribedAt: null },
  farmReminder: { enabled: false, subscribedAt: null, unsubscribedAt: null },
});

export function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

export function isValidBangladeshMobile(phone) {
  return /^\+?8801[3-9]\d{8}$/.test(String(phone || ""));
}

/**
 * Normalise a raw preference document into a predictable shape. Any unknown
 * category is dropped and every known category gets a full subscription object.
 */
export function normalizeSmsPreferences(raw = {}) {
  const source = raw?.categories && typeof raw.categories === "object" ? raw.categories : raw || {};
  const categories = {};
  for (const category of SMS_CATEGORIES) {
    const entry = source[category] && typeof source[category] === "object" ? source[category] : {};
    categories[category] = {
      enabled: entry.enabled === true,
      subscribedAt: entry.subscribedAt || null,
      unsubscribedAt: entry.unsubscribedAt || null,
    };
  }
  return {
    categories,
    consentGivenAt: raw?.consent?.givenAt || raw?.consentGivenAt || null,
    consentSource: raw?.consent?.source || raw?.consentSource || null,
    consentRevokedAt: raw?.consent?.revokedAt || raw?.consentRevokedAt || null,
  };
}

/**
 * Consent is explicit per category. A verified phone alone is NOT consent.
 * Revoking consent disables every category, including ones left "enabled".
 */
export function hasSmsConsent({ user = {}, preferences = {}, category, now = new Date() } = {}) {
  if (!SMS_CATEGORIES.includes(category)) return false;
  const prefs = normalizeSmsPreferences(preferences);
  if (prefs.consentRevokedAt && new Date(prefs.consentRevokedAt) <= now) return false;
  if (!prefs.consentGivenAt || new Date(prefs.consentGivenAt) > now) return false;
  if (!user.phone || !user.phoneVerifiedAt || new Date(user.phoneVerifiedAt) > now) return false;
  const subscription = prefs.categories[category];
  if (!subscription.enabled || subscription.unsubscribedAt && new Date(subscription.unsubscribedAt) <= now) return false;
  if (subscription.subscribedAt && new Date(subscription.subscribedAt) > now) return false;
  return true;
}

/** Build a patched preferences object after an explicit opt-in or opt-out. */
export function updateCategoryConsent(preferences, category, enabled, { now = new Date(), source = "settings" } = {}) {
  if (!SMS_CATEGORIES.includes(category)) throw new Error(`Unknown SMS category: ${category}`);
  const prefs = normalizeSmsPreferences(preferences);
  const stamp = enabled ? now.toISOString() : null;
  const entry = prefs.categories[category];
  prefs.categories[category] = enabled
    ? { enabled: true, subscribedAt: entry.subscribedAt || stamp, unsubscribedAt: null }
    : { enabled: false, subscribedAt: null, unsubscribedAt: now.toISOString() };
  if (enabled) {
    prefs.consentGivenAt = prefs.consentGivenAt || now.toISOString();
    prefs.consentSource = prefs.consentSource || source;
    prefs.consentRevokedAt = null;
  }
  return prefs;
}

/** Revoke all categories at once (global unsubscribe). */
export function revokeAllSmsConsent(preferences, { now = new Date() } = {}) {
  const prefs = normalizeSmsPreferences(preferences);
  const stamp = now.toISOString();
  for (const category of SMS_CATEGORIES) {
    prefs.categories[category] = { enabled: false, subscribedAt: null, unsubscribedAt: stamp };
  }
  prefs.consentRevokedAt = stamp;
  return prefs;
}

/** Generate a one-click unsubscribe token and its hash for storage. */
export function createUnsubscribeToken() {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashUnsubscribeToken(token) };
}

export function hashUnsubscribeToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

/** Estimate Bangla SMS parts: Unicode text is 70 chars single, 67 when split. */
export function smsParts(text) {
  const value = String(text || "");
  const unicode = /[^\x00-\x7F]/.test(value);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  if (!value.length) return 0;
  return value.length <= single ? 1 : Math.ceil(value.length / multi);
}
