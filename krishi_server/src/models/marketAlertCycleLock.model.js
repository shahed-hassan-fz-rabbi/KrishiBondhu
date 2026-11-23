import mongoose from "mongoose";

export const MARKET_CYCLE_LOCK_ID = "market-alert-cycle";

const marketAlertCycleLockSchema = new mongoose.Schema(
  {
    _id: { type: String, default: MARKET_CYCLE_LOCK_ID },
    status: { type: String, enum: ["idle", "running"], default: "idle" },
    runId: { type: String, default: null },
    startedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { collection: "marketalertcyclelocks", timestamps: true }
);

export const MarketAlertCycleLock =
  mongoose.models.MarketAlertCycleLock || mongoose.model("MarketAlertCycleLock", marketAlertCycleLockSchema);
