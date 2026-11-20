import mongoose from "mongoose";

const phoneVerificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  phone: { type: String, required: true },
  codeHash: { type: String, required: true, select: false },
  codeExpiresAt: { type: Date, required: true },
  lastSentAt: { type: Date, required: true },
  dailyWindowStartedAt: { type: Date, required: true },
  dailySentCount: { type: Number, default: 1 },
  failedAttempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

phoneVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PhoneVerification = mongoose.models.PhoneVerification || mongoose.model("PhoneVerification", phoneVerificationSchema);
