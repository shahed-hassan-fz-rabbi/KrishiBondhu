import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  MarketplaceOrder,
  MARKETPLACE_ORDER_PAYMENT_STATUSES,
  MARKETPLACE_ORDER_PHONE_STATUSES,
  MARKETPLACE_ORDER_STATUSES,
} from "../src/models/marketplaceorder.model.js";

const validBuyerCiphertext = Object.freeze({
  nameCiphertext: "enc:v1:YWJjZGVmZ2hpamts:YWJjZGVmZ2hpamtsbW5vcA==:Ynl0ZXM=",
  phoneCiphertext: "enc:v1:YWJjZGVmZ2hpamts:YWJjZGVmZ2hpamtsbW5vcA==:Ynl0ZXM=",
  deliveryAddressCiphertext: "enc:v1:YWJjZGVmZ2hpamts:YWJjZGVmZ2hpamtsbW5vcA==:Ynl0ZXM=",
});

function validOrder(overrides = {}) {
  return new MarketplaceOrder({
    productId: new mongoose.Types.ObjectId(),
    farmerId: new mongoose.Types.ObjectId(),
    productNameSnapshot: "BRRI dhan rice",
    unitSnapshot: "quintal",
    quantity: 1.25,
    askingPricePerUnitBdt: mongoose.Types.Decimal128.fromString("3200"),
    subtotalPaisa: 400000,
    buyer: { ...validBuyerCiphertext },
    ...overrides,
  });
}

test("valid single-product order schema validates encrypted buyer data and decimal-safe BDT snapshots", async () => {
  const order = validOrder();
  await assert.doesNotReject(order.validate());
  assert.equal(order.currency, "BDT");
  assert.ok(order.askingPricePerUnitBdt instanceof mongoose.Types.Decimal128);
  assert.equal(order.subtotalPaisa, 400000);
});

test("product and farmer references, quantity and monetary snapshots are required and bounded", async () => {
  const missingRefs = validOrder({ productId: undefined, farmerId: undefined });
  await assert.rejects(missingRefs.validate(), (error) => {
    assert.ok(error.errors.productId);
    assert.ok(error.errors.farmerId);
    return true;
  });

  for (const quantity of [0, -1, 0.001, Infinity, 1_000_000_001]) {
    const order = validOrder({ quantity });
    await assert.rejects(order.validate(), undefined, `quantity=${quantity}`);
  }
  for (const subtotalPaisa of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const order = validOrder({ subtotalPaisa });
    await assert.rejects(order.validate(), undefined, `subtotalPaisa=${subtotalPaisa}`);
  }
  for (const price of ["0", "-2", "1000000000001", "NaN", "Infinity"]) {
    const order = validOrder({ askingPricePerUnitBdt: mongoose.Types.Decimal128.fromString(price) });
    await assert.rejects(order.validate(), undefined, `askingPricePerUnitBdt=${price}`);
  }
});

test("new orders always require phone verification and cannot start paid or inventory-reserved", async () => {
  const forged = validOrder({
    phoneVerificationStatus: "verified",
    status: "confirmed",
    paymentStatus: "succeeded",
    inventoryReserved: true,
  });
  await forged.validate();
  assert.equal(forged.phoneVerificationStatus, "pending");
  assert.equal(forged.status, "pending_phone_verification");
  assert.equal(forged.paymentStatus, "not_initiated");
  assert.equal(forged.inventoryReserved, false);

  const defaults = validOrder();
  await defaults.validate();
  assert.equal(defaults.phoneVerificationStatus, "pending");
  assert.notEqual(defaults.paymentStatus, "succeeded");
  assert.equal(defaults.inventoryReserved, false);
});

test("order reference is cryptographically generated and has a unique database index", async () => {
  const first = validOrder();
  const second = validOrder();
  await Promise.all([first.validate(), second.validate()]);
  assert.match(first.orderReference, /^KB-[A-F0-9]{24}$/);
  assert.match(second.orderReference, /^KB-[A-F0-9]{24}$/);
  assert.notEqual(first.orderReference, second.orderReference);
  assert.ok(MarketplaceOrder.schema.indexes().some(([fields, options]) => (
    fields.orderReference === 1 && options.unique === true
  )));
});

test("buyer data accepts only encrypted envelopes and is excluded from default queries and serialization", async () => {
  const order = validOrder();
  await order.validate();
  assert.equal(MarketplaceOrder.schema.path("buyer").options.select, false);
  for (const field of Object.keys(validBuyerCiphertext)) {
    assert.equal(MarketplaceOrder.schema.path(`buyer.${field}`).options.select, false);
  }
  assert.equal("buyer" in order.toJSON(), false);
  assert.equal("buyer" in order.toObject(), false);

  const plaintext = validOrder({
    buyer: { nameCiphertext: "Shahed Farmer", phoneCiphertext: "+8801712345678", deliveryAddressCiphertext: "Cumilla" },
  });
  await assert.rejects(plaintext.validate(), /buyer\.|match|validation/i);
});

test("unsupported currency, units, and state values are rejected", async () => {
  for (const overrides of [
    { currency: "USD" },
    { unitSnapshot: "bag" },
    { status: "paid" },
    { paymentStatus: "complete" },
    { phoneVerificationStatus: "approved" },
  ]) {
    const order = validOrder(overrides);
    await assert.rejects(order.validate());
  }
  assert.deepEqual(MARKETPLACE_ORDER_STATUSES, ["pending_phone_verification", "pending_payment", "confirmed", "cancelled", "completed"]);
  assert.deepEqual(MARKETPLACE_ORDER_PAYMENT_STATUSES, ["not_initiated", "pending", "succeeded", "failed", "refunded"]);
  assert.deepEqual(MARKETPLACE_ORDER_PHONE_STATUSES, ["pending", "verified"]);
});
