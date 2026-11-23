import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import {
  connectIsolatedTestDatabase,
  disconnectIsolatedTestDatabase,
} from "./helpers/isolatedMongo.js";
import { User } from "../src/models/user.model.js";
import { SmsPreferences } from "../src/models/smsPreferences.model.js";
import { MarketPriceAlert } from "../src/models/marketpricealert.model.js";
import { MarketPriceObservation } from "../src/models/marketpriceobservation.model.js";
import { SmsOutbox } from "../src/models/smsOutbox.model.js";
import { SmsNotificationLog } from "../src/models/smsNotificationLog.model.js";
import { MarketAlertCycleLock } from "../src/models/marketAlertCycleLock.model.js";
import { runMarketAlertCycle } from "../src/services/sms/marketAlertCycle.service.js";
import { startMarketAlertScheduler } from "../src/services/sms/marketAlertScheduler.service.js";
import { startSmsOutboxScheduler } from "../src/services/sms/smsOutboxScheduler.service.js";
import { processSmsOutboxBatch } from "../src/services/sms/smsOutboxWorker.service.js";
import {
  migrateMarketObservationGradeIndex,
  LEGACY_INDEX_NAME,
  GRADE_INDEX_NAME,
} from "../src/jobs/migrate-market-grade-index.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";

/** REAL DB E2E: verified data -> market runner -> outbox -> outbox worker. BLOCKED without URI. */
const dbAvailable = Boolean(process.env.MONGODB_TEST_URI);
const BLOCKED = "BLOCKED: no isolated MongoDB test instance (set MONGODB_TEST_URI to a kb_test_ database)";
const e2e = (name, fn) => test(name, { skip: dbAvailable ? false : BLOCKED }, fn);

const COLLECTIONS = [User, SmsPreferences, MarketPriceAlert, MarketPriceObservation, SmsOutbox, SmsNotificationLog, MarketAlertCycleLock];
let databaseName = null;

if (dbAvailable) {
  before(async () => {
    databaseName = await connectIsolatedTestDatabase("market_automation_e2e");
    await SmsOutbox.init();
    await MarketPriceObservation.init();
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

const day = (offset) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

function observation({ date = day(1), price = 112, grade = null, source = "DAM official report" } = {}) {
  return {
    commodity: "Rice", commodityKey: "rice", division: "Chattogram", district: "Cumilla",
    upazila: "", market: "Cumilla Central", frequency: "daily", priceType: "retail",
    unit: "BDT/kg", priceMin: price, priceMax: price,
    observedOn: new Date(`${date}T00:00:00.000Z`), source,
    sourceUrl: "https://market.dam.gov.bd/report", qualityStatus: "verified",
    ...(grade ? { grade } : {}),
  };
}

async function seedFarmer(id, { consent = true, priceType = "retail", unit = "kg", market = "Cumilla Central" } = {}) {
  const phone = `+880171000000${id}`;
  const user = await User.create({
    name: `Market E2E ${id}`, phone,
    phoneVerifiedAt: new Date(Date.now() - 86_400_000),
    preferredDistrict: "cumilla", role: "farmer", passwordHash: "integration-only-hash",
  });
  await SmsPreferences.create({
    userId: user._id,
    ...toModelPatch(updateCategoryConsent(null, "market", consent, { now: new Date() })),
    phoneLast4: phone.slice(-4),
  });
  await MarketPriceAlert.create({
    userId: user._id, commodity: "Rice", market, priceType, unit, targetPrice: 110,
  });
  return { user, phone };
}

async function verifiedHistory(price = [100, 112], grade) {
  await MarketPriceObservation.create([
    observation({ date: day(2), price: price[0], grade }),
    observation({ date: day(1), price: price[1], grade }),
  ]);
}

function runCycle(extra = {}) {
  return runMarketAlertCycle({
    userModel: User, preferencesModel: SmsPreferences, savedAlertModel: MarketPriceAlert,
    observationModel: MarketPriceObservation, lockModel: MarketAlertCycleLock,
    now: new Date(), ...extra,
  });
}

function makeTimers() {
  let time = 0;
  let seq = 0;
  const intervals = new Map();
  const timeouts = new Map();
  return {
    now: () => time,
    setInterval(fn, ms) { const id = ++seq; intervals.set(id, { fn, ms }); return { id, unref() {} }; },
    clearInterval(h) { intervals.delete(h?.id ?? h); },
    setTimeout(fn, ms) { const id = ++seq; timeouts.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    flush: async () => { const due = [...timeouts.values()]; timeouts.clear(); time += 50; for (const t of due) t.fn(); await Promise.resolve(); await Promise.resolve(); },
    get intervalCount() { return intervals.size; },
  };
}

function startOutboxScheduler() {
  const timers = makeTimers();
  const logs = { info: [], warn: [], error: [] };
  const logger = {
    info: (...a) => logs.info.push(a), warn: (...a) => logs.warn.push(a), error: (...a) => logs.error.push(a),
  };
  const scheduler = startSmsOutboxScheduler({
    enabled: true, intervalMs: 1000, timers, logger, isLive: () => false,
    getDbState: () => ({ readyState: 1 }),
  });
  return { scheduler, timers, logs };
}

async function tick(scheduler, timers) {
  let done = false;
  const promise = scheduler.tick().then((v) => { done = true; return v; });
  for (let i = 0; i < 10 && !done; i += 1) await timers.flush();
  await promise;
}

e2e("market scheduler is opt-in and refuses live mode", async () => {
  // This controlled process sets the env flag, so pass enabled explicitly.
  const disabled = startMarketAlertScheduler({ enabled: false, logger: { info() {}, warn() {}, error() {} }, timers: makeTimers() });
  assert.equal(disabled.started, false);
  const refused = startMarketAlertScheduler({
    enabled: true, isLive: () => true, logger: { info() {}, warn() {}, error() {} }, timers: makeTimers(),
  });
  assert.equal(refused.started, false);
  assert.equal(refused.refusedReason, "LIVE_SMS_MODE");
});

e2e("E2E: verified data -> queued -> dry_run, with no duplicate jobs or logs", async () => {
  await seedFarmer(1);
  await verifiedHistory();
  const first = await runCycle({ runId: "market-e2e-1" });
  assert.equal(first.queued, 1);
  let job = await SmsOutbox.findOne({}).lean();
  assert.equal(job.status, "pending");
  assert.equal(job.category, "market");
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);

  const { scheduler, timers, logs } = startOutboxScheduler();
  await tick(scheduler, timers);
  job = await SmsOutbox.findById(job._id).lean();
  assert.equal(job.status, "dry_run");
  assert.equal(job.submittedAt, null);
  const sent = await SmsNotificationLog.find({}).lean();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].status, "dry_run");
  assert.deepEqual(await SmsNotificationLog.distinct("status"), ["dry_run"]);
  assert.equal(JSON.stringify(logs.info).includes("+880"), false);
  await scheduler.stop();

  const second = await runCycle({ runId: "market-e2e-2" });
  assert.equal(second.queued, 0);
  assert.equal(second.duplicate, 1);
  assert.equal(await SmsOutbox.countDocuments({}), 1);
  assert.equal(await SmsNotificationLog.countDocuments({}), 1);
});

e2e("two farmers get independent jobs; revoked consent gets none", async () => {
  await seedFarmer(1);
  await seedFarmer(2);
  const revoked = await seedFarmer(3);
  // Keep the subscription enabled but revoke consent so the runner sees and
  // skips it (disabled subscriptions are filtered out at query time).
  const revokedPrefs = await SmsPreferences.findOne({ userId: revoked.user._id });
  revokedPrefs.consent.revokedAt = new Date();
  await revokedPrefs.save();
  await verifiedHistory();
  const summary = await runCycle({ runId: "market-e2e-multi" });
  assert.equal(summary.queued, 2);
  assert.equal(summary.skipReasons.NO_CONSENT, 1);
  assert.equal(await SmsOutbox.countDocuments({}), 2);
  const keys = (await SmsOutbox.find({}).lean()).map((j) => j.dedupeKey);
  assert.equal(new Set(keys).size, 2);
});

e2e("missing, stale, review-only and unverified data produce no jobs", async () => {
  await seedFarmer(1);
  const missing = await runCycle({ runId: "market-e2e-missing" });
  assert.equal(missing.queued, 0);
  assert.equal(missing.skipReasons.INSUFFICIENT_HISTORY, 1);

  await MarketPriceObservation.deleteMany({});
  await MarketPriceObservation.create([
    observation({ date: day(40), price: 100 }),
    observation({ date: day(39), price: 112 }),
  ]);
  const stale = await runCycle({ runId: "market-e2e-stale" });
  assert.equal(stale.queued, 0);
  assert.ok(stale.skipped >= 1);

  await MarketPriceObservation.deleteMany({});
  await MarketPriceObservation.create([
    { ...observation({ date: day(2), price: 100 }), qualityStatus: "review" },
    { ...observation({ date: day(1), price: 112 }), qualityStatus: "review" },
  ]);
  const review = await runCycle({ runId: "market-e2e-review" });
  assert.equal(review.queued, 0);

  await MarketPriceObservation.deleteMany({});
  await MarketPriceObservation.create([
    { ...observation({ date: day(2), price: 100 }), sourceUrl: "https://example.com/prices" },
    { ...observation({ date: day(1), price: 112 }), sourceUrl: "https://example.com/prices" },
  ]);
  const unofficial = await runCycle({ runId: "market-e2e-unofficial" });
  assert.equal(unofficial.queued, 0);
  assert.equal(await SmsOutbox.countDocuments({}), 0);
});

e2e("grade index migration allows distinct grades and independent dedupe keys", async () => {
  // Simulate a legacy collection: drop all indexes and create the old unique index.
  await MarketPriceObservation.collection.dropIndexes();
  await MarketPriceObservation.collection.createIndex(
    { commodityKey: 1, division: 1, district: 1, upazila: 1, market: 1, frequency: 1, priceType: 1, unit: 1, observedOn: 1, source: 1 },
    { unique: true, name: LEGACY_INDEX_NAME }
  );
  const dry = await migrateMarketObservationGradeIndex({ apply: false });
  assert.equal(dry.legacyFound, true);
  assert.equal(dry.applied, false);

  const applied = await migrateMarketObservationGradeIndex({ apply: true });
  assert.equal(applied.droppedLegacy, true);
  assert.equal(applied.createdGradeIndex, true);
  const names = (await MarketPriceObservation.collection.indexes()).map((i) => i.name);
  assert.equal(names.includes(LEGACY_INDEX_NAME), false);
  assert.equal(names.includes(GRADE_INDEX_NAME), true);

  await MarketPriceObservation.create([
    observation({ date: day(2), price: 100, grade: "A" }),
    observation({ date: day(1), price: 112, grade: "A" }),
    observation({ date: day(2), price: 100, grade: "B" }),
    observation({ date: day(1), price: 112, grade: "B" }),
  ]);
  assert.equal(await MarketPriceObservation.countDocuments({}), 4, "different grades coexist for same source/date");

  await seedFarmer(1);
  const all = await MarketPriceObservation.find({}).lean();
  const a = await runMarketAlertCycle({
    userModel: User, preferencesModel: SmsPreferences, savedAlertModel: MarketPriceAlert,
    observationModel: { find: () => ({ sort: () => ({ limit: () => ({ lean: async () => all.filter((r) => r.grade === "a") }) }) }) },
    lockModel: MarketAlertCycleLock, runId: "grade-a",
  });
  const b = await runMarketAlertCycle({
    userModel: User, preferencesModel: SmsPreferences, savedAlertModel: MarketPriceAlert,
    observationModel: { find: () => ({ sort: () => ({ limit: () => ({ lean: async () => all.filter((r) => r.grade === "b") }) }) }) },
    lockModel: MarketAlertCycleLock, runId: "grade-b",
  });
  assert.equal(a.queued, 1);
  assert.equal(b.queued, 1);
});

e2e("multiple workers cannot claim the same queued job", async () => {
  await seedFarmer(1);
  await verifiedHistory();
  await runCycle({ runId: "race-cycle" });
  const { scheduler, timers } = startOutboxScheduler();
  const ticking = scheduler.tick();
  const direct = processSmsOutboxBatch({ leaseOwner: "second-instance" });
  await timers.flush();
  await Promise.all([ticking, direct]);
  assert.equal((await SmsOutbox.findOne({}).lean()).status, "dry_run");
  assert.equal(await SmsNotificationLog.countDocuments({}), 1);
  await scheduler.stop();
});
