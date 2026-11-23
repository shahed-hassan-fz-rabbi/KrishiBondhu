/**
 * Explicit live-delivery gate for the SMS outbox.
 * Both flags must be set in the same process; defaults are always dry-run.
 * This module intentionally does not modify the shared env.config.js file.
 */
export function readSmsOutboxLiveConfig(source = process.env) {
  const smsLive = String(source.SMS_LIVE || "") === "1";
  const outboxLive = String(source.SMS_OUTBOX_LIVE_ENABLED || "") === "1";
  const schedulersDisabled = [
    "WEATHER_ALERT_SCHEDULER_ENABLED",
    "SMS_OUTBOX_SCHEDULER_ENABLED",
    "MARKET_ALERT_SCHEDULER_ENABLED",
  ].every((flag) => String(source[flag] || "") !== "1");

  const reasons = [];
  if (smsLive && !outboxLive) reasons.push("OUTBOX_LIVE_NOT_ENABLED");
  if (!smsLive && outboxLive) reasons.push("SMS_LIVE_NOT_ENABLED");
  if (!schedulersDisabled) reasons.push("SCHEDULER_ACTIVE");

  return {
    mode: smsLive && outboxLive && schedulersDisabled ? "live" : "dry_run",
    smsLive,
    outboxLive,
    schedulersDisabled,
    reasons,
  };
}
