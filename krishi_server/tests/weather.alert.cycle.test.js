import test from "node:test";
import assert from "node:assert/strict";

import { runWeatherAlertCycle } from "../src/services/sms/weatherAlertCycle.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";
import { WEATHER_SOURCE } from "../src/services/sms/weatherAlertEngine.js";

const NOW = new Date("2026-11-23T10:00:00.000Z");

function queryOf(resultFn) {
  return {
    conditions: null,
    limitValue: null,
    sort() { return this; },
    limit(value) { this.limitValue = value; return this; },
    lean() { return Promise.resolve(resultFn(this.conditions, this.limitValue)); },
    then(resolve, reject) { return Promise.resolve(resultFn(this.conditions, this.limitValue)).then(resolve, reject); },
  };
}

function valueAt(object, path) {
  return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function matches(conditions, record) {
  for (const [key, expected] of Object.entries(conditions)) {
    const actual = valueAt(record, key);
    if (expected && typeof expected === "object" && "$ne" in expected) {
      if (actual === expected.$ne) return false;
    } else if (expected && typeof expected === "object" && "$in" in expected) {
      if (!expected.$in.some((id) => String(id) === String(actual))) return false;
    } else if (expected && typeof expected === "object" && "$gt" in expected) {
      if (!(String(actual) > String(expected.$gt))) return false;
    } else if (String(actual) !== String(expected)) {
      return false;
    }
  }
  return true;
}

function preferencesModel(records) {
  return {
    find(conditions) {
      return queryOf((_ignored, limit) => {
        let rows = records.filter((record) => matches(conditions, record));
        rows.sort((a, b) => String(a._id).localeCompare(String(b._id)));
        if (conditions._id?.$gt) rows = rows.filter((row) => String(row._id) > String(conditions._id.$gt));
        return limit ? rows.slice(0, limit) : rows;
      });
    },
  };
}

function userModel(records) {
  return {
    find(conditions) {
      return queryOf(() => records.filter((record) => matches(conditions, record)));
    },
  };
}

function memoryLogger() {
  const entries = [];
  return {
    entries,
    async create(entry) { entries.push({ ...entry }); return entry; },
    async findRecent({ dedupeKey, userId }) {
      return [...entries].reverse().find((entry) =>
        entry.dedupeKey === dedupeKey && String(entry.userId) === String(userId) && entry.status !== "skipped"
      ) || null;
    },
  };
}

function fakeLock({ held = false, failRelease = false } = {}) {
  const state = { held, acquired: 0, released: 0 };
  return {
    state,
    async acquire() {
      if (state.held) return false;
      state.held = true;
      state.acquired += 1;
      return true;
    },
    async release() {
      state.released += 1;
      if (failRelease) throw new Error("release failed");
      state.held = false;
    },
  };
}

function farmer({ id, district = "cumilla", verified = true, consent = true }) {
  const prefs = toModelPatch(updateCategoryConsent(null, "weather", consent, { now: NOW }));
  const user = {
    _id: id,
    phone: "+8801712345678",
    phoneVerifiedAt: verified ? "2026-11-20T10:00:00.000Z" : null,
    preferredDistrict: district,
    role: "farmer",
  };
  return { prefs: { ...prefs, _id: `prefs-${id}`, userId: id }, user };
}

function forecast({ rain = 70, timestamp = NOW.toISOString(), stale = false, district = "cumilla" } = {}) {
  return {
    location: { nameEn: district === "chattogram" ? "Chattogram" : "Cumilla" },
    shortRangeForecast: [{ dayIndex: 1, date: "2026-11-24", precipitationSumMm: rain, weatherCode: 1 }],
    meta: { provider: WEATHER_SOURCE, dataStatus: "AVAILABLE", fetchTimestamp: timestamp, ...(stale ? { isStale: true } : {}) },
  };
}

async function makeCycle(options = {}) {
  const fixtures = options.fixtures || [farmer({ id: "u1" })];
  const logger = options.logger || memoryLogger();
  const getForecastCount = { value: 0 };
  const getForecast = options.getForecast || (async () => {
    getForecastCount.value += 1;
    return forecast();
  });
  const run = (extra = {}) => runWeatherAlertCycle({
    userModel: userModel(fixtures.map((item) => item.user)),
    preferencesModel: preferencesModel(fixtures.map((item) => item.prefs)),
    lock: options.lock || fakeLock(),
    getForecast,
    logger,
    now: NOW,
    ...extra,
  });
  return { run, logger, getForecastCount };
}

test("multiple farmers in one district each get a dry-run alert; forecast is reused", async () => {
  const fixtures = [
    farmer({ id: "u1" }),
    farmer({ id: "u2" }),
    farmer({ id: "u3", district: "chattogram" }),
  ];
  const calls = [];
  const cycle = await makeCycle({
    fixtures,
    getForecast: async ({ locationIdentifier }) => {
      calls.push(locationIdentifier);
      return forecast({ district: locationIdentifier });
    },
  });
  const summary = await cycle.run();

  assert.equal(summary.locked, false);
  assert.equal(summary.eligible, 3);
  assert.equal(summary.evaluated, 3);
  assert.equal(summary.dryRunAlerts, 3);
  assert.equal(cycle.getForecastCount.value, 0);
  assert.deepEqual(calls, ["cumilla", "chattogram"]);
  assert.deepEqual(summary.districtsProcessed, ["chattogram", "cumilla"]);
  assert.equal(cycle.logger.entries.length, 3);
  const keys = cycle.logger.entries.map((entry) => entry.dedupeKey);
  assert.equal(new Set(keys).size, 3, "dedupe keys must be per farmer");
  assert.ok(keys.some((key) => key.includes(":u1:")) && keys.some((key) => key.includes(":u2:")));
});

test("repeated runs do not re-alert the same farmers", async () => {
  const cycle = await makeCycle({ fixtures: [farmer({ id: "u1" }), farmer({ id: "u2" })] });
  const first = await cycle.run();
  const second = await cycle.run();

  assert.equal(first.dryRunAlerts, 2);
  assert.equal(second.dryRunAlerts, 0);
  assert.equal(second.skipped, 2);
  assert.equal(second.skipReasons.DUPLICATE, 2);
});

test("revoked consent, unverified phone and missing district are skipped", async () => {
  const revoked = farmer({ id: "u1" });
  revoked.prefs.consent.revokedAt = NOW.toISOString();
  const unverified = farmer({ id: "u2", verified: false });
  const noDistrict = farmer({ id: "u3", district: null });
  const cycle = await makeCycle({ fixtures: [revoked, unverified, noDistrict] });
  const summary = await cycle.run();

  assert.equal(summary.eligible, 0);
  assert.equal(summary.evaluated, 0);
  assert.equal(summary.dryRunAlerts, 0);
  assert.equal(summary.skipReasons.NO_CONSENT, 1);
  assert.equal(summary.skipReasons.PHONE_NOT_VERIFIED, 1);
  assert.equal(summary.skipReasons.MISSING_DISTRICT, 1);
});

test("invalid, stale and throwing forecasts are skipped without evaluation", async () => {
  const staleCycle = await makeCycle({ getForecast: async () => forecast({ stale: true }) });
  const stale = await staleCycle.run();
  assert.equal(stale.eligible, 1);
  assert.equal(stale.evaluated, 0);
  assert.equal(stale.skipReasons.FORECAST_UNAVAILABLE, 1);

  const throwingCycle = await makeCycle({ getForecast: async () => { throw new Error("provider down"); } });
  const failed = await throwingCycle.run();
  assert.equal(failed.errors, 1);
  assert.equal(failed.skipReasons.FORECAST_UNAVAILABLE, 1);
  assert.equal(failed.dryRunAlerts, 0);
});

test("overlapping cycles are blocked by the database-backed lock", async () => {
  const lock = fakeLock({ held: true });
  const cycle = await makeCycle({ lock });
  const summary = await cycle.run();

  assert.equal(summary.locked, true);
  assert.equal(summary.dryRunAlerts, 0);
  assert.equal(summary.skipReasons.CYCLE_ALREADY_RUNNING, 1);
  assert.equal(lock.state.released, 0, "a cycle that never acquired the lock must not release it");
});

test("bounded batches and maxUsers cap the work", async () => {
  const fixtures = ["u1", "u2", "u3", "u4", "u5"].map((id) => farmer({ id }));
  const cycle = await makeCycle({ fixtures });
  const summary = await cycle.run({ batchSize: 2, maxUsers: 3 });

  assert.equal(summary.eligible, 3);
  assert.equal(summary.evaluated, 3);
  assert.equal(summary.stoppedEarly, "MAX_USERS");
  assert.equal(cycle.logger.entries.length, 3);
});

test("evaluation errors are counted, the lock is released, and the summary has no phone numbers", async () => {
  const lock = fakeLock();
  const cycle = await makeCycle({ lock });
  const summary = await cycle.run({
    evaluate: async () => { throw new Error("boom"); },
  });

  assert.equal(summary.errors, 1);
  assert.equal(summary.skipReasons.EVALUATION_ERROR, 1);
  assert.equal(lock.state.released, 1);
  assert.equal(JSON.stringify(summary).includes("+8801712345678"), false);
  assert.equal(JSON.stringify(summary).includes("5678"), false);
});

test("a failing lock release is reported without losing the cycle summary", async () => {
  const lock = fakeLock({ failRelease: true });
  const cycle = await makeCycle({ lock });
  const summary = await cycle.run();
  assert.equal(summary.errors, 1);
  assert.equal(summary.dryRunAlerts, 1);
});
