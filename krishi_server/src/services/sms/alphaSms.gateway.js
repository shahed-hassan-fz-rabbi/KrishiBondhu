import { env } from "../../config/env.config.js";

/**
 * Alpha SMS (sms.net.bd) provider adapter.
 * Official API: https://sms.bd/api
 *   POST https://api.sms.net.bd/sendsms
 *   form fields: api_key, msg, to (8801XXXXXXXXX), sender_id (optional)
 *   success: JSON { error: 0, msg, data: { request_id } }
 *   "error: 0" means ACCEPTED/SUBMITTED — not confirmed handset delivery.
 *   Delivery status requires the separate report endpoint; this adapter never
 *   claims delivery confirmation from a submission response.
 *
 * Credentials come ONLY from server environment variables. Registration and
 * live activation remain explicit; the default configuration is dry-run.
 */

export const ALPHA_SMS_ENDPOINT = "https://api.sms.net.bd/sendsms";
export const ALPHA_SMS_SUCCESS_ERROR = 0;

export const ALPHA_SMS_ERROR_CODES = Object.freeze({
  400: "invalid_request",
  403: "permission_denied",
  404: "resource_not_found",
  405: "authorization_required",
  409: "provider_server_error",
  410: "account_expired",
  411: "reseller_expired_or_suspended",
  412: "invalid_schedule",
  413: "invalid_sender_id",
  414: "message_empty",
  415: "message_too_long",
  416: "no_valid_number",
  417: "insufficient_balance",
  420: "content_blocked",
});

export function readAlphaSmsConfig(source = env) {
  const apiKey = String(source.alphaSmsApiKey || "").trim();
  const endpoint = String(source.alphaSmsEndpoint || ALPHA_SMS_ENDPOINT).trim();
  const senderId = String(source.alphaSmsSenderId || "").trim();
  return {
    apiKey,
    endpoint,
    senderId,
    live: source.smsLive === true || source.smsLive === "1",
    configured: Boolean(apiKey && endpoint.startsWith("https://")),
  };
}

/** Parse a provider response without ever exposing credentials. */
export function parseAlphaSmsResponse(body) {
  if (!body) return { ok: false, error: "empty_provider_response" };
  let parsed = body;
  if (typeof body === "string") {
    try { parsed = JSON.parse(body); } catch { return { ok: false, error: "unrecognised_provider_response" }; }
  }
  const error = Number(parsed?.error ?? NaN);
  if (error === ALPHA_SMS_SUCCESS_ERROR) {
    const requestId = parsed?.data?.request_id ?? null;
    return {
      ok: true,
      requestId,
      providerStatus: "submitted",
      deliveryConfirmed: false,
    };
  }
  if (Number.isFinite(error)) {
    return { ok: false, errorCode: error, error: ALPHA_SMS_ERROR_CODES[error] || "provider_rejected" };
  }
  return { ok: false, error: "unrecognised_provider_response" };
}

export function createAlphaSmsGateway({
  config = readAlphaSmsConfig(),
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
} = {}) {
  return {
    name: "alpha_sms",
    config: { configured: config.configured, live: config.live, endpoint: config.endpoint },

    async send({ to, text }) {
      if (!config.configured) return { ok: false, error: "gateway_not_configured" };
      // Defensive: never contact the provider from a dry-run path.
      if (!config.live) return { ok: false, error: "live_mode_disabled" };
      if (!to || !text) return { ok: false, error: "missing_recipient_or_message" };
      if (!/^8801[3-9]\d{8}$/.test(String(to))) return { ok: false, error: "invalid_provider_number" };
      if (config.senderId && !/^[A-Za-z0-9]{1,20}$/.test(String(config.senderId))) {
        return { ok: false, error: "invalid_sender_id" };
      }

      const params = new URLSearchParams({ api_key: config.apiKey, msg: String(text), to: String(to) });
      if (config.senderId) params.set("sender_id", config.senderId);

      try {
        const response = await fetchImpl(config.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Accept: "application/json" },
          body: params.toString(),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const body = await response.text();
        if (!response.ok) {
          // Log status only — the body may echo credentials on some gateways.
          console.warn("[sms] alpha_sms HTTP error", { status: response.status });
          return { ok: false, error: "provider_http_error", statusCode: response.status };
        }
        const parsed = parseAlphaSmsResponse(body);
        if (!parsed.ok) console.warn("[sms] alpha_sms rejected", { code: parsed.errorCode || null, error: parsed.error });
        return parsed;
      } catch (error) {
        const reason = error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "provider_timeout"
          : "provider_network_error";
        console.warn("[sms] alpha_sms send failed", reason);
        return { ok: false, error: reason };
      }
    },
  };
}
