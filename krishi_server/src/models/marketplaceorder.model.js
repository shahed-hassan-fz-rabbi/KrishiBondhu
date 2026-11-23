import { randomBytes } from "node:crypto";
import mongoose from "mongoose";

export const MARKETPLACE_ORDER_STATUSES = Object.freeze([
  "pending_phone_verification",
  "pending_payment",
  "confirmed",
  "cancelled",
  "completed",
]);

export const MARKETPLACE_ORDER_PAYMENT_STATUSES = Object.freeze([
  "not_initiated",
  "pending",
  "succeeded",
  "failed",
  "refunded",
]);

export const MARKETPLACE_ORDER_PHONE_STATUSES = Object.freeze(["pending", "verified"]);

const MAX_SAFE_PAISA = Number.MAX_SAFE_INTEGER;
const MAX_QUANTITY = 1_000_000_000;
const MAX_UNIT_PRICE_BDT = 1_000_000_000_000;
// AES-GCM v1 envelope shape used by the existing authenticated encryption pattern:
// 12-byte IV, 16-byte tag, and a non-empty ciphertext, all base64 encoded.
const ENCRYPTED_PII_ENVELOPE = /^enc:v1:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]+={0,2}$/;

function newOrderReference() {
  return `KB-${randomBytes(12).toString("hex").toUpperCase()}`;
}

function isPositiveDecimal128(value) {
  if (!(value instanceof mongoose.Types.Decimal128)) return false;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_UNIT_PRICE_BDT;
}

const encryptedBuyerSchema = new mongoose.Schema({
  nameCiphertext: {
    type: String,
    required: true,
    select: false,
    maxlength: 4096,
    match: ENCRYPTED_PII_ENVELOPE,
  },
  phoneCiphertext: {
    type: String,
    required: true,
    select: false,
    maxlength: 4096,
    match: ENCRYPTED_PII_ENVELOPE,
  },
  deliveryAddressCiphertext: {
    type: String,
    required: true,
    select: false,
    maxlength: 8192,
    match: ENCRYPTED_PII_ENVELOPE,
  },
}, { _id: false, id: false, strict: "throw" });

const marketplaceOrderSchema = new mongoose.Schema({
  orderReference: {
    type: String,
    required: true,
    default: newOrderReference,
    immutable: true,
    match: /^KB-[A-F0-9]{24}$/,
    maxlength: 27,
  },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "MarketplaceProduct", required: true },
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  productNameSnapshot: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  unitSnapshot: { type: String, enum: ["kg", "quintal", "ton"], required: true },
  quantity: {
    type: Number,
    required: true,
    min: 0.01,
    max: MAX_QUANTITY,
    validate: { validator: Number.isFinite, message: "Quantity must be finite." },
  },
  // Keep the trusted listing price as Decimal128 BDT. Subtotal is integer paisa
  // rounded once at the total, half up, matching checkout preview's rule.
  askingPricePerUnitBdt: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    validate: { validator: isPositiveDecimal128, message: "Unit price must be a positive supported BDT decimal." },
  },
  subtotalPaisa: {
    type: Number,
    required: true,
    min: 1,
    max: MAX_SAFE_PAISA,
    validate: { validator: Number.isSafeInteger, message: "Subtotal must be a safe integer number of paisa." },
  },
  currency: { type: String, enum: ["BDT"], default: "BDT", required: true, immutable: true },
  buyer: { type: encryptedBuyerSchema, required: true, select: false },
  phoneVerificationStatus: {
    type: String,
    enum: MARKETPLACE_ORDER_PHONE_STATUSES,
    default: "pending",
    required: true,
  },
  status: {
    type: String,
    enum: MARKETPLACE_ORDER_STATUSES,
    default: "pending_phone_verification",
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: MARKETPLACE_ORDER_PAYMENT_STATUSES,
    default: "not_initiated",
    required: true,
  },
  inventoryReserved: { type: Boolean, default: false, required: true },
}, {
  timestamps: true,
  strict: "throw",
  toJSON: {
    transform(_doc, ret) {
      delete ret.buyer;
      delete ret.__v;
      return ret;
    },
  },
  toObject: {
    transform(_doc, ret) {
      delete ret.buyer;
      delete ret.__v;
      return ret;
    },
  },
});

marketplaceOrderSchema.index({ orderReference: 1 }, { unique: true, name: "marketplace_order_reference_unique" });

// New orders always enter the system in the safe initial state, even if a
// caller tries to set verification, payment, or reservation fields at create.
marketplaceOrderSchema.pre("validate", function enforceInitialOrderState() {
  if (!this.isNew) return;
  this.orderReference = newOrderReference();
  if (MARKETPLACE_ORDER_PHONE_STATUSES.includes(this.phoneVerificationStatus)) {
    this.phoneVerificationStatus = "pending";
  }
  if (MARKETPLACE_ORDER_STATUSES.includes(this.status)) {
    this.status = "pending_phone_verification";
  }
  if (MARKETPLACE_ORDER_PAYMENT_STATUSES.includes(this.paymentStatus)) {
    this.paymentStatus = "not_initiated";
  }
  this.inventoryReserved = false;
});

export const MarketplaceOrder = mongoose.models.MarketplaceOrder
  || mongoose.model("MarketplaceOrder", marketplaceOrderSchema);
