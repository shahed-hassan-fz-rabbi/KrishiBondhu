import mongoose from "mongoose";

export const MARKETPLACE_ORDER_REQUEST_STATUSES = Object.freeze(["confirmed", "cancelled"]);

const MAX_SAFE_PAISA = Number.MAX_SAFE_INTEGER;

/**
 * A "Buy now" intent record. Deliberately lightweight: it stores who placed the
 * request and a trusted price snapshot, but NO buyer PII. The farmer's public
 * contact (name/phone) is derived from the User collection when serving the
 * buyer's own orders. No payment is taken; this is not a payment instrument.
 */
const marketplaceOrderRequestSchema = new mongoose.Schema({
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "MarketplaceProduct", required: true, index: true },
  productNameSnapshot: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  unitSnapshot: { type: String, enum: ["kg", "quintal", "ton"], required: true },
  quantity: { type: Number, required: true, min: 0.01, max: 1_000_000_000 },
  askingPricePerUnitBdt: { type: Number, required: true, min: 0.01 },
  subtotalPaisa: {
    type: Number,
    required: true,
    min: 1,
    max: MAX_SAFE_PAISA,
    validate: { validator: Number.isSafeInteger, message: "Subtotal must be an integer number of paisa." },
  },
  currency: { type: String, enum: ["BDT"], default: "BDT", required: true, immutable: true },
  status: {
    type: String,
    enum: MARKETPLACE_ORDER_REQUEST_STATUSES,
    default: "confirmed",
    required: true,
  },
  note: { type: String, trim: true, maxlength: 500, default: "" },
}, { timestamps: true });

marketplaceOrderRequestSchema.index({ buyerId: 1, createdAt: -1 });

export const MarketplaceOrderRequest = mongoose.models.MarketplaceOrderRequest
  || mongoose.model("MarketplaceOrderRequest", marketplaceOrderRequestSchema);
