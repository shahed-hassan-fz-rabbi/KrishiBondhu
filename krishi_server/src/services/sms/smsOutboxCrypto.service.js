import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.config.js";

/**
 * Authenticated encryption (AES-256-GCM) for outbox message content.
 * Keys come ONLY from the environment. Nothing here logs keys or plaintext.
 * Legacy plaintext records are never silently deleted or exposed.
 */

export const MESSAGE_ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";

export function decodeOutboxKey(key) {
  const raw = typeof key === "string" ? key.trim() : "";
  if (!raw) return null;
  try {
    const bytes = Buffer.from(raw, "base64");
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

export function isOutboxEncryptionConfigured(source = env) {
  return Boolean(decodeOutboxKey(source.smsOutboxEncryptionKey));
}

export function encryptOutboxMessage(text, { key = env.smsOutboxEncryptionKey } = {}) {
  const bytes = decodeOutboxKey(key);
  if (!bytes) throw new Error("SMS_OUTBOX_ENCRYPTION_KEY is missing or invalid (expected base64 32-byte key)");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", bytes, iv);
  const ciphertext = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptOutboxMessage(payload, { key = env.smsOutboxEncryptionKey } = {}) {
  const bytes = decodeOutboxKey(key);
  if (!bytes) throw new Error("SMS_OUTBOX_ENCRYPTION_KEY is missing or invalid");
  const value = String(payload || "");
  if (!value.startsWith(PREFIX)) throw new Error("legacy_plaintext_not_decrypted");
  const [, , ivPart, tagPart, cipherPart] = value.split(":");
  const iv = Buffer.from(ivPart, "base64");
  const tag = Buffer.from(tagPart, "base64");
  const ciphertext = Buffer.from(cipherPart, "base64");
  if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) throw new Error("invalid_encrypted_payload");
  const decipher = createDecipheriv("aes-256-gcm", bytes, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

/** Verify ciphertext integrity without returning plaintext. */
export function verifyOutboxMessageIntegrity(payload, expectedPlaintext, options) {
  try {
    const plain = decryptOutboxMessage(payload, options);
    const a = Buffer.from(plain);
    const b = Buffer.from(String(expectedPlaintext || ""));
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function encryptionRequirement({ envConfig = env, requireEncryption } = {}) {
  const required = requireEncryption === undefined
    ? Boolean(envConfig.smsLive === true || envConfig.nodeEnv === "production")
    : Boolean(requireEncryption);
  if (required && !isOutboxEncryptionConfigured(envConfig)) {
    return { ok: false, reason: "ENCRYPTION_NOT_CONFIGURED" };
  }
  return { ok: true };
}
