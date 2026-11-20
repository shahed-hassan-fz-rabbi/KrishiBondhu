import { User } from "../models/user.model.js";
import { FarmNotificationService } from "./farmnotification.service.js";

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Reconcile opted-in users' task reminders without requiring a page visit. */
export function startFarmSmsScheduler() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const users = await User.find({ smsAlertsEnabled: true, phone: { $exists: true, $ne: "" } }).select("_id").lean();
      for (const user of users) {
        try { await FarmNotificationService.syncUserNotifications(user._id); }
        catch (error) { console.warn("[sms] reminder reconciliation failed", error.name || "error"); }
      }
    } catch (error) {
      console.warn("[sms] reminder scheduler could not read opted-in accounts", error.name || "error");
    } finally { running = false; }
  };
  void run();
  const timer = setInterval(run, SIX_HOURS);
  timer.unref();
  return () => clearInterval(timer);
}
