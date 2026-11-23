import { User } from "../../models/user.model.js";
import { isValidBangladeshMobile, maskPhone } from "./smsPreferences.js";

/**
 * Convert a stored KrishiBondhu phone (+8801XXXXXXXXX or 01XXXXXXXXX) to the
 * provider format 8801XXXXXXXXX (no plus, no leading zero).
 */
export function toBangladeshE164(phone) {
  const input = String(phone || "").trim();
  // Stored numbers are usually +8801XXXXXXXXX, but accept local 01XXXXXXXXX too.
  const normalised = /^01[3-9]\d{8}$/.test(input) ? `88${input}` : input;
  if (!isValidBangladeshMobile(normalised)) return null;
  const digits = normalised.replace(/\D/g, "");
  return digits.startsWith("880") ? digits : `88${digits}`;
}

/**
 * Pure verification helper. A phone is usable only when verified, present, and
 * a valid Bangladesh mobile number.
 */
export function extractVerifiedPhone(user, { now = new Date() } = {}) {
  if (!user?.phone || !user.phoneVerifiedAt) return null;
  if (new Date(user.phoneVerifiedAt) > now) return null;
  const e164 = toBangladeshE164(user.phone);
  if (!e164) return null;
  return { e164, phoneLast4: maskPhone(e164) };
}

/**
 * Securely retrieve a user's full, verified phone from MongoDB.
 *
 * phoneLast4 on the preferences document is only an audit suffix; the complete
 * number lives on the User document and is fetched server-side with an
 * explicit field selection. It is never returned to clients or logged in full.
 */
export async function getVerifiedSmsRecipient(userId, { now = new Date(), userModel = User } = {}) {
  if (!userId) return null;
  let user;
  try {
    user = await userModel.findById(userId).select("phone phoneVerifiedAt").lean();
  } catch (error) {
    console.warn("[sms] recipient lookup failed:", error?.message || error);
    return null;
  }
  const verified = extractVerifiedPhone(user, { now });
  if (!verified) return null;
  return {
    userId: user._id,
    phone: verified.e164,
    phoneLast4: verified.phoneLast4,
    phoneVerifiedAt: user.phoneVerifiedAt,
    // Full phone stays server-side; callers receive only the masked suffix in logs.
  };
}
