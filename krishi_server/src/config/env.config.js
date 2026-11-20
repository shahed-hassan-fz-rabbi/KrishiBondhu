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

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "5000", 10),
  mongoUri: process.env.MONGODB_URI || "",
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
  corsOrigin: (process.env.CORS_ORIGIN || process.env.CLIENT_URL || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  jwtSecret: resolveJwtSecret(process.env.NODE_ENV || "development", process.env.JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  logLevel: process.env.LOG_LEVEL || "info",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  smsProvider: process.env.SMS_PROVIDER || "",
  sslSmsApiToken: process.env.SSL_SMS_API_TOKEN || "",
  sslSmsSid: process.env.SSL_SMS_SID || "",
  get googleClientId() {
    return (process.env.GOOGLE_CLIENT_ID || "").trim();
  },
  get googleClientSecret() {
    return (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  },
  get googleCallbackUrl() {
    const configuredUrl = (process.env.GOOGLE_CALLBACK_URL || "").trim();
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
