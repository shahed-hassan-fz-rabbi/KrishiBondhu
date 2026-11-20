import mongoose from "mongoose";

const savedAdvisorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, trim: true, required: true, maxlength: 180 },
  body: { type: String, trim: true, required: true, maxlength: 5000 },
  category: { type: String, enum: ["crop_planning", "rotation", "assistant"], default: "crop_planning" },
  cropCode: { type: String, trim: true, maxlength: 60, default: "" },
  cropName: { type: String, trim: true, maxlength: 120, default: "" },
  districtCode: { type: String, enum: ["cumilla", "chattogram", ""], default: "" },
  upazila: { type: String, trim: true, maxlength: 100, default: "" },
  sourceHref: { type: String, enum: ["/my-farm/plan", "/rotation-planner", "/assistant"], default: "/my-farm/plan" },
}, { timestamps: true });

savedAdvisorySchema.index({ userId: 1, createdAt: -1 });
export const SavedAdvisory = mongoose.models.SavedAdvisory || mongoose.model("SavedAdvisory", savedAdvisorySchema);
