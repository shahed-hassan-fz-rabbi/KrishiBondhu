import mongoose from "mongoose";
import { normalizeMarketGrade } from "../config/marketAlert.config.js";

const marketPriceObservationSchema = new mongoose.Schema({
  commodity: { type: String, trim: true, required: true, maxlength: 80, index: true },
  commodityKey: { type: String, trim: true, lowercase: true, required: true, maxlength: 80 },
  division: { type: String, trim: true, required: true, maxlength: 40, index: true },
  district: { type: String, trim: true, maxlength: 60, default: "" },
  upazila: { type: String, trim: true, maxlength: 60, default: "" },
  market: { type: String, trim: true, maxlength: 120, default: "" },
  frequency: { type: String, enum: ["daily", "weekly", "monthly"], default: "daily", index: true },
  priceType: { type: String, enum: ["producer", "wholesale", "retail"], required: true, index: true },
  unit: { type: String, trim: true, required: true, maxlength: 24 },
  /** Optional product grade. Normalised on write; null means UNKNOWN. */
  grade: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 40,
    default: null,
    set: normalizeMarketGrade,
    index: true,
  },
  priceMin: { type: Number, min: 0.01, required: true },
  priceMax: { type: Number, min: 0.01, required: true },
  observedOn: { type: Date, required: true, index: true },
  source: { type: String, trim: true, required: true, maxlength: 160 },
  sourceUrl: { type: String, trim: true, required: true, maxlength: 500 },
  licence: { type: String, trim: true, default: "" },
  qualityStatus: { type: String, enum: ["verified", "review"], default: "review", index: true },
}, { timestamps: true });

marketPriceObservationSchema.index({ commodityKey: 1, division: 1, district: 1, upazila: 1, market: 1, frequency: 1, priceType: 1, unit: 1, observedOn: 1 });
// Grade is part of the unique identity so distinct grades of the same crop,
// market, source and date can coexist without blocking each other.
marketPriceObservationSchema.index(
  { commodityKey: 1, division: 1, district: 1, upazila: 1, market: 1, frequency: 1, priceType: 1, unit: 1, observedOn: 1, source: 1, grade: 1 },
  { unique: true, name: "market_observation_location_frequency_source_grade_unique" }
);

export const MarketPriceObservation = mongoose.models.MarketPriceObservation || mongoose.model("MarketPriceObservation", marketPriceObservationSchema);
