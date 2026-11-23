import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  startSmsOutboxScheduler,
  resolveOutboxSchedulerConfig,
  toSafeOutboxSummary,
  DEFAULT_INTERVAL_MS,
} from "../src/services/sms/smsOutboxScheduler.service.js";

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
      time += 50;
      for (const entry of due) if (!entry.cancelled) entry.fn();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    },
    get intervalCount() { return intervals.size; },
    get intervalMs() { return [...intervals.values()][0]?.ms ?? null; },
  };
}

function makeLogger() {
  const logs = { info: [], warn: [], error: [] };
  return {
    logs,
    info: (...args) => logs.info.push(args),
    warn: (...args) => logs.warn.push(args),
    error: (...args) => logs.error.push(args),
  };
}

async function settle(scheduler, timers, maxFlushes = 10) {
  let done = false;
  const promise = scheduler.tick().then((value) => { done = true; return value; });
  for (let i = 0; i < maxFlushes && !done; i += 1) await timers.flush();
  await promise;
}

test("scheduler is disabled by default and only starts when enabled", () => {
  const timers = makeTimers();
  const logger = makeLogger();
  const disabled = startSmsOutboxScheduler({ timers, logger, runBatch: async () => ({}) });
  assert.equal(disabled.started, false);
  assert.equal(disabled.enabled, false);
  assert.equal(timers.intervalCount, 0);
  assert.match(logger.logs.info[0][0], /disabled/);

  const enabled = startSmsOutboxScheduler({
    enabled: true, intervalMs: 5000, batchSize: 7, timers, logger,
    runBatch: async () => ({}), isLive: () => false,
  });
  assert.equal(enabled.started, true);
  assert.equal(enabled.batchSize, 7);
  assert.equal(timers.intervalCount, 1);
  assert.equal(timers.intervalMs, 5000);
});

test("default interval is 60 seconds and configuration is bounded", () => {
  assert.equal(DEFAULT_INTERVAL_MS, 60_000);
  const config = resolveOutboxSchedulerConfig({});
  assert.equal(config.intervalMs, DEFAULT_INTERVAL_MS);
  assert.equal(config.enabled, false);
  assert.equal(resolveOutboxSchedulerConfig({ batchSize: 999 }).batchSize, 100);
  assert.equal(resolveOutboxSchedulerConfig({ batchSize: -1 }).batchSize, 1);
  assert.equal(resolveOutboxSchedulerConfig({ intervalMs: 999_999_999 }).intervalMs, 24 * 60 * 60_000);
});

test("a tick calls the existing worker with the bounded batch size and logs safe counters", async () => {
  const timers = makeTimers();
  const logger = makeLogger();
  const calls = [];
  const scheduler = startSmsOutboxScheduler({
    enabled: true, intervalMs: 1000, batchSize: 5, timers, logger,
    isLive: () => false, getDbState: () => ({ readyState: 1 }),
    runBatch: async (options) => {
      calls.push(options);
      return {
        claimed: 1, processed: 1, dryRuns: 1, cancelled: 0, failed: 0,
        retryScheduled: 0, phone: "+8801712345678", message: "secret",
        results: [{ phoneLast4: "5678" }],
      };
    },
  });
  await settle(scheduler, timers);

  assert.deepEqual(calls, [{ limit: 5 }]);
  assert.equal(logger.logs.info.length, 1);
  const logged = JSON.stringify(logger.logs.info[0]);
  assert.ok(logged.includes('"dryRun":1'));
  assert.equal(logged.includes("secret"), false);
  assert.equal(logged.includes("+880"), false);
  assert.equal(logged.includes("results"), false);
  assert.deepEqual(toSafeOutboxSummary({ processed: 2, dryRuns: 2, claimed: 3 }), {
    processed: 2, dryRun: 2, cancelled: 0, failed: 0, retryScheduled: 0, skipped: 1,
  });
});

test("scheduler refuses startup and every tick while live SMS mode is active", async () => {
  const timers = makeTimers();
  const logger = makeLogger();
  let live = true;
  const refused = startSmsOutboxScheduler({
    enabled: true, intervalMs: 1000, timers, logger,
    isLive: () => live, runBatch: async () => ({}),
  });
  assert.equal(refused.started, false);
  assert.equal(refused.refusedReason, "LIVE_SMS_MODE");
  assert.equal(timers.intervalCount, 0);

  const timers2 = makeTimers();
  const logger2 = makeLogger();
  let calls = 0;
  live = false; // start while dry-run only
  const started = startSmsOutboxScheduler({
    enabled: true, intervalMs: 1000, timers: timers2, logger: logger2,
    isLive: () => live, getDbState: () => ({ readyState: 1 }),
    runBatch: async () => { calls += 1; return {}; },
  });
  assert.equal(started.started, true);
  live = true; // live mode activated after startup
  await settle(started, timers2);
  assert.equal(calls, 0);
  assert.ok(logger2.logs.error.some((entry) => String(entry[0]).includes("live SMS mode")));
});

test("no batch runs before MongoDB is ready", async () => {
  const timers = makeTimers();
  const logger = makeLogger();
  let ready = false;
  let calls = 0;
  const scheduler = startSmsOutboxScheduler({
    enabled: true, intervalMs: 1000, timers, logger,
    isLive: () => false, getDbState: () => ({ readyState: ready ? 1 : 0 }),
    dbWaitTimeoutMs: 2000,
    runBatch: async () => { calls += 1; return {}; },
  });

  let done = false;
  const ticking = scheduler.tick().then(() => { done = true; });
  await timers.flush();
  assert.equal(calls, 0);
  ready = true;
  for (let i = 0; i < 10 && !done; i += 1) await timers.flush();
  await ticking;
  assert.equal(calls, 1);
});

test("overlapping ticks are ignored and shutdown clears the timer", async () => {
  const timers = makeTimers();
  const logger = makeLogger();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const scheduler = startSmsOutboxScheduler({
    enabled: true, intervalMs: 1000, timers, logger,
    isLive: () => false, getDbState: () => ({ readyState: 1 }),
    runBatch: async () => { calls += 1; return gate; },
  });

  const first = scheduler.tick();
  await timers.flush();
  await scheduler.tick();
  assert.equal(calls, 1);

  let stopped = false;
  const stopping = scheduler.stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  assert.equal(timers.intervalCount, 0);

  release({ processed: 1 });
  await first;
  await stopping;
  assert.equal(stopped, true);
});

test("scheduler never calls a gateway, starts timers only through injection, or duplicates worker logic", () => {
  const source = readFileSync(new URL("../src/services/sms/smsOutboxScheduler.service.js", import.meta.url), "utf8");
  assert.match(source, /processSmsOutboxBatch/);
  assert.doesNotMatch(source, /sendSms\s*\(|registerSmsGateway|bulksmsbd|\.send\s*\(|claimNextOutboxJob|scheduleOutboxRetry/);
  assert.match(source, /batch summary/);
});
