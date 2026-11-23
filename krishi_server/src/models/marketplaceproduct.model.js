import mongoose from "mongoose";

const marketplaceProductSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  productName: { type: String, trim: true, required: true, minlength: 2, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  quantity: { type: Number, required: true, min: 0.01 },
  unit: { type: String, enum: ["kg", "quintal", "ton"], required: true },
  askingPricePerUnit: { type: Number, required: true, min: 0.01 },
  district: { type: String, trim: true, required: true, minlength: 2, maxlength: 80 },
  upazila: { type: String, trim: true, required: true, minlength: 2, maxlength: 80 },
  status: { type: String, enum: ["active", "sold_out"], default: "active", required: true, index: true },
}, { timestamps: true });

marketplaceProductSchema.index({ status: 1, createdAt: -1 });

export const MarketplaceProduct = mongoose.models.MarketplaceProduct
  || mongoose.model("MarketplaceProduct", marketplaceProductSchema);
