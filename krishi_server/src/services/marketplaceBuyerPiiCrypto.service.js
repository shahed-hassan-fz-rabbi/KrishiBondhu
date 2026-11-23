import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.config.js";

export const MARKETPLACE_BUYER_PII_ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = "enc:v1";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const BUYER_FIELDS = Object.freeze({
  name: "nameCiphertext",
  phone: "phoneCiphertext",
  deliveryAddress: "deliveryAddressCiphertext",
});
const ENVELOPE_PATTERN = /^enc:v1:([A-Za-z0-9+/]+={0,2}):([A-Za-z0-9+/]+={0,2}):([A-Za-z0-9+/]+={0,2})$/;

function fail(message) {
  // Keep errors deliberately generic: never echo keys, ciphertext, or PII.
  const error = new Error(message);
  error.name = "MarketplaceBuyerPiiCryptoError";
  return error;
}

function decodeKey(key) {
  if (typeof key !== "string" || !/^[A-Fa-f0-9]{64}$/.test(key)) {
    throw fail("Marketplace buyer PII encryption key is missing or invalid.");
  }
  return Buffer.from(key, "hex");
}

function validatePlaintext(value, field) {
  const maxLength = field === "deliveryAddress" ? 2000 : field === "name" ? 100 : 32;
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw fail(`Marketplace buyer ${field} is invalid.`);
  }
  return value;
}

function fieldAad(field) {
  // Binding the schema field and envelope version prevents ciphertext swaps.
  return Buffer.from(`marketplace-order-buyer:${ENVELOPE_VERSION}:${field}`, "utf8");
}

function encryptField(value, field, key) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(MARKETPLACE_BUYER_PII_ALGORITHM, key, iv);
  cipher.setAAD(fieldAad(field));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENVELOPE_VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function parseEnvelope(value) {
  if (typeof value !== "string") throw fail("Marketplace buyer PII ciphertext is invalid.");
  const match = ENVELOPE_PATTERN.exec(value);
  if (!match) throw fail("Marketplace buyer PII ciphertext is invalid or unsupported.");
  const parts = match.slice(1).map((part) => Buffer.from(part, "base64"));
  if (parts.some((part, index) => part.toString("base64") !== match[index + 1])
    || parts[0].length !== IV_BYTES
    || parts[1].length !== AUTH_TAG_BYTES
    || parts[2].length === 0) {
    throw fail("Marketplace buyer PII ciphertext is invalid.");
  }
  return { iv: parts[0], tag: parts[1], ciphertext: parts[2] };
}

function decryptField(value, field, key) {
  const { iv, tag, ciphertext } = parseEnvelope(value);
  try {
    const decipher = createDecipheriv(MARKETPLACE_BUYER_PII_ALGORITHM, key, iv);
    decipher.setAAD(fieldAad(field));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw fail("Marketplace buyer PII could not be decrypted.");
  }
}

/** Encrypt buyer fields into the exact ciphertext keys required by MarketplaceOrder. */
export function encryptMarketplaceBuyerInfo(buyer, { key = env.marketplaceBuyerPiiEncryptionKey } = {}) {
  const cryptoKey = decodeKey(key);
  if (!buyer || typeof buyer !== "object" || Array.isArray(buyer)) {
    throw fail("Marketplace buyer information is invalid.");
  }
  const extras = Object.keys(buyer).filter((field) => !Object.hasOwn(BUYER_FIELDS, field));
  if (extras.length) throw fail("Marketplace buyer information contains unsupported fields.");

  const encrypted = {};
  for (const [field, ciphertextField] of Object.entries(BUYER_FIELDS)) {
    const value = validatePlaintext(buyer[field], field);
    encrypted[ciphertextField] = encryptField(value, field, cryptoKey);
  }
  return encrypted;
}

/** Decrypt only in explicitly authorized server-side workflows; never logs plaintext. */
export function decryptMarketplaceBuyerInfo(encryptedBuyer, { key = env.marketplaceBuyerPiiEncryptionKey } = {}) {
  const cryptoKey = decodeKey(key);
  if (!encryptedBuyer || typeof encryptedBuyer !== "object" || Array.isArray(encryptedBuyer)) {
    throw fail("Marketplace buyer PII ciphertext is invalid.");
  }
  const expected = Object.values(BUYER_FIELDS);
  const extras = Object.keys(encryptedBuyer).filter((field) => !expected.includes(field));
  if (extras.length) throw fail("Marketplace buyer PII ciphertext is invalid.");

  const buyer = {};
  for (const [field, ciphertextField] of Object.entries(BUYER_FIELDS)) {
    buyer[field] = decryptField(encryptedBuyer[ciphertextField], field, cryptoKey);
  }
  return buyer;
}
