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
import { MarketPriceObservation } from "../src/models/marketpriceobservation.model.js";
import { evaluateFarmerMarketPriceAlertForOutbox } from "../src/services/sms/marketPriceAlertOutbox.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";

/** REAL database-backed market -> outbox verification. BLOCKED without URI. */
const dbAvailable = Boolean(process.env.MONGODB_TEST_URI);
const BLOCKED = "BLOCKED: no isolated MongoDB test instance (set MONGODB_TEST_URI to a kb_test_ database)";
const integration = (name, fn) => test(name, { skip: dbAvailable ? false : BLOCKED }, fn);

const COLLECTIONS = [User, SmsPreferences, SmsOutbox, SmsNotificationLog, MarketPriceObservation];
let databaseName = null;

if (dbAvailable) {
  before(async () => {
    databaseName = await connectIsolatedTestDatabase("market_outbox");
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

const NOW = new Date("2026-11-24T10:00:00.000Z");
const SELECTION = {
  commodityKey: "rice",
  market: "Cumilla Central",
  unit: "BDT/kg",
  priceType: "retail",
  frequency: "daily",
  district: "cumilla",
  division: "Chattogram",
};

async function seedFarmer(id = "u1", consent = true) {
  const phone = `+880171000000${id === "u1" ? 1 : 2}`;
  const user = await User.create({
    name: `Market Farmer ${id}`,
    phone,
    phoneVerifiedAt: "2026-11-20T10:00:00.000Z",
    preferredDistrict: "cumilla",
    role: "farmer",
    passwordHash: "integration-only-hash",
  });
  const preferences = await SmsPreferences.create({
    userId: user._id,
    ...toModelPatch(updateCategoryConsent(null, "market", consent, { now: NOW })),
    phoneLast4: phone.slice(-4),
  });
  return { user: user.toObject(), preferences };
}

function observation({ date = "2026-11-23", price = 112, ...overrides } = {}) {
  return {
    commodity: "Rice",
    commodityKey: "rice",
    division: "Chattogram",
    district: "Cumilla",
    upazila: "",
    market: "Cumilla Central",
    frequency: "daily",
    priceType: "retail",
    unit: "BDT/kg",
    priceMin: price,
    priceMax: price,
    observedOn: new Date(`${date}T00:00:00.000Z`),
    source: "DAM official report",
    sourceUrl: "https://market.dam.gov.bd/report",
    qualityStatus: "verified",
    ...overrides,
  };
}

async function seedValidSeries(overrides = {}) {
  await MarketPriceObservation.create([
    observation({ date: "2026-11-22", price: 100, ...overrides }),
    observation({ date: "2026-11-23", price: 112, ...overrides }),
  ]);
}

/** Load the seeded observations and pass them to the adapter. */
async function evaluateWithObservations(user, preferences, selection = SELECTION) {
  const observations = await MarketPriceObservation.find({}).lean();
  return evaluateFarmerMarketPriceAlertForOutbox({
    user, preferences, observations, selection, now: NOW,
  });
}

integration("valid market change creates one pending job and no delivery log", async () => {
  await seedValidSeries();
  const { user, preferences } = await seedFarmer("u1");
  const result = await evaluateWithObservations(user, preferences);

  assert.equal(result.queued, true);
  assert.equal(result.reason, "QUEUED");
  assert.equal(await SmsOutbox.countDocuments({}), 1);
  const job = await SmsOutbox.findOne({}).lean();
  assert.equal(job.category, "market");
  assert.equal(job.status, "pending");
  assert.match(job.dedupeKey, /^market:[a-f0-9]{24}:rice:cumilla central:bdt\/kg:retail:daily:unknown:dam official report:2026-11-23$/);
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
});

integration("two farmers create two independent jobs", async () => {
  await seedValidSeries();
  const a = await seedFarmer("u1");
  const b = await seedFarmer("u2");
  const first = await evaluateWithObservations(a.user, a.preferences);
  const second = await evaluateWithObservations(b.user, b.preferences);

  assert.equal(first.queued, true);
  assert.equal(second.queued, true);
  assert.notEqual(first.dedupeKey, second.dedupeKey);
  assert.equal(await SmsOutbox.countDocuments({}), 2);
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
});

integration("repeated evaluation never duplicates a job", async () => {
  await seedValidSeries();
  const { user, preferences } = await seedFarmer("u1");
  const first = await evaluateWithObservations(user, preferences);
  const second = await evaluateWithObservations(user, preferences);

  assert.equal(first.queued, true);
  assert.equal(second.queued, false);
  assert.equal(second.reason, "DUPLICATE");
  assert.equal(await SmsOutbox.countDocuments({}), 1);
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
});

integration("revoked consent creates no job", async () => {
  await seedValidSeries();
  const { user, preferences } = await seedFarmer("u1", false);
  const stored = await SmsPreferences.findOne({ userId: user._id });
  stored.consent.revokedAt = new Date();
  await stored.save();

  const result = await evaluateWithObservations(user, preferences);
  assert.equal(result.queued, false);
  assert.equal(result.reason, "NO_CONSENT");
  assert.equal(await SmsOutbox.countDocuments({}), 0);
});

integration("missing or mismatched selection creates no job", async () => {
  await seedValidSeries();
  const { user, preferences } = await seedFarmer("u1");
  assert.equal((await evaluateWithObservations(user, preferences, { ...SELECTION, market: "" })).reason, "NO_MARKET_SELECTED");
  assert.equal((await evaluateWithObservations(user, preferences, { ...SELECTION, district: "chattogram" })).reason, "LOCATION_MISMATCH");
  assert.equal(await SmsOutbox.countDocuments({}), 0);
});

integration("stale, review-only and modeled observations create no job", async () => {
  const { user, preferences } = await seedFarmer("u1");
  await MarketPriceObservation.create([
    observation({ date: "2026-11-01", price: 100 }),
    observation({ date: "2026-11-06", price: 112 }),
  ]);
  assert.equal((await evaluateWithObservations(user, preferences)).reason, "STALE_DATA");
  await MarketPriceObservation.deleteMany({});

  await MarketPriceObservation.create(observation({ date: "2026-11-23", price: 112, qualityStatus: "review" }));
  assert.equal((await evaluateWithObservations(user, preferences)).reason, "INSUFFICIENT_HISTORY");
  await MarketPriceObservation.deleteMany({});

  await MarketPriceObservation.create([
    observation({ date: "2026-11-22", price: 100, sourceUrl: "https://data.worldbank.org/price" }),
    observation({ date: "2026-11-23", price: 112, sourceUrl: "https://data.worldbank.org/price" }),
  ]);
  assert.equal((await evaluateWithObservations(user, preferences)).reason, "INSUFFICIENT_HISTORY");
  assert.equal(await SmsOutbox.countDocuments({}), 0);
});

integration("grade survives persistence and grade/source series get distinct dedupe keys", async () => {
  const { user, preferences } = await seedFarmer("u1");
  // The observation unique index does not include grade, so each grade series
  // uses a distinct official source while keeping dates/prices identical.
  await MarketPriceObservation.create([
    observation({ date: "2026-11-22", price: 100, grade: "A" }),
    observation({ date: "2026-11-23", price: 112, grade: "A" }),
    observation({ date: "2026-11-22", price: 100, grade: "B", source: "DAM market bulletin" }),
    observation({ date: "2026-11-23", price: 112, grade: "B", source: "DAM market bulletin" }),
    observation({ date: "2026-11-22", price: 100, source: "DAM wholesale bulletin" }),
    observation({ date: "2026-11-23", price: 112, source: "DAM wholesale bulletin" }),
  ]);
  const all = await MarketPriceObservation.find({}).lean();
  const pick = (matcher) => all.filter(matcher);

  assert.equal(all.filter((row) => row.grade === "a").length, 2, "grade is normalised and persisted");
  assert.equal(all.filter((row) => row.grade === "b").length, 2);
  assert.equal(all.filter((row) => row.grade === null || row.grade === undefined).length, 2);

  const gradeA = await evaluateFarmerMarketPriceAlertForOutbox({
    user, preferences, observations: pick((row) => row.grade === "a"),
    selection: { ...SELECTION, grade: "A" }, now: NOW,
  });
  const gradeB = await evaluateFarmerMarketPriceAlertForOutbox({
    user, preferences, observations: pick((row) => row.grade === "b"),
    selection: { ...SELECTION, grade: "B", source: "DAM market bulletin" }, now: NOW,
  });
  const ungraded = await evaluateFarmerMarketPriceAlertForOutbox({
    user, preferences, observations: pick((row) => !row.grade),
    selection: { ...SELECTION, source: "DAM wholesale bulletin" }, now: NOW,
  });
  const mixed = await evaluateFarmerMarketPriceAlertForOutbox({
    user, preferences, observations: all, selection: SELECTION, now: NOW,
  });

  assert.equal(gradeA.queued, true, `grade A reason: ${gradeA.reason}`);
  assert.equal(gradeB.queued, true, `grade B reason: ${gradeB.reason}`);
  assert.equal(ungraded.queued, true, `ungraded reason: ${ungraded.reason}`);
  assert.equal(mixed.queued, false);
  assert.equal(mixed.reason, "AMBIGUOUS_SERIES", "different grades cannot be compared");
  assert.ok(gradeA.dedupeKey.includes(":a:dam"));
  assert.ok(gradeB.dedupeKey.includes(":b:dam"));
  assert.ok(ungraded.dedupeKey.includes(":unknown:dam"));
  assert.equal(new Set([gradeA.dedupeKey, gradeB.dedupeKey, ungraded.dedupeKey]).size, 3);
  assert.equal(await SmsOutbox.countDocuments({}), 3);
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
});

integration("known grade never matches an ungraded selection or observation", async () => {
  const { user, preferences } = await seedFarmer("u2");
  await MarketPriceObservation.create([
    observation({ date: "2026-11-22", price: 100, grade: "A" }),
    observation({ date: "2026-11-23", price: 112, grade: "A" }),
  ]);
  const all = await MarketPriceObservation.find({}).lean();
  const unknownSelection = await evaluateFarmerMarketPriceAlertForOutbox({
    user, preferences, observations: all,
    selection: { ...SELECTION, grade: "unknown" }, now: NOW,
  });
  assert.equal(unknownSelection.queued, false);
  assert.equal(await SmsOutbox.countDocuments({}), 0);
});
