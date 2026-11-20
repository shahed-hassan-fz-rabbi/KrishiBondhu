import mongoose from "mongoose";

const marketPriceAlertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  commodity: { type: String, trim: true, required: true, maxlength: 80 },
  market: { type: String, trim: true, maxlength: 120, default: "" },
  priceType: { type: String, enum: ["producer", "wholesale", "retail"] },
  unit: { type: String, enum: ["kg", "maund"], default: "kg" },
  targetPrice: { type: Number, min: 0.01, required: true },
  lastObservedPrice: { type: Number, min: 0.01, default: null },
  lastObservedOn: { type: String, match: /^\d{4}-\d{2}-\d{2}$/, default: null },
  lastTriggeredAt: { type: Date, default: null },
  lastTriggeredPrice: { type: Number, default: null },
}, { timestamps: true });

marketPriceAlertSchema.index({ userId: 1, createdAt: -1 });
export const MarketPriceAlert = mongoose.models.MarketPriceAlert || mongoose.model("MarketPriceAlert", marketPriceAlertSchema);
