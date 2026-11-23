import test from "node:test";
import assert from "node:assert/strict";

import {
  startWeatherAlertScheduler,
  resolveSchedulerConfig,
  toSafeCycleSummary,
  DEFAULT_INTERVAL_MS,
} from "../src/services/sms/weatherAlertScheduler.service.js";

function makeTimers() {
  let time = 0;
  let sequence = 0;
  const intervals = new Map();
  const timeouts = new Map();
  return {
    now: () => time,
    setInterval(fn, ms) {
      const id = ++sequence;
      intervals.set(id, { fn, ms });
      return { id, unref() {} };
    },
    clearInterval(handle) { intervals.delete(handle?.id ?? handle); },
    setTimeout(fn, ms) {
      const id = ++sequence;
      timeouts.set(id, { fn, ms, cancelled: false });
      return id;
    },
    clearTimeout(id) {
      const entry = timeouts.get(id);
      if (entry) entry.cancelled = true;
      timeouts.delete(id);
    },
    advance(ms) { time += ms; },
    async flush() {
      const due = [...timeouts.values()];
      timeouts.clear();
      time += 1;
      for (const entry of due) if (!entry.cancelled) entry.fn();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    },
    get intervalCount() { return intervals.size; },
    get intervalMs() { return [...intervals.values()][0]?.ms ?? null; },
    fireIntervals() { for (const entry of intervals.values()) entry.fn(); },
  };
}

function makeLogger() {
  const logs = { info: [], warn: [], error: [] };
  return {
    logs,
    info(...args) { logs.info.push(args); },
    warn(...args) { logs.warn.push(args); },
    error(...args) { logs.error.push(args); },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function settleTick(scheduler, timers, maxFlushes = 8) {
  let settled = false;
  const promise = scheduler.tick().then((value) => { settled = true; return value; });
  for (let i = 0; i < maxFlushes && !settled; i += 1) await timers.flush();
  await promise;
}

test("scheduler is disabled by default and starts only when enabled", () => {
  const timers = makeTimers();
  const logger = makeLogger();
  const disabled = startWeatherAlertScheduler({ timers, logger, runCycle: async () => ({}) });
  assert.equal(disabled.started, false);
  assert.equal(disabled.enabled, false);
  assert.equal(timers.intervalCount, 0);
  assert.match(logger.logs.info[0][0], /disabled/);

  const enabled = startWeatherAlertScheduler({ enabled: true, intervalMs: 120_000, timers, logger, runCycle: async () => ({}) });
  assert.equal(enabled.started, true);
  assert.equal(enabled.intervalMs, 120_000);
  assert.equal(timers.intervalCount, 1);
  assert.equal(timers.intervalMs, 120_000);
});

test("default interval is 60 minutes and config values are clamped", () => {
  assert.equal(DEFAULT_INTERVAL_MS, 60 * 60 * 1000);
  assert.equal(resolveSchedulerConfig({ intervalMs: 999_999_999 }).intervalMs, 24 * 60 * 60_000);
  assert.equal(resolveSchedulerConfig({ intervalMs: 0 }).intervalMs, 1);
  assert.equal(resolveSchedulerConfig({}).enabled, false);
  assert.equal(resolveSchedulerConfig({ enabled: true, dbWaitTimeoutMs: -5 }).dbWaitTimeoutMs, 0);
});

test("a cycle runs on a tick with a PII-free summary", async () => {
  const timers = makeTimers();
  const logger = makeLogger();
  const summary = {
    runId: "cycle-1", eligible: 2, evaluated: 2, queued: 2, dryRunAlerts: 2, skipped: 0,
    errors: 0, skipReasons: {}, districtsProcessed: ["cumilla"], stoppedEarly: null,
    phone: "+8801712345678",
  };
  const scheduler = startWeatherAlertScheduler({
    enabled: true, intervalMs: 1000, timers, logger,
    getDbState: () => ({ readyState: 1 }), runCycle: async () => summary,
  });
  await settleTick(scheduler, timers);

  assert.equal(logger.logs.info.length, 1);
  const logged = JSON.stringify(logger.logs.info[0]);
  assert.ok(logged.includes('"queued":2'));
  assert.ok(logged.includes('"delivered":0'));
  assert.equal(logged.includes("+8801712345678"), false);
  assert.equal(logged.includes("phone"), false);
  assert.deepEqual(toSafeCycleSummary(summary).districtsProcessed, ["cumilla"]);
});

test("scheduler waits for MongoDB readiness and skips when it never becomes ready", async () => {
  const timers = makeTimers();
  const logger = makeLogger();
  let ready = false;
  let calls = 0;
  const scheduler = startWeatherAlertScheduler({
    enabled: true, intervalMs: 1000, timers, logger,
    getDbState: () => ({ readyState: ready ? 1 : 0 }),
    dbWaitTimeoutMs: 50,
    runCycle: async () => { calls += 1; return { runId: "cycle" }; },
  });

  let settled = false;
  const first = scheduler.tick().then(() => { settled = true; });
  await timers.flush();
  ready = true;
  for (let i = 0; i < 8 && !settled; i += 1) await timers.flush();
  await first;
  assert.equal(calls, 1);

  const secondTimers = makeTimers();
  const secondLogger = makeLogger();
  const second = startWeatherAlertScheduler({
    enabled: true, intervalMs: 1000, timers: secondTimers, logger: secondLogger,
    getDbState: () => ({ readyState: 0 }), dbWaitTimeoutMs: 5,
    runCycle: async () => { throw new Error("must not run"); },
  });
  await settleTick(second, secondTimers);
  assert.equal(secondLogger.logs.warn.length, 1);
  assert.match(secondLogger.logs.warn[0][0], /MongoDB is not ready/);
});

test("overlapping ticks never start a second cycle", async () => {
  const timers = makeTimers();
  const logger = makeLogger();
  const gate = deferred();
  let calls = 0;
  const scheduler = startWeatherAlertScheduler({
    enabled: true, intervalMs: 1000, timers, logger,
    getDbState: () => ({ readyState: 1 }),
    runCycle: () => { calls += 1; return gate.promise; },
  });

  const first = scheduler.tick();
  await timers.flush();
  const second = scheduler.tick();
  await second;
  assert.equal(calls, 1, "a second tick while running must not start another cycle");

  gate.resolve({ runId: "cycle" });
  await first;
  assert.equal(calls, 1);
});

test("cycle failures are logged safely and never crash the scheduler", async () => {
  const timers = makeTimers();
  const logger = makeLogger();
  const scheduler = startWeatherAlertScheduler({
    enabled: true, intervalMs: 1000, timers, logger,
    getDbState: () => ({ readyState: 1 }),
    runCycle: async () => { throw Object.assign(new Error("connection string secret"), { code: "DB_DOWN" }); },
  });
  await settleTick(scheduler, timers);

  assert.equal(logger.logs.error.length, 1);
  const logged = JSON.stringify(logger.logs.error[0]);
  assert.ok(logged.includes("DB_DOWN"));
  assert.equal(logged.includes("secret"), false);
  assert.equal(logger.logs.info.length, 0);
});

test("shutdown clears the timer and waits for an in-flight cycle", async () => {
  const timers = makeTimers();
  const logger = makeLogger();
  const gate = deferred();
  const scheduler = startWeatherAlertScheduler({
    enabled: true, intervalMs: 1000, timers, logger,
    getDbState: () => ({ readyState: 1 }),
    runCycle: () => gate.promise,
  });
  const running = scheduler.tick();
  await timers.flush();

  let stopped = false;
  const stopping = scheduler.stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  assert.equal(timers.intervalCount, 0);

  gate.resolve({ runId: "cycle" });
  await running;
  await stopping;
  assert.equal(stopped, true);
  await scheduler.stop();
});

test("scheduler refuses to start while live SMS mode is enabled", () => {
  const timers = makeTimers();
  const logger = makeLogger();
  const scheduler = startWeatherAlertScheduler({
    enabled: true, intervalMs: 1000, timers, logger, isLive: () => true,
    runCycle: async () => ({}),
  });
  assert.equal(scheduler.started, false);
  assert.equal(scheduler.refusedReason, "LIVE_SMS_MODE");
  assert.equal(timers.intervalCount, 0);
  assert.equal(logger.logs.error.length, 1);
});
