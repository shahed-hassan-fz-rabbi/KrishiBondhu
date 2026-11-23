import mongoose from "mongoose";

/** Single-document coordination lock for one-cycle weather alert runners. */
export const WEATHER_CYCLE_LOCK_ID = "weather-alert-cycle";

const weatherAlertCycleLockSchema = new mongoose.Schema(
  {
    _id: { type: String, default: WEATHER_CYCLE_LOCK_ID },
    status: { type: String, enum: ["idle", "running"], default: "idle" },
    runId: { type: String, default: null },
    startedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { collection: "weatheralertcyclelocks", timestamps: true }
);

export const WeatherAlertCycleLock =
  mongoose.models.WeatherAlertCycleLock || mongoose.model("WeatherAlertCycleLock", weatherAlertCycleLockSchema);
