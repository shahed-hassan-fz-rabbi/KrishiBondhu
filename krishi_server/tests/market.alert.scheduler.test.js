import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  startMarketAlertScheduler,
  resolveMarketSchedulerConfig,
  toSafeMarketSummary,
  DEFAULT_INTERVAL_MS,
} from "../src/services/sms/marketAlertScheduler.service.js";

function timers() {
  return { setInterval() { return { unref() {} }; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {} };
}
function logger() {
  const logs = { info: [], warn: [], error: [] };
  return { logs, info: (...a) => logs.info.push(a), warn: (...a) => logs.warn.push(a), error: (...a) => logs.error.push(a) };
}

test("market scheduler is disabled by default and config is bounded", () => {
  assert.equal(DEFAULT_INTERVAL_MS, 30 * 60_000);
  assert.equal(resolveMarketSchedulerConfig({}).enabled, false);
  assert.equal(resolveMarketSchedulerConfig({}).intervalMs, DEFAULT_INTERVAL_MS);
  assert.equal(resolveMarketSchedulerConfig({ intervalMs: -1 }).intervalMs, 1);
  assert.equal(resolveMarketSchedulerConfig({ intervalMs: 9e12 }).intervalMs, 24 * 60 * 60_000);
});

test("startup refuses live mode; safe summary contains only counters", () => {
  const log = logger();
  const refused = startMarketAlertScheduler({
    enabled: true, isLive: () => true, timers: timers(), logger: log, runCycle: async () => ({}),
  });
  assert.equal(refused.started, false);
  assert.equal(refused.refusedReason, "LIVE_SMS_MODE");

  const summary = toSafeMarketSummary({
    eligible: 2, evaluated: 2, queued: 2, duplicate: 1, skipped: 3, failed: 0, errors: 0,
    phone: "+8801712345678", text: "secret", results: [{}],
  });
  const json = JSON.stringify(summary);
  assert.equal(json.includes("+880"), false);
  assert.equal(json.includes("secret"), false);
  assert.equal(json.includes("results"), false);
});

test("market scheduler never calls a gateway or fetches prices itself", () => {
  const source = readFileSync(new URL("../src/services/sms/marketAlertScheduler.service.js", import.meta.url), "utf8");
  assert.match(source, /runMarketAlertCycle/);
  assert.doesNotMatch(source, /sendSms\s*\(\s*\{|registerSmsGateway|bulksmsbd|fetch\s*\(/);
});
