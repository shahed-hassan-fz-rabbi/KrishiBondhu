import mongoose from "mongoose";

const cropPlanSchema = new mongoose.Schema({
  cropCode: { type: String, required: true, maxlength: 60 },
  cropName: { type: String, required: true, maxlength: 120 },
  suitabilityCategory: { type: String, enum: ["supported", "potential", "insufficient_info"], required: true },
  sowingPeriod: { type: String, maxlength: 120, default: "" },
  totalDurationDays: { type: Number, min: 0, max: 500, default: null },
  waterRequirementMmTotal: { type: Number, min: 0, max: 10000, default: null },
  reasons: { type: [String], default: [] },
  constraints: { type: [String], default: [] },
}, { _id: false });

const officerReviewSchema = new mongoose.Schema({
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  farmId: { type: mongoose.Schema.Types.ObjectId, ref: "Farm", default: null, index: true },
  districtCode: { type: String, enum: ["cumilla", "chattogram"], required: true, index: true },
  upazila: { type: String, required: true, maxlength: 100 },
  farmerQuestion: { type: String, required: true, maxlength: 1000 },
  cropPlan: { type: cropPlanSchema, required: true },
  status: { type: String, enum: ["PENDING", "REVIEWED"], default: "PENDING", index: true },
  officerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  officerResponse: { type: String, maxlength: 2000, default: "" },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

officerReviewSchema.index({ districtCode: 1, status: 1, createdAt: 1 });
officerReviewSchema.index({ farmerId: 1, createdAt: -1 });
export const OfficerReview = mongoose.models.OfficerReview || mongoose.model("OfficerReview", officerReviewSchema);
