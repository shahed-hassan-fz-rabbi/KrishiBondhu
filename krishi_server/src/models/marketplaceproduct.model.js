import mongoose from "mongoose";

const marketplaceProductSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  productName: { type: String, trim: true, required: true, minlength: 2, maxlength: 100 },
  productImageDataUrl: { type: String, default: "", maxlength: 140_000 },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  quantity: { type: Number, required: true, min: 0.01 },
  unit: { type: String, enum: ["kg", "quintal", "ton"], required: true },
  askingPricePerUnit: { type: Number, required: true, min: 0.01 },
  district: { type: String, trim: true, required: true, minlength: 2, maxlength: 80 },
  upazila: { type: String, trim: true, required: true, minlength: 2, maxlength: 80 },
  status: { type: String, enum: ["active", "sold_out", "archived"], default: "active", required: true, index: true },
  // Moderation state. A new listing is never public until an admin approves it.
  approvalStatus: {
    type: String,
    enum: ["pending_review", "approved", "rejected"],
    default: "pending_review",
    required: true,
    index: true,
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true, maxlength: 500, default: "" },
}, { timestamps: true });

marketplaceProductSchema.index({ status: 1, createdAt: -1 });
marketplaceProductSchema.index({ approvalStatus: 1, status: 1, createdAt: -1 });

export const MarketplaceProduct = mongoose.models.MarketplaceProduct
  || mongoose.model("MarketplaceProduct", marketplaceProductSchema);
