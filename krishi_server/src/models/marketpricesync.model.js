import mongoose from "mongoose";

const marketPriceSyncSchema = new mongoose.Schema({
  sourceKey: { type: String, required: true, unique: true },
  source: { type: String, required: true },
  sourceUrl: { type: String, required: true },
  frequency: { type: String, enum: ["daily", "weekly", "monthly"], required: true },
  lastSuccessfulSyncAt: { type: Date, required: true },
  importedRecords: { type: Number, required: true, min: 0 },
  verifiedRecords: { type: Number, required: true, min: 0 },
}, { timestamps: true });

export const MarketPriceSync = mongoose.models.MarketPriceSync || mongoose.model("MarketPriceSync", marketPriceSyncSchema);
