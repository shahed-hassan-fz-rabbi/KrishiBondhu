import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { MarketplaceOrder } from "../src/models/marketplaceorder.model.js";
import {
  decryptMarketplaceBuyerInfo,
  encryptMarketplaceBuyerInfo,
  MARKETPLACE_BUYER_PII_ALGORITHM,
} from "../src/services/marketplaceBuyerPiiCrypto.service.js";

const TEST_KEY = "a7".repeat(32);
const WRONG_KEY = "b8".repeat(32);
const SYNTHETIC_BUYER = Object.freeze({
  name: "পরীক্ষামূলক কৃষক Test Buyer",
  phone: "+8801700000000",
  deliveryAddress: "কুমিল্লা, বাংলাদেশ — Test delivery address",
});

test("AES-256-GCM round-trips Bangla, English and Bangladesh phone data", () => {
  assert.equal(MARKETPLACE_BUYER_PII_ALGORITHM, "aes-256-gcm");
  const ciphertext = encryptMarketplaceBuyerInfo(SYNTHETIC_BUYER, { key: TEST_KEY });
  assert.deepEqual(decryptMarketplaceBuyerInfo(ciphertext, { key: TEST_KEY }), SYNTHETIC_BUYER);
  assert.equal(JSON.stringify(ciphertext).includes(SYNTHETIC_BUYER.name), false);
  assert.equal(JSON.stringify(ciphertext).includes(SYNTHETIC_BUYER.phone), false);
  assert.equal(JSON.stringify(ciphertext).includes(SYNTHETIC_BUYER.deliveryAddress), false);
});

test("each field encryption uses a fresh 12-byte IV and produces different ciphertext", () => {
  const first = encryptMarketplaceBuyerInfo(SYNTHETIC_BUYER, { key: TEST_KEY });
  const second = encryptMarketplaceBuyerInfo(SYNTHETIC_BUYER, { key: TEST_KEY });
  for (const field of Object.keys(first)) {
    assert.notEqual(first[field], second[field]);
    assert.match(first[field], /^enc:v1:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]+={0,2}$/);
  }
});

test("missing and malformed 32-byte hexadecimal keys fail closed", () => {
  for (const key of [undefined, "", "a7".repeat(31), "a7".repeat(33), "g7".repeat(32), "a7".repeat(31) + " "]) {
    assert.throws(() => encryptMarketplaceBuyerInfo(SYNTHETIC_BUYER, { key }), /key is missing or invalid/);
    assert.throws(() => decryptMarketplaceBuyerInfo({}, { key }), /key is missing or invalid/);
  }
});

test("wrong keys, tampering, malformed envelopes and unsupported versions do not decrypt", () => {
  const encrypted = encryptMarketplaceBuyerInfo(SYNTHETIC_BUYER, { key: TEST_KEY });
  assert.throws(() => decryptMarketplaceBuyerInfo(encrypted, { key: WRONG_KEY }), /could not be decrypted/);

  const parts = encrypted.nameCiphertext.split(":");
  parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
  assert.throws(() => decryptMarketplaceBuyerInfo({ ...encrypted, nameCiphertext: parts.join(":") }, { key: TEST_KEY }), /could not be decrypted/);
  assert.throws(() => decryptMarketplaceBuyerInfo({ ...encrypted, phoneCiphertext: "enc:v2:invalid" }, { key: TEST_KEY }), /invalid or unsupported/);
  assert.throws(() => decryptMarketplaceBuyerInfo({ ...encrypted, nameCiphertext: "plaintext" }, { key: TEST_KEY }), /invalid or unsupported/);
});

test("authenticated field separation prevents swapping encrypted buyer fields", () => {
  const encrypted = encryptMarketplaceBuyerInfo(SYNTHETIC_BUYER, { key: TEST_KEY });
  const swapped = {
    ...encrypted,
    nameCiphertext: encrypted.phoneCiphertext,
    phoneCiphertext: encrypted.nameCiphertext,
  };
  assert.throws(() => decryptMarketplaceBuyerInfo(swapped, { key: TEST_KEY }), /could not be decrypted/);
});

test("ciphertext envelope validates against MarketplaceOrder and stays out of default serialization", async () => {
  const buyer = encryptMarketplaceBuyerInfo(SYNTHETIC_BUYER, { key: TEST_KEY });
  const order = new MarketplaceOrder({
    productId: new mongoose.Types.ObjectId(),
    farmerId: new mongoose.Types.ObjectId(),
    productNameSnapshot: "Test rice",
    unitSnapshot: "kg",
    quantity: 1,
    askingPricePerUnitBdt: mongoose.Types.Decimal128.fromString("42"),
    subtotalPaisa: 4200,
    buyer,
  });
  await assert.doesNotReject(order.validate());
  assert.equal("buyer" in order.toJSON(), false);
  assert.equal("buyer" in order.toObject(), false);
});

test("invalid buyer input and decryption errors never echo personal values or log them", () => {
  const sensitiveMarker = "SYNTHETIC_PRIVATE_MARKER_7c8f";
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => logs.push(args.join(" "));
  try {
    assert.throws(
      () => encryptMarketplaceBuyerInfo({ ...SYNTHETIC_BUYER, extra: sensitiveMarker }, { key: TEST_KEY }),
      (error) => !error.message.includes(sensitiveMarker),
    );
    assert.throws(
      () => decryptMarketplaceBuyerInfo({ nameCiphertext: sensitiveMarker }, { key: TEST_KEY }),
      (error) => !error.message.includes(sensitiveMarker),
    );
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  assert.deepEqual(logs, []);
});
