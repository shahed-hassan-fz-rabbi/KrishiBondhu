import mongoose from "mongoose";

const cropPlanSchema = new mongoose.Schema({
  cropCode: { type: String, maxlength: 60, default: "general" },
  cropName: { type: String, maxlength: 120, default: "General Agriculture" },
  suitabilityCategory: { type: String, enum: ["supported", "potential", "insufficient_info"], default: "supported" },
  sowingPeriod: { type: String, maxlength: 120, default: "" },
  totalDurationDays: { type: Number, min: 0, max: 500, default: null },
  waterRequirementMmTotal: { type: Number, min: 0, max: 10000, default: null },
  reasons: { type: [String], default: [] },
  constraints: { type: [String], default: [] },
}, { _id: false });

const checklistItemSchema = new mongoose.Schema({
  id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  task: { type: String, required: true, maxlength: 300 },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
}, { _id: false });

const officerReviewSchema = new mongoose.Schema({
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  farmId: { type: mongoose.Schema.Types.ObjectId, ref: "Farm", default: null, index: true },
  districtCode: { type: String, enum: ["cumilla", "chattogram"], required: true, index: true },
  upazila: { type: String, required: true, maxlength: 100 },
  category: {
    type: String,
    enum: ["crop_planning", "crop_disease", "soil_fertilizer", "irrigation", "market_advice"],
    default: "crop_planning",
    index: true,
  },
  title: { type: String, maxlength: 200, default: "" },
  farmerQuestion: { type: String, required: true, maxlength: 1500 },
  farmerNotes: { type: String, maxlength: 3000, default: "" },
  cropPlan: {
    type: cropPlanSchema,
    default: () => ({ cropCode: "general", cropName: "General Agriculture", suitabilityCategory: "supported" }),
  },
  checklist: { type: [checklistItemSchema], default: [] },
  status: {
    type: String,
    enum: ["PENDING", "IN_PROGRESS", "REVIEWED", "RESOLVED"],
    default: "PENDING",
    index: true,
  },
  priority: {
    type: String,
    enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
    default: "MEDIUM",
  },
  officerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  officerResponse: { type: String, maxlength: 3000, default: "" },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

officerReviewSchema.index({ districtCode: 1, status: 1, createdAt: 1 });
officerReviewSchema.index({ farmerId: 1, createdAt: -1 });
officerReviewSchema.index({ farmerId: 1, category: 1, status: 1 });
export const OfficerReview = mongoose.models.OfficerReview || mongoose.model("OfficerReview", officerReviewSchema);
