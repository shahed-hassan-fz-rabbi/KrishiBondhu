/**
 * Loads environment variables from .env into process.env.
 * Must be imported first in server.js (before config values are read).
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveJwtSecret } from "./security.config.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const serverRootDir = path.resolve(currentDir, "../..");
export const serverEnvPath = path.resolve(serverRootDir, ".env");

// Keep .env as the local fallback while allowing process-level values to override it.
// Hosts and local multi-project workspaces need to choose a free PORT without editing .env.
dotenv.config({ path: serverEnvPath });

// Render sets NODE_ENV=production for Node services, but a manually configured
// NODE_ENV=development can override it. Treat the hosted runtime as production
// so credentialed cross-site auth cookies and production CORS rules stay safe.
const nodeEnv = process.env.RENDER === "true"
  ? "production"
  : process.env.NODE_ENV || "development";

function normalizeOrigin(value) {
  const candidate = String(value || "").trim();
  try {
    return new URL(candidate).origin;
  } catch {
    return candidate.replace(/\/+$/, "");
  }
}

export const env = {
  nodeEnv,
  port: parseInt(process.env.PORT || "5000", 10),
  mongoUri: process.env.MONGODB_URI || "",
  clientUrl: normalizeOrigin(process.env.CLIENT_URL || "http://localhost:3000"),
  corsOrigin: (process.env.CORS_ORIGIN || process.env.CLIENT_URL || "http://localhost:3000")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean),
  jwtSecret: resolveJwtSecret(nodeEnv, process.env.JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  logLevel: process.env.LOG_LEVEL || "info",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  smsProvider: process.env.SMS_PROVIDER || "",
  // OTP delivery is a separate transport. Real OTP sends require explicit opt-in.
  smsOtpLiveEnabled: process.env.SMS_OTP_LIVE_ENABLED === "1",
  sslSmsApiToken: process.env.SSL_SMS_API_TOKEN || "",
  sslSmsSid: process.env.SSL_SMS_SID || "",
  // Notification SMS gateway (BulkSMSBD). Live sending is opt-in via SMS_LIVE=1.
  bulkSmsApiKey: process.env.BULKSMSBD_API_KEY || "",
  bulkSmsSenderId: process.env.BULKSMSBD_SENDER_ID || "",
  bulkSmsEndpoint: process.env.BULKSMSBD_ENDPOINT || "https://bulksmsbd.net/api/smsapi",
  // Alpha SMS (sms.net.bd) — additional provider; BulkSMSBD is retained.
  alphaSmsApiKey: process.env.SMS_NET_BD_API_KEY || "",
  alphaSmsEndpoint: process.env.SMS_NET_BD_ENDPOINT || "https://api.sms.net.bd/sendsms",
  alphaSmsSenderId: process.env.SMS_NET_BD_SENDER_ID || "",
  smsLive: process.env.SMS_LIVE === "1",
  // Weather alert scheduler is OFF unless explicitly enabled.
  weatherAlertSchedulerEnabled: process.env.WEATHER_ALERT_SCHEDULER_ENABLED === "1",
  weatherAlertIntervalMinutes: parseInt(process.env.WEATHER_ALERT_INTERVAL_MINUTES || "60", 10),
  weatherAlertDbWaitTimeoutMs: parseInt(process.env.WEATHER_ALERT_DB_WAIT_TIMEOUT_MS || "30000", 10),
  // Dry-run SMS outbox scheduler is OFF unless explicitly enabled.
  smsOutboxSchedulerEnabled: process.env.SMS_OUTBOX_SCHEDULER_ENABLED === "1",
  smsOutboxIntervalSeconds: parseInt(process.env.SMS_OUTBOX_INTERVAL_SECONDS || "60", 10),
  smsOutboxBatchSize: parseInt(process.env.SMS_OUTBOX_BATCH_SIZE || "20", 10),
  smsOutboxDbWaitTimeoutMs: parseInt(process.env.SMS_OUTBOX_DB_WAIT_TIMEOUT_MS || "30000", 10),
  // Base64-encoded 32-byte AES-256-GCM key for outbox message content.
  smsOutboxEncryptionKey: process.env.SMS_OUTBOX_ENCRYPTION_KEY || "",
  // Dedicated 64-hex-character AES-256-GCM key for marketplace buyer PII.
  marketplaceBuyerPiiEncryptionKey: process.env.MARKETPLACE_BUYER_PII_ENCRYPTION_KEY || "",
  smsOutboxRetentionDays: parseInt(process.env.SMS_OUTBOX_RETENTION_DAYS || "30", 10),
  // Live single-number test command is opt-in and never enabled by default.
  smsLiveTestEnabled: process.env.SMS_LIVE_TEST_ENABLED === "1",
  smsLiveTestAllowedNumbers: process.env.SMS_LIVE_TEST_ALLOWED_NUMBERS || "",
  // Market alert scheduler is OFF unless explicitly enabled.
  marketAlertSchedulerEnabled: process.env.MARKET_ALERT_SCHEDULER_ENABLED === "1",
  marketAlertIntervalMinutes: parseInt(process.env.MARKET_ALERT_INTERVAL_MINUTES || "30", 10),
  marketAlertDbWaitTimeoutMs: parseInt(process.env.MARKET_ALERT_DB_WAIT_TIMEOUT_MS || "30000", 10),
  get googleClientId() {
    return (process.env.GOOGLE_CLIENT_ID || "").trim();
  },
  get googleClientSecret() {
    return (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  },
  get googleCallbackUrl() {
    const configuredUrl = (process.env.GOOGLE_CALLBACK_URL || "").trim();
    const renderExternalUrl = (process.env.RENDER_EXTERNAL_URL || "").trim().replace(/\/+$/, "");
    if (renderExternalUrl) {
      let configuredHostIsLocal = false;
      try {
        configuredHostIsLocal = ["localhost", "127.0.0.1"].includes(new URL(configuredUrl).hostname);
      } catch {
        configuredHostIsLocal = Boolean(configuredUrl);
      }
      if (!configuredUrl || configuredHostIsLocal) {
        return `${renderExternalUrl}/api/v1/auth/google/callback`;
      }
    }
    const callbackUrl = configuredUrl || `http://localhost:${env.port}/api/v1/auth/google/callback`;
    // The development runner may reserve a different port than the persisted
    // .env callback. Keep the local redirect on the server that started this app.
    if (env.nodeEnv === "development" && configuredUrl) {
      try {
        const parsed = new URL(configuredUrl);
        if (["localhost", "127.0.0.1"].includes(parsed.hostname)) parsed.port = String(env.port);
        return parsed.toString();
      } catch {
        return callbackUrl;
      }
    }
    return callbackUrl;
  },
};

/**
 * Checks whether Google OAuth is configured with real Client ID & Secret (not placeholders).
 * Performs an on-demand disk re-sync if in-memory variables are missing or placeholders.
 */
export function isGoogleOAuthConfigured() {
  const isPlaceholder = (val) =>
    !val ||
    val.trim().length === 0 ||
    val.toLowerCase().includes("your_google") ||
    val.toLowerCase().includes("your_client") ||
    val.toLowerCase().includes("placeholder") ||
    val.startsWith("<");

  let clientId = (process.env.GOOGLE_CLIENT_ID || env.googleClientId || "").trim();
  let clientSecret = (process.env.GOOGLE_CLIENT_SECRET || env.googleClientSecret || "").trim();

  // If values are missing or are placeholders, re-read .env from disk with override
  if (isPlaceholder(clientId) || isPlaceholder(clientSecret)) {
    try {
      dotenv.config({ path: serverEnvPath, override: true });
      clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
      clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
    } catch {
      // Fallback gracefully
    }
  }

  return Boolean(
    clientId &&
    !isPlaceholder(clientId) &&
    clientSecret &&
    !isPlaceholder(clientSecret)
  );
}
