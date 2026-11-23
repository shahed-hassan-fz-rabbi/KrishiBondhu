import { createHash } from "node:crypto";
import { env } from "../config/env.config.js";
import { createAlphaSmsGateway, readAlphaSmsConfig } from "./sms/alphaSms.gateway.js";

/**
 * Normalise a stored Bangladesh mobile to the provider's 8801XXXXXXXXX form.
 * No full number is ever logged.
 */
function normaliseOtpRecipient(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const e164 = /^01[3-9]\d{8}$/.test(digits) ? `88${digits}` : digits;
  return /^8801[3-9]\d{8}$/.test(e164) ? e164 : null;
}

/** Alpha SMS OTP transport. Requires an explicit live opt-in; uses mocked HTTP in tests. */
async function sendAlphaOtp(phone, code, { source, fetchImpl, otpLive }) {
  if (!otpLive) return { sent: false, reason: "otp_delivery_disabled" };
  const to = normaliseOtpRecipient(phone);
  if (!to) return { sent: false, reason: "invalid_recipient" };
  const config = readAlphaSmsConfig(source);
  if (!config.configured) return { sent: false, reason: "provider_not_configured" };

  const adapter = createAlphaSmsGateway({
    config: { ...config, live: true },
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  // The message body contains the OTP. Never log it; the adapter logs only
  // HTTP status or error codes.
  const text = `Your KrishiBondhu verification code is ${code}. It expires in 10 minutes. Do not share it.`;
  const result = await adapter.send({ to, text });
  if (result.ok) return { sent: true, provider: "alpha_sms" };
  return { sent: false, reason: result.error || "provider_error" };
}

export async function sendVerificationCodeSms(phone, code, {
  provider,
  fetchImpl,
  otpLive,
  source = env,
} = {}) {
  const activeProvider = String(provider || source.smsProvider || "").trim().toLowerCase();

  if (activeProvider === "alpha_sms") {
    const live = otpLive === undefined ? source.smsOtpLiveEnabled === true : Boolean(otpLive);
    return sendAlphaOtp(phone, code, { source, fetchImpl, otpLive: live });
  }

  // Existing SSL Wireless path — unchanged behaviour.
  if (activeProvider !== "sslwireless" || !source.sslSmsApiToken || !source.sslSmsSid) {
    return { sent: false, reason: "provider_not_configured" };
  }
  const csmsId = createHash("sha256").update(`verify-${phone}-${Date.now()}`).digest("hex").slice(0, 20);
  try {
    const response = await (fetchImpl || fetch)("https://smsplus.sslwireless.com/api/v3/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ api_token: source.sslSmsApiToken, sid: source.sslSmsSid, msisdn: phone.replace(/^\+/, ""), sms: `Your KrishiBondhu verification code is ${code}. It expires in 10 minutes. Do not share it.`, csms_id: csmsId }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== "SUCCESS") {
      console.warn("[sms] provider declined phone verification", { status: response.status, code: result.status_code || "unknown" });
      return { sent: false, reason: "provider_declined" };
    }
    return { sent: true };
  } catch (error) {
    console.warn("[sms] phone verification delivery failed", error.name || "network_error");
    return { sent: false, reason: "delivery_error" };
  }
}

/** Sends one user-requested farm reminder through SSL Wireless ISMS Plus. */
export async function sendFarmReminderSms(user, notification) {
  if (!user?.smsAlertsEnabled || !user.phone || !user.phoneVerifiedAt) return { sent: false, reason: "not_opted_in" };
  if (env.smsProvider !== "sslwireless" || !env.sslSmsApiToken || !env.sslSmsSid) {
    return { sent: false, reason: "provider_not_configured" };
  }
  const csmsId = createHash("sha256").update(String(notification._id)).digest("hex").slice(0, 20);
  const sms = `${notification.title}${notification.scheduledFor ? ` (${notification.scheduledFor})` : ""}. Open KrishiBondhu for details.`.slice(0, 500);
  try {
    const response = await fetch("https://smsplus.sslwireless.com/api/v3/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        api_token: env.sslSmsApiToken,
        sid: env.sslSmsSid,
        msisdn: user.phone.replace(/^\+/, ""),
        sms,
        csms_id: csmsId,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== "SUCCESS") {
      console.warn("[sms] provider declined farm reminder", { status: response.status, code: result.status_code || "unknown" });
      return { sent: false, reason: "provider_declined" };
    }
    return { sent: true };
  } catch (error) {
    console.warn("[sms] farm reminder delivery failed", error.name || "network_error");
    return { sent: false, reason: "delivery_error" };
  }
}

export async function sendMarketPriceAlertSms(user, alert) {
  if (!user?.smsAlertsEnabled || !user.phone || !user.phoneVerifiedAt || env.smsProvider !== "sslwireless" || !env.sslSmsApiToken || !env.sslSmsSid) {
    return { sent: false, reason: "not_configured_or_opted_in" };
  }
  const csmsId = createHash("sha256").update(`market-${alert._id}-${alert.lastTriggeredAt?.getTime()}`).digest("hex").slice(0, 20);
  const priceType = alert.priceType ? `${alert.priceType} ` : "";
  const sms = `KrishiBondhu price alert: ${alert.commodity}${alert.market ? ` at ${alert.market}` : ""} reached your ${priceType}target ৳${alert.lastTriggeredPrice}/${alert.unit} on ${alert.lastObservedOn}. Verify the DAM report before selling.`.slice(0, 500);
  try {
    const response = await fetch("https://smsplus.sslwireless.com/api/v3/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ api_token: env.sslSmsApiToken, sid: env.sslSmsSid, msisdn: user.phone.replace(/^\+/, ""), sms, csms_id: csmsId }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== "SUCCESS") {
      console.warn("[sms] provider declined market price alert", { status: response.status, code: result.status_code || "unknown" });
      return { sent: false, reason: "provider_declined" };
    }
    return { sent: true };
  } catch (error) {
    console.warn("[sms] market price alert delivery failed", error.name || "network_error");
    return { sent: false, reason: "delivery_error" };
  }
}
