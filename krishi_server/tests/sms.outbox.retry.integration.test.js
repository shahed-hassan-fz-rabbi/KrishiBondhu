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
import { enqueueSmsAlert, revalidateForDelivery } from "../src/services/sms/smsOutbox.service.js";
import { processSmsOutboxBatch } from "../src/services/sms/smsOutboxWorker.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";

/** REAL database-backed retry verification. BLOCKED without MONGODB_TEST_URI. */
const dbAvailable = Boolean(process.env.MONGODB_TEST_URI);
const BLOCKED = "BLOCKED: no isolated MongoDB test instance (set MONGODB_TEST_URI to a kb_test_ database)";
const integration = (name, fn) => test(name, { skip: dbAvailable ? false : BLOCKED }, fn);

const COLLECTIONS = [User, SmsPreferences, SmsNotificationLog, SmsOutbox];
let databaseName = null;

if (dbAvailable) {
  before(async () => {
    databaseName = await connectIsolatedTestDatabase("sms_outbox_retry");
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
const BASE = 1000;

async function seedJob(key = "market:farmer-1:rice:retry") {
  const user = await User.create({
    name: "Retry Test Farmer",
    phone: "+8801712345678",
    phoneVerifiedAt: "2026-11-20T10:00:00.000Z",
    preferredDistrict: "cumilla",
    role: "farmer",
    passwordHash: "integration-only-hash",
  });
  const preferences = await SmsPreferences.create({
    userId: user._id,
    ...toModelPatch(updateCategoryConsent(null, "market", true, { now: NOW })),
    phoneLast4: "5678",
  });
  const enqueued = await enqueueSmsAlert({
    user: user.toObject(), preferences, category: "market",
    text: "Cumilla: Rice দাম বেড়েছে।", dedupeKey: key, now: NOW,
  });
  assert.equal(enqueued.enqueued, true);
  return { user, preferences, jobId: enqueued.outbox.id };
}

function workerRun({ now = NOW, leaseOwner = "worker-a", temporary = false, extra = {} } = {}) {
  let calls = 0;
  return {
    run: processSmsOutboxBatch({
      now, leaseOwner, limit: 10, retryBaseMs: BASE, retryMaxMs: 10_000,
      revalidate: (args) => {
        calls += 1;
        if (temporary) throw new Error("simulated temporary processing failure");
        return revalidateForDelivery(args);
      },
      ...extra,
    }),
    calls: () => calls,
  };
}

integration("temporary failure schedules a retry with exponential backoff", async () => {
  const { jobId } = await seedJob();
  const first = workerRun({ temporary: true });
  const a = await first.run;
  assert.equal(a.retryScheduled, 1);
  assert.equal(a.failed, 0);

  let job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.status, "pending");
  assert.equal(job.failureCategory, "temporary");
  assert.equal(job.nextAttemptAt.getTime(), NOW.getTime() + BASE);
  assert.equal(job.leaseOwner, null);

  const early = await workerRun({ now: new Date(NOW.getTime() + BASE - 1), temporary: true }).run;
  assert.equal(early.claimed, 0);

  const second = workerRun({ now: new Date(NOW.getTime() + BASE), temporary: true });
  const b = await second.run;
  assert.equal(b.retryScheduled, 1);
  job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.attempts, 2);
  assert.equal(job.nextAttemptAt.getTime(), NOW.getTime() + BASE + 2 * BASE);
});

integration("attempt budget exhaustion produces a terminal temporary failure", async () => {
  const { jobId } = await seedJob("market:farmer-1:rice:exhaust");
  await SmsOutbox.updateOne({ _id: jobId }, { $set: { attempts: 2 } });

  const summary = await workerRun({ temporary: true }).run;
  assert.equal(summary.retriesExhausted, 1);
  assert.equal(summary.retryScheduled, 0);

  const job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.status, "failed");
  assert.equal(job.lastError, "RETRY_EXHAUSTED");
  assert.equal(job.failureCategory, "temporary");
  assert.equal(job.nextAttemptAt, null);
  assert.equal(job.leaseOwner, null);
});

integration("permanent failures are never retried", async () => {
  const { preferences, jobId } = await seedJob("market:farmer-1:rice:permanent");
  preferences.consent.revokedAt = new Date(NOW.getTime() - 1000);
  await preferences.save();

  const summary = await workerRun().run;
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.retryScheduled, 0);
  const job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.status, "cancelled");
  assert.equal(job.failureCategory, "permanent");
  assert.equal(job.nextAttemptAt, null);
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
});

integration("concurrent workers cannot double-schedule the same retry", async () => {
  const { jobId } = await seedJob("market:farmer-1:rice:concurrent");
  const [a, b] = await Promise.all([
    workerRun({ leaseOwner: "worker-a", temporary: true }).run,
    workerRun({ leaseOwner: "worker-b", temporary: true }).run,
  ]);

  assert.equal(a.retryScheduled + b.retryScheduled, 1);
  assert.equal(a.claimed + b.claimed, 1);
  const job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.attempts, 1);
});

integration("a successful dry-run is never retried or duplicated", async () => {
  const { jobId } = await seedJob("market:farmer-1:rice:success");
  const first = await workerRun().run;
  const second = await workerRun({ leaseOwner: "worker-b" }).run;

  assert.equal(first.dryRuns, 1);
  assert.equal(first.retryScheduled, 0);
  assert.equal(second.claimed, 0);
  assert.equal(second.dryRuns, 0);

  const job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.status, "dry_run");
  assert.equal(job.nextAttemptAt, null);
  assert.equal(await SmsNotificationLog.countDocuments({}), 1);
  const statuses = await SmsNotificationLog.distinct("status");
  assert.deepEqual(statuses, ["dry_run"]);
});
