import { env } from "../../config/env.config.js";
import { getDatabaseState } from "../../config/database.js";
import { isSmsLiveEnabled } from "./smsSender.service.js";
import { processSmsOutboxBatch, assertDryRunOnly } from "./smsOutboxWorker.service.js";

/**
 * Automatic DRY-RUN outbox scheduler (Part 3D.4E).
 *
 * Disabled by default. When explicitly enabled it periodically invokes the
 * existing processSmsOutboxBatch() — no worker logic is duplicated here.
 * It never creates a delivery path: live mode is refused at startup AND on
 * every tick. The outbox's atomic claim and nextAttemptAt gate remain in the
 * worker, so multiple server instances are safe.
 */

export const DEFAULT_INTERVAL_MS = 60 * 1000;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_DB_WAIT_TIMEOUT_MS = 30_000;
const DB_POLL_MS = 500;

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

export function resolveOutboxSchedulerConfig(options = {}) {
  const fromEnvironment = options.intervalMs === undefined;
  return {
    enabled: options.enabled !== undefined
      ? Boolean(options.enabled)
      : env.smsOutboxSchedulerEnabled === true,
    intervalMs: clamp(
      options.intervalMs ?? env.smsOutboxIntervalSeconds * 1000,
      fromEnvironment ? 1000 : 1,
      24 * 60 * 60_000,
      DEFAULT_INTERVAL_MS
    ),
    batchSize: clamp(
      options.batchSize ?? env.smsOutboxBatchSize,
      1,
      100,
      DEFAULT_BATCH_SIZE
    ),
    dbWaitTimeoutMs: clamp(
      options.dbWaitTimeoutMs ?? env.smsOutboxDbWaitTimeoutMs,
      0,
      5 * 60_000,
      DEFAULT_DB_WAIT_TIMEOUT_MS
    ),
  };
}

/** Only the documented counters — never message text, phones or credentials. */
export function toSafeOutboxSummary(summary = {}) {
  const processed = Number(summary.processed) || 0;
  const dryRun = Number(summary.dryRuns ?? summary.dryRun) || 0;
  const cancelled = Number(summary.cancelled) || 0;
  const failed = Number(summary.failed) || 0;
  const retryScheduled = Number(summary.retryScheduled) || 0;
  const claimed = Number(summary.claimed) || 0;
  const skipped = Number.isFinite(summary.skipped)
    ? Number(summary.skipped)
    : Math.max(0, claimed - processed - cancelled - failed - retryScheduled);
  return { processed, dryRun, cancelled, failed, retryScheduled, skipped };
}

function toSafeError(error) {
  return { name: error?.name || "Error", code: error?.code || null };
}

export function startSmsOutboxScheduler(options = {}) {
  const { enabled, intervalMs, batchSize, dbWaitTimeoutMs } = resolveOutboxSchedulerConfig(options);
  const logger = options.logger || console;
  const runBatch = options.runBatch || processSmsOutboxBatch;
  const getDbState = options.getDbState || getDatabaseState;
  const isLive = options.isLive || isSmsLiveEnabled;
  const dryRunGuard = options.dryRunGuard || assertDryRunOnly;
  const timers = options.timers || { setInterval, clearInterval, setTimeout, clearTimeout };
  const clock = options.clock || (() => (typeof timers.now === "function" ? timers.now() : Date.now()));

  const inactive = {
    started: false, enabled, intervalMs, batchSize, dbWaitTimeoutMs, stop: async () => {},
  };
  if (!enabled) {
    logger.info("[sms-outbox-scheduler] disabled; set SMS_OUTBOX_SCHEDULER_ENABLED=1 to enable");
    return inactive;
  }
  if (!dryRunGuard({ envConfig: options.envConfig, liveEnabled: isLive() }).ok) {
    logger.error("[sms-outbox-scheduler] refusing to start while live SMS mode is enabled");
    return { ...inactive, refusedReason: "LIVE_SMS_MODE" };
  }

  let stopped = false;
  let running = false;
  let batchPromise = null;
  let pendingTimeout = null;
  let resolveDelay = null;

  const delay = (ms) => new Promise((resolve) => {
    if (stopped) { resolve(); return; }
    const done = () => {
      pendingTimeout = null;
      resolveDelay = null;
      resolve();
    };
    resolveDelay = done;
    pendingTimeout = timers.setTimeout(done, Math.max(0, ms));
  });

  async function waitForDatabase() {
    const startedAt = clock();
    while (!stopped) {
      let state = null;
      try { state = getDbState(); } catch { state = null; }
      if (state?.readyState === 1) return true;
      const elapsed = clock() - startedAt;
      if (elapsed >= dbWaitTimeoutMs) return false;
      await delay(Math.min(DB_POLL_MS, Math.max(1, dbWaitTimeoutMs - elapsed)));
    }
    return false;
  }

  function tick() {
    if (stopped || running) return Promise.resolve();
    running = true;
    batchPromise = (async () => {
      try {
        // Re-check on every tick: live mode may be activated after startup.
        if (!dryRunGuard({ envConfig: options.envConfig, liveEnabled: isLive() }).ok) {
          if (!stopped) logger.error("[sms-outbox-scheduler] skipped tick: live SMS mode is enabled");
          return;
        }
        if (!(await waitForDatabase())) {
          if (!stopped) logger.warn("[sms-outbox-scheduler] skipped tick: MongoDB is not ready");
          return;
        }
        const summary = await runBatch({ limit: batchSize });
        if (!stopped) logger.info("[sms-outbox-scheduler] batch summary", toSafeOutboxSummary(summary));
      } catch (error) {
        if (!stopped) logger.error("[sms-outbox-scheduler] batch failed", toSafeError(error));
      } finally {
        running = false;
      }
    })();
    return batchPromise;
  }

  const timer = timers.setInterval(() => { void tick(); }, intervalMs);
  if (typeof timer?.unref === "function") timer.unref();

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    timers.clearInterval(timer);
    if (pendingTimeout) {
      timers.clearTimeout(pendingTimeout);
      resolveDelay?.();
    }
    if (batchPromise) {
      try { await batchPromise; } catch { /* already logged */ }
    }
  };

  return { started: true, enabled, intervalMs, batchSize, dbWaitTimeoutMs, stop, tick };
}
