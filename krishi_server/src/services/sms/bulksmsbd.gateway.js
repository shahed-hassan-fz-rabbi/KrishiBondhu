import { env } from "../../config/env.config.js";

/**
 * Secure BulkSMSBD (https://bulksmsbd.com) provider adapter.
 *
 * Official API reference: https://bulksmsbd.com/bulksms-api-bangladesh.php
 *   POST https://bulksmsbd.net/api/smsapi
 *   form fields: api_key, senderid, number (8801XXXXXXXXX), type=text, message
 *   success: response_code 202 ("SMS Submitted Successfully")
 *
 * Credentials are read ONLY from server environment variables. They are never
 * accepted from callers, never returned, and never written to logs. The default
 * configuration is dry-run; real delivery requires SMS_LIVE=1 explicitly.
 */

export const BULKSMSBD_ENDPOINT = "https://bulksmsbd.net/api/smsapi";
export const BULKSMSBD_SUCCESS_CODE = 202;

const ERROR_CODES = {
  1002: "sender_id_invalid_or_disabled",
  1003: "missing_required_fields",
  1005: "provider_internal_error",
  1006: "balance_validity_unavailable",
  1007: "insufficient_balance",
  1011: "user_not_found",
  1012: "masking_sms_must_be_bengali",
  1013: "sender_gateway_not_found",
  1018: "account_disabled",
  1031: "account_not_verified",
  1032: "ip_not_whitelisted",
};

export function readBulkSmsBdConfig(source = env) {
  const apiKey = String(source.bulkSmsApiKey || "").trim();
  const senderId = String(source.bulkSmsSenderId || "").trim();
  const endpoint = String(source.bulkSmsEndpoint || BULKSMSBD_ENDPOINT).trim();
  return {
    apiKey,
    senderId,
    endpoint,
    live: source.smsLive === true || source.smsLive === "1",
    configured: Boolean(apiKey && senderId && endpoint.startsWith("https://")),
  };
}

/**
 * Parse a provider response without ever exposing credentials.
 * The official API can answer JSON or plain text depending on account settings.
 */
export function parseBulkSmsBdResponse(body) {
  if (!body) return { ok: false, error: "empty_provider_response" };
  let parsed = body;
  if (typeof body === "string") {
    try { parsed = JSON.parse(body); } catch { parsed = { response_message: body }; }
  }
  const code = Number(parsed?.response_code ?? parsed?.responseCode ?? NaN);
  if (code === BULKSMSBD_SUCCESS_CODE) {
    return { ok: true, responseCode: code, messageId: parsed?.response_id || parsed?.responseId || null };
  }
  if (Number.isFinite(code)) {
    return { ok: false, responseCode: code, error: ERROR_CODES[code] || "provider_rejected" };
  }
  const message = String(parsed?.response_message || parsed?.message || "").toLowerCase();
  if (message.includes("success") || message.includes("submitted")) return { ok: true, responseCode: null, messageId: null };
  return { ok: false, error: "unrecognised_provider_response" };
}

/**
 * Build a provider adapter.
 * @param options.config  Injected config (tests); defaults to server env.
 * @param options.fetchImpl  Injected fetch (tests); defaults to global fetch.
 */
export function createBulkSmsBdGateway({ config = readBulkSmsBdConfig(), fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  return {
    name: "bulksmsbd",
    config: { configured: config.configured, live: config.live, endpoint: config.endpoint },

    async send({ to, text }) {
      if (!config.configured) return { ok: false, error: "gateway_not_configured" };

      // Defensive: the adapter itself must never be called from dry-run paths.
      if (!config.live) return { ok: false, error: "live_mode_disabled" };
      if (!to || !text) return { ok: false, error: "missing_recipient_or_message" };

      const params = new URLSearchParams({
        api_key: config.apiKey,
        senderid: config.senderId,
        number: String(to),
        type: "text",
        message: String(text),
      });

      try {
        const response = await fetchImpl(config.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Accept: "application/json, text/plain;q=0.9" },
          body: params.toString(),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const body = await response.text();
        if (!response.ok) {
          // Log status only — never body, which can echo credentials on some gateways.
          console.warn("[sms] bulksmsbd HTTP error", { status: response.status });
          return { ok: false, error: "provider_http_error", statusCode: response.status };
        }
        const parsed = parseBulkSmsBdResponse(body);
        if (!parsed.ok) console.warn("[sms] bulksmsbd rejected", { code: parsed.responseCode || null, error: parsed.error });
        return parsed;
      } catch (error) {
        const reason = error?.name === "TimeoutError" || error?.name === "AbortError" ? "provider_timeout" : "provider_network_error";
        console.warn("[sms] bulksmsbd send failed", reason);
        return { ok: false, error: reason };
      }
    },
  };
}
