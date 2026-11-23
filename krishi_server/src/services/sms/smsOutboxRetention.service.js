import { SmsOutbox } from "../../models/smsOutbox.model.js";
import { SmsNotificationLog } from "../../models/smsNotificationLog.model.js";

/** Retention for terminal outbox jobs and dry-run logs. Pending/processing are never expired. */

export const TERMINAL_OUTBOX_STATUSES = Object.freeze(["dry_run", "submitted", "failed", "cancelled"]);
export const DEFAULT_RETENTION_DAYS = 30;

export async function applySmsRetention({
  model = SmsOutbox,
  logModel = SmsNotificationLog,
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS,
  apply = false,
} = {}) {
  const days = Math.max(1, Math.min(3650, Number(retentionDays) || DEFAULT_RETENTION_DAYS));
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const jobFilter = { status: { $in: [...TERMINAL_OUTBOX_STATUSES] }, createdAt: { $lt: cutoff } };
  const logFilter = { createdAt: { $lt: cutoff }, status: { $in: ["dry_run", "submitted", "sent", "failed", "skipped", "cancelled"] } };

  const report = {
    cutoff: cutoff.toISOString(),
    retentionDays: days,
    applied: apply,
    jobsEligible: 0,
    logsEligible: 0,
    jobsDeleted: 0,
    logsDeleted: 0,
  };
  if (model?.countDocuments) report.jobsEligible = await model.countDocuments(jobFilter);
  if (logModel?.countDocuments) report.logsEligible = await logModel.countDocuments(logFilter);
  if (!apply) return report;

  if (model?.deleteMany) report.jobsDeleted = (await model.deleteMany(jobFilter)).deletedCount || 0;
  if (logModel?.deleteMany) report.logsDeleted = (await logModel.deleteMany(logFilter)).deletedCount || 0;
  return report;
}
