import mongoose from "mongoose";

/** Atomic per-day SMS quota counters. Never stores phones or messages. */
const smsQuotaReservationSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    scope: { type: String, enum: ["farmer", "global"], required: true },
    userId: { type: String, default: null },
    day: { type: String, required: true, index: true },
    count: { type: Number, min: 0, default: 0 },
  },
  { collection: "smsquotareservations", timestamps: true }
);

export const SmsQuotaReservation =
  mongoose.models.SmsQuotaReservation || mongoose.model("SmsQuotaReservation", smsQuotaReservationSchema);
