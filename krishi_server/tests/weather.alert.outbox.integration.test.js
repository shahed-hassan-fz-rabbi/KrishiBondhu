import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import {
  connectIsolatedTestDatabase,
  disconnectIsolatedTestDatabase,
} from "./helpers/isolatedMongo.js";
import { User } from "../src/models/user.model.js";
import { SmsPreferences } from "../src/models/smsPreferences.model.js";
import { SmsOutbox } from "../src/models/smsOutbox.model.js";
import { SmsNotificationLog } from "../src/models/smsNotificationLog.model.js";
import { WeatherAlertCycleLock } from "../src/models/weatherAlertCycleLock.model.js";
import { runWeatherAlertCycle } from "../src/services/sms/weatherAlertCycle.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";
import { WEATHER_SOURCE } from "../src/services/sms/weatherAlertEngine.js";

/** REAL database-backed weather -> outbox verification. BLOCKED without URI. */
const dbAvailable = Boolean(process.env.MONGODB_TEST_URI);
const BLOCKED = "BLOCKED: no isolated MongoDB test instance (set MONGODB_TEST_URI to a kb_test_ database)";
const integration = (name, fn) => test(name, { skip: dbAvailable ? false : BLOCKED }, fn);

const COLLECTIONS = [User, SmsPreferences, SmsOutbox, SmsNotificationLog, WeatherAlertCycleLock];
let databaseName = null;

if (dbAvailable) {
  before(async () => {
    databaseName = await connectIsolatedTestDatabase("weather_outbox");
    await SmsOutbox.init();
  });
  beforeEach(async () => {
    await Promise.all(COLLECTIONS.map((model) => model.deleteMany({})));
  });
  after(async () => {
    if (databaseName) {
      await Promise.all(COLLECTIONS.map((model) => model.deleteMany({})));
      await disconnectIsolatedTestDatabase(databaseName);
    }
  });
}

const NOW = new Date("2026-11-24T10:00:00.000Z");

async function seedFarmer(id = "u1", { consent = true, district = "cumilla", verified = true } = {}) {
  const user = await User.create({
    name: `Weather Farmer ${id}`,
    phone: `+880171000000${id === "u1" ? 1 : 2}`,
    phoneVerifiedAt: verified ? "2026-11-20T10:00:00.000Z" : null,
    preferredDistrict: district,
    role: "farmer",
    passwordHash: "integration-only-hash",
  });
  const preferences = await SmsPreferences.create({
    userId: user._id,
    ...toModelPatch(updateCategoryConsent(null, "weather", consent, { now: NOW })),
    phoneLast4: "5678",
  });
  return { user, preferences };
}

function forecast({ rain = 90, stale = false, district = "cumilla" } = {}) {
  return {
    location: { nameEn: district === "chattogram" ? "Chattogram" : "Cumilla" },
    shortRangeForecast: [{ dayIndex: 1, date: "2026-11-25", precipitationSumMm: rain, weatherCode: 1 }],
    meta: {
      provider: WEATHER_SOURCE,
      dataStatus: "AVAILABLE",
      fetchTimestamp: stale ? new Date(NOW.getTime() - 7 * 3_600_000).toISOString() : NOW.toISOString(),
    },
  };
}

function cycle(getForecast, extra = {}) {
  return runWeatherAlertCycle({
    userModel: User,
    preferencesModel: SmsPreferences,
    lockModel: WeatherAlertCycleLock,
    getForecast,
    now: NOW,
    logger: { info() {}, warn() {}, error() {} },
    ...extra,
  });
}

integration("one eligible farmer creates one pending job and no delivery log", async () => {
  await seedFarmer();
  const summary = await cycle(async () => forecast());

  assert.equal(summary.queued, 1);
  assert.equal(summary.dryRunAlerts, 1);
  assert.equal(summary.duplicate, 0);
  assert.equal(summary.failed, 0);
  assert.equal(await SmsOutbox.countDocuments({}), 1);
  const job = await SmsOutbox.findOne({}).lean();
  assert.equal(job.status, "pending");
  assert.equal(job.category, "weather");
  assert.equal(job.phoneLast4, "0001");
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
});

integration("two farmers in one district create two independent jobs", async () => {
  await seedFarmer("u1");
  await seedFarmer("u2");
  let forecasts = 0;
  const summary = await cycle(async () => { forecasts += 1; return forecast(); });

  assert.equal(summary.eligible, 2);
  assert.equal(summary.queued, 2);
  assert.equal(forecasts, 1, "forecast reused within the district");
  assert.equal(await SmsOutbox.countDocuments({}), 2);
  const keys = (await SmsOutbox.find({}).lean()).map((item) => item.dedupeKey);
  assert.equal(new Set(keys).size, 2);
});

integration("repeated cycles create no duplicate jobs", async () => {
  await seedFarmer("u1");
  await seedFarmer("u2");
  const first = await cycle(async () => forecast());
  const second = await cycle(async () => forecast());

  assert.equal(first.queued, 2);
  assert.equal(second.queued, 0);
  assert.equal(second.duplicate, 2);
  assert.equal(await SmsOutbox.countDocuments({}), 2);
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
});

integration("revoked consent creates no job", async () => {
  await seedFarmer("u1", { consent: false });
  const summary = await cycle(async () => forecast());
  assert.equal(summary.queued, 0);
  assert.equal(await SmsOutbox.countDocuments({}), 0);
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
});

integration("stale, mismatched and no-warning forecasts create no jobs", async () => {
  await seedFarmer("u1");
  const stale = await cycle(async () => forecast({ stale: true }));
  assert.equal(stale.queued, 0);
  assert.equal(stale.skipReasons.FORECAST_UNAVAILABLE, 1);

  const mismatch = await cycle(async () => forecast({ district: "chattogram" }));
  assert.equal(mismatch.queued, 0);

  const noWarning = await cycle(async () => forecast({ rain: 5 }));
  assert.equal(noWarning.queued, 0);

  assert.equal(await SmsOutbox.countDocuments({}), 0);
});
