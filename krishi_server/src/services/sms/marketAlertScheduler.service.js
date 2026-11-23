import { env } from "../../config/env.config.js";
import { getDatabaseState } from "../../config/database.js";
import { isSmsLiveEnabled } from "./smsSender.service.js";
import { runMarketAlertCycle } from "./marketAlertCycle.service.js";

/** Opt-in market alert scheduler (DRY-RUN only). No price fetching here. */

export const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_DB_WAIT_TIMEOUT_MS = 30_000;
const DB_POLL_MS = 500;

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

export function resolveMarketSchedulerConfig(options = {}) {
  const fromEnvironment = options.intervalMs === undefined;
  return {
    enabled: options.enabled !== undefined ? Boolean(options.enabled) : env.marketAlertSchedulerEnabled === true,
    intervalMs: clamp(
      options.intervalMs ?? env.marketAlertIntervalMinutes * 60_000,
      fromEnvironment ? 60_000 : 1,
      24 * 60 * 60_000,
      DEFAULT_INTERVAL_MS
    ),
    dbWaitTimeoutMs: clamp(
      options.dbWaitTimeoutMs ?? env.marketAlertDbWaitTimeoutMs,
      0,
      5 * 60_000,
      DEFAULT_DB_WAIT_TIMEOUT_MS
    ),
  };
}

/** Safe counters only — no prices, phones, messages or credentials. */
export function toSafeMarketSummary(summary = {}) {
  return {
    eligible: Number(summary.eligible) || 0,
    evaluated: Number(summary.evaluated) || 0,
    queued: Number(summary.queued) || 0,
    duplicate: Number(summary.duplicate) || 0,
    skipped: Number(summary.skipped) || 0,
    failed: Number(summary.failed) || 0,
    errors: Number(summary.errors) || 0,
    skipReasons: summary.skipReasons || {},
    stoppedEarly: summary.stoppedEarly || null,
  };
}

export function startMarketAlertScheduler(options = {}) {
  const { enabled, intervalMs, dbWaitTimeoutMs } = resolveMarketSchedulerConfig(options);
  const logger = options.logger || console;
  const runCycle = options.runCycle || runMarketAlertCycle;
  const getDbState = options.getDbState || getDatabaseState;
  const isLive = options.isLive || isSmsLiveEnabled;
  const timers = options.timers || { setInterval, clearInterval, setTimeout, clearTimeout };
  const clock = options.clock || (() => (typeof timers.now === "function" ? timers.now() : Date.now()));

  const inactive = { started: false, enabled, intervalMs, dbWaitTimeoutMs, stop: async () => {} };
  if (!enabled) {
    logger.info("[market-alert-scheduler] disabled; set MARKET_ALERT_SCHEDULER_ENABLED=1 to enable");
    return inactive;
  }
  if (isLive()) {
    logger.error("[market-alert-scheduler] refusing to start while live SMS mode is enabled");
    return { ...inactive, refusedReason: "LIVE_SMS_MODE" };
  }

  let stopped = false;
  let running = false;
  let cyclePromise = null;
  let pendingTimeout = null;
  let resolveDelay = null;

  const delay = (ms) => new Promise((resolve) => {
    if (stopped) { resolve(); return; }
    const done = () => { pendingTimeout = null; resolveDelay = null; resolve(); };
    resolveDelay = done;
    pendingTimeout = timers.setTimeout(done, Math.max(0, ms));
  });

  async function waitForDatabase() {
    const start = clock();
    while (!stopped) {
      let state = null;
      try { state = getDbState(); } catch { state = null; }
      if (state?.readyState === 1) return true;
      const elapsed = clock() - start;
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
        if (isLive()) {
          if (!stopped) logger.error("[market-alert-scheduler] skipped tick: live SMS mode is enabled");
          return;
        }
        if (!(await waitForDatabase())) {
          if (!stopped) logger.warn("[market-alert-scheduler] skipped tick: MongoDB is not ready");
          return;
        }
        const summary = await runCycle();
        if (!stopped) logger.info("[market-alert-scheduler] cycle summary", toSafeMarketSummary(summary));
      } catch (error) {
        if (!stopped) logger.error("[market-alert-scheduler] cycle failed", { name: error?.name || "Error", code: error?.code || null });
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
    if (pendingTimeout) { timers.clearTimeout(pendingTimeout); resolveDelay?.(); }
    if (cyclePromise) { try { await cyclePromise; } catch { /* already logged */ } }
  };

  return { started: true, enabled, intervalMs, dbWaitTimeoutMs, stop, tick };
}
