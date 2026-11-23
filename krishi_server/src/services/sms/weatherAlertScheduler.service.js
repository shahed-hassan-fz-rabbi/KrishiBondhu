import { env } from "../../config/env.config.js";
import { getDatabaseState } from "../../config/database.js";
import { isSmsLiveEnabled } from "./smsSender.service.js";
import { runWeatherAlertCycle } from "./weatherAlertCycle.service.js";

/**
 * Automatic weather alert scheduler (Part 3D.2).
 *
 * Disabled by default. When explicitly enabled, it calls the existing
 * runWeatherAlertCycle() on a configurable interval. Every cycle uses the DB
 * lock, bounded batches and the dry-run sender; this module adds no delivery
 * path, queue, retry worker or HTTP trigger.
 */

export const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_DB_WAIT_TIMEOUT_MS = 30_000;
const DB_POLL_MS = 500;

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

export function resolveSchedulerConfig(options = {}) {
  // Injected values (tests) may be short; values from the environment are
  // clamped to a sane production range.
  const fromEnvironment = options.intervalMs === undefined;
  const intervalMs = clamp(
    options.intervalMs ?? env.weatherAlertIntervalMinutes * 60_000,
    fromEnvironment ? 60_000 : 1,
    24 * 60 * 60_000,
    DEFAULT_INTERVAL_MS
  );
  const dbWaitTimeoutMs = clamp(
    options.dbWaitTimeoutMs ?? env.weatherAlertDbWaitTimeoutMs,
    0,
    5 * 60_000,
    DEFAULT_DB_WAIT_TIMEOUT_MS
  );
  return {
    enabled: options.enabled !== undefined ? Boolean(options.enabled) : env.weatherAlertSchedulerEnabled === true,
    intervalMs,
    dbWaitTimeoutMs,
  };
}

/** Only aggregate counts and safe metadata — never phones, messages or credentials. */
export function toSafeCycleSummary(summary = {}) {
  return {
    runId: summary.runId || null,
    locked: Boolean(summary.locked),
    eligible: summary.eligible || 0,
    evaluated: summary.evaluated || 0,
    // Queued outbox jobs, not delivered SMS. The cycle never sends.
    queued: summary.queued ?? summary.dryRunAlerts ?? 0,
    duplicate: summary.duplicate || 0,
    failed: summary.failed || 0,
    delivered: 0,
    skipped: summary.skipped || 0,
    errors: summary.errors || 0,
    skipReasons: summary.skipReasons || {},
    districtsProcessed: summary.districtsProcessed || [],
    stoppedEarly: summary.stoppedEarly || null,
  };
}

function toSafeError(error) {
  return { name: error?.name || "Error", code: error?.code || null };
}

export function startWeatherAlertScheduler(options = {}) {
  const { enabled, intervalMs, dbWaitTimeoutMs } = resolveSchedulerConfig(options);
  const logger = options.logger || console;
  const runCycle = options.runCycle || runWeatherAlertCycle;
  const getDbState = options.getDbState || getDatabaseState;
  const isLive = options.isLive || isSmsLiveEnabled;
  const timers = options.timers || { setInterval, clearInterval, setTimeout, clearTimeout };
  // Injectable timers can also provide a virtual clock for deterministic tests.
  const clock = options.clock || (() => (typeof timers.now === "function" ? timers.now() : Date.now()));

  const inactive = { started: false, enabled, intervalMs, dbWaitTimeoutMs, stop: async () => {} };
  if (!enabled) {
    logger.info("[weather-alert-scheduler] disabled; set WEATHER_ALERT_SCHEDULER_ENABLED=1 to enable");
    return inactive;
  }
  if (isLive()) {
    logger.error("[weather-alert-scheduler] refusing to start while live SMS mode is enabled");
    return { ...inactive, refusedReason: "LIVE_SMS_MODE" };
  }

  let stopped = false;
  let running = false;
  let cyclePromise = null;
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
    cyclePromise = (async () => {
      try {
        if (!(await waitForDatabase())) {
          if (!stopped) logger.warn("[weather-alert-scheduler] skipped cycle: MongoDB is not ready");
          return;
        }
        const summary = await runCycle();
        if (!stopped) logger.info("[weather-alert-scheduler] cycle summary", toSafeCycleSummary(summary));
      } catch (error) {
        if (!stopped) logger.error("[weather-alert-scheduler] cycle failed", toSafeError(error));
      } finally {
        running = false;
      }
    })();
    return cyclePromise;
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
    if (cyclePromise) {
      try { await cyclePromise; } catch { /* cycle errors are already logged */ }
    }
  };

  return { started: true, enabled, intervalMs, dbWaitTimeoutMs, stop, tick };
}
