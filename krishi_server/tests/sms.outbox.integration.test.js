import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import {
  connectIsolatedTestDatabase,
  disconnectIsolatedTestDatabase,
} from "./helpers/isolatedMongo.js";
import { User } from "../src/models/user.model.js";
import { SmsPreferences } from "../src/models/smsPreferences.model.js";
import { SmsNotificationLog } from "../src/models/smsNotificationLog.model.js";
import { SmsOutbox } from "../src/models/smsOutbox.model.js";
import {
  enqueueSmsAlert,
  transitionOutboxStatus,
} from "../src/services/sms/smsOutbox.service.js";
import { decryptOutboxMessage } from "../src/services/sms/smsOutboxCrypto.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";

/**
 * REAL database-backed outbox verification. BLOCKED (skipped) unless
 * MONGODB_TEST_URI points to a dedicated kb_test_ database.
 */
const dbAvailable = Boolean(process.env.MONGODB_TEST_URI);
const BLOCKED = "BLOCKED: no isolated MongoDB test instance (set MONGODB_TEST_URI to a kb_test_ database)";
const integration = (name, fn) => test(name, { skip: dbAvailable ? false : BLOCKED }, fn);

const COLLECTIONS = [User, SmsPreferences, SmsNotificationLog, SmsOutbox];
let databaseName = null;

if (dbAvailable) {
  before(async () => {
    databaseName = await connectIsolatedTestDatabase("sms_outbox");
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
const TEXT = "Cumilla Central: Rice দাম বেড়েছে ১২ টাকা/কেজি।";
const KEY = "market:farmer-1:rice:cumilla central:2026-11-23";

async function seedFarmer({ verified = true } = {}) {
  const user = await User.create({
    name: "Outbox Test Farmer",
    phone: "+8801712345678",
    phoneVerifiedAt: verified ? "2026-11-20T10:00:00.000Z" : null,
    preferredDistrict: "cumilla",
    role: "farmer",
    passwordHash: "integration-only-hash",
  });
  const preferences = await SmsPreferences.create({
    userId: user._id,
    ...toModelPatch(updateCategoryConsent(null, "market", true, { now: NOW })),
    phoneLast4: "5678",
  });
  return { user: user.toObject(), preferences };
}

function enqueueFor(user, preferences, overrides = {}) {
  return enqueueSmsAlert({
    user, preferences, category: "market", text: TEXT, dedupeKey: KEY, now: NOW,
    ...overrides,
  });
}

integration("unique index makes sequential enqueue idempotent", async () => {
  const { user, preferences } = await seedFarmer();
  const first = await enqueueFor(user, preferences);
  const second = await enqueueFor(user, preferences);

  assert.equal(first.enqueued, true);
  assert.equal(second.enqueued, false);
  assert.equal(second.reason, "DUPLICATE");
  assert.equal(await SmsOutbox.countDocuments({}), 1);
});

integration("concurrent enqueue produces exactly one outbox record", async () => {
  const { user, preferences } = await seedFarmer();
  const results = await Promise.all(Array.from({ length: 12 }, () => enqueueFor(user, preferences)));

  assert.equal(results.filter((item) => item.enqueued).length, 1);
  assert.equal(results.filter((item) => item.reason === "DUPLICATE").length, 11);
  assert.equal(await SmsOutbox.countDocuments({}), 1);

  const indexes = await SmsOutbox.collection.indexes();
  const unique = indexes.find((index) => index.name === "sms_outbox_user_dedupe_unique");
  assert.ok(unique?.unique === true);
  assert.deepEqual(Object.keys(unique.key).sort(), ["dedupeKey", "userId"]);
});

integration("consent rejection and invalid recipient create no record", async () => {
  const { user, preferences } = await seedFarmer();
  const denied = await enqueueFor(user, {});
  assert.equal(denied.reason, "NO_CONSENT");

  const unverified = await enqueueFor({ ...user, phoneVerifiedAt: null }, preferences);
  assert.equal(unverified.reason, "INVALID_RECIPIENT");

  assert.equal(await SmsOutbox.countDocuments({}), 0);
});

integration("protected message content is excluded from default reads", async () => {
  const { user, preferences } = await seedFarmer();
  const result = await enqueueFor(user, preferences);
  assert.equal(result.enqueued, true);

  const defaultRead = await SmsOutbox.findById(result.outbox.id).lean();
  assert.equal(defaultRead.message, undefined);
  assert.equal(defaultRead.phoneLast4, "5678");
  assert.equal(defaultRead.messageRef.length, 64);

  const protectedRead = await SmsOutbox.findById(result.outbox.id).select("+message").lean();
  if (protectedRead.messageProtected) {
    assert.equal(protectedRead.message.includes(TEXT), false);
    assert.equal(decryptOutboxMessage(protectedRead.message), TEXT);
  } else {
    assert.equal(protectedRead.message, TEXT);
  }
});

integration("status transitions are atomic and lease-owner guarded", async () => {
  const { user, preferences } = await seedFarmer();
  const enqueued = await enqueueFor(user, preferences);
  const id = enqueued.outbox.id;

  const claimed = await transitionOutboxStatus({
    id, from: "pending", to: "processing", leaseOwner: "worker-a", now: NOW,
  });
  assert.equal(claimed.ok, true);
  assert.equal(claimed.outbox.attempts, 1);

  const intruder = await transitionOutboxStatus({
    id, from: "processing", to: "submitted", leaseOwner: "worker-b", now: NOW,
  });
  assert.equal(intruder.reason, "NOT_FOUND_OR_CONFLICT");

  const done = await transitionOutboxStatus({
    id, from: "processing", to: "submitted", leaseOwner: "worker-a", now: NOW,
  });
  assert.equal(done.ok, true);
  const stored = await SmsOutbox.findById(id).lean();
  assert.equal(stored.status, "submitted");
  assert.equal(stored.leaseOwner, null);
  assert.ok(stored.submittedAt);

  const afterSubmit = await transitionOutboxStatus({
    id, from: "submitted", to: "pending", now: NOW,
  });
  assert.equal(afterSubmit.reason, "INVALID_TRANSITION");
});

integration("enqueue makes no gateway or notification-log side effects", async () => {
  const { user, preferences } = await seedFarmer();
  await enqueueFor(user, preferences);
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
});
