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
import { enqueueSmsAlert } from "../src/services/sms/smsOutbox.service.js";
import { processSmsOutboxBatch } from "../src/services/sms/smsOutboxWorker.service.js";
import { updateCategoryConsent } from "../src/services/sms/smsPreferences.js";
import { toModelPatch } from "../src/services/sms/smsSubscription.service.js";

/** REAL database-backed worker verification. BLOCKED without MONGODB_TEST_URI. */
const dbAvailable = Boolean(process.env.MONGODB_TEST_URI);
const BLOCKED = "BLOCKED: no isolated MongoDB test instance (set MONGODB_TEST_URI to a kb_test_ database)";
const integration = (name, fn) => test(name, { skip: dbAvailable ? false : BLOCKED }, fn);

const COLLECTIONS = [User, SmsPreferences, SmsNotificationLog, SmsOutbox];
let databaseName = null;

if (dbAvailable) {
  before(async () => {
    databaseName = await connectIsolatedTestDatabase("sms_outbox_worker");
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
const TEXT = "Cumilla: Rice দাম বেড়েছে ১২ টাকা/কেজি। কৃষিবন্ধু।";

async function seedOutboxJob({ key = "market:farmer-1:rice:2026-11-23" } = {}) {
  const user = await User.create({
    name: "Worker Test Farmer",
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
    user: user.toObject(), preferences, category: "market", text: TEXT, dedupeKey: key, now: NOW,
  });
  assert.equal(enqueued.enqueued, true);
  return { user, preferences, jobId: enqueued.outbox.id };
}

function runWorker(leaseOwner, extra = {}) {
  return processSmsOutboxBatch({ leaseOwner, now: NOW, limit: 10, ...extra });
}

integration("a valid job is recorded as dry_run, never as submitted", async () => {
  const { jobId } = await seedOutboxJob();
  const summary = await runWorker("worker-a");

  assert.equal(summary.dryRuns, 1);
  assert.equal(summary.processed, 1);
  const job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.status, "dry_run");
  assert.equal(job.submittedAt, null);
  assert.equal(job.leaseOwner, null);
  assert.equal(job.dryRunProvider, "dry-run");

  const logs = await SmsNotificationLog.find({ dedupeKey: "market:farmer-1:rice:2026-11-23" }).lean();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, "dry_run");
  assert.equal(logs[0].mode, "dry_run");
  assert.equal(logs[0].providerMessageId, null);
  assert.equal(logs[0].phoneLast4, "5678");
});

integration("two concurrent workers cannot process the same job", async () => {
  const { jobId } = await seedOutboxJob();
  const [a, b] = await Promise.all([runWorker("worker-a"), runWorker("worker-b")]);

  assert.equal(a.dryRuns + b.dryRuns, 1);
  assert.equal(a.claimed + b.claimed, 1);
  const job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.status, "dry_run");
  assert.equal(await SmsNotificationLog.countDocuments({}), 1);
});

integration("consent revocation before processing cancels the job", async () => {
  const { preferences, jobId } = await seedOutboxJob();
  preferences.consent.revokedAt = NOW.toISOString();
  await preferences.save();

  const summary = await runWorker("worker-a");
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.dryRuns, 0);
  const job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.status, "cancelled");
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
});

integration("unverified phone before processing cancels the job", async () => {
  const { user, jobId } = await seedOutboxJob();
  user.phoneVerifiedAt = null;
  await user.save();

  const summary = await runWorker("worker-a");
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.dryRuns, 0);
  const job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.status, "cancelled");
});

integration("expired leases are reclaimed by a new worker", async () => {
  const { jobId } = await seedOutboxJob();
  await SmsOutbox.updateOne(
    { _id: jobId },
    {
      $set: {
        status: "processing",
        leaseOwner: "crashed-worker",
        leaseExpiresAt: new Date(NOW.getTime() - 1000),
      },
    }
  );

  const summary = await runWorker("worker-a");
  assert.equal(summary.dryRuns, 1);
  const job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.status, "dry_run");
  assert.equal(job.leaseOwner, null);
});

integration("tampered or failing jobs become failed and clear their lease", async () => {
  const { jobId } = await seedOutboxJob();
  await SmsOutbox.updateOne({ _id: jobId }, { $set: { messageRef: "bad-ref" } });

  const summary = await runWorker("worker-a");
  assert.equal(summary.failed, 1);
  assert.equal(summary.dryRuns, 0);
  const job = await SmsOutbox.findById(jobId).lean();
  assert.equal(job.status, "failed");
  assert.equal(job.leaseOwner, null);
  assert.equal(job.lastError, "MESSAGE_INTEGRITY_MISMATCH");
});

integration("repeated processing never creates duplicate dry-run results", async () => {
  await seedOutboxJob({ key: "market:farmer-1:rice:dup" });
  const first = await runWorker("worker-a");
  const second = await runWorker("worker-b");

  assert.equal(first.dryRuns, 1);
  assert.equal(second.claimed, 0);
  assert.equal(second.dryRuns, 0);
  assert.equal(await SmsNotificationLog.countDocuments({}), 1);
  const statuses = await SmsNotificationLog.distinct("status");
  assert.deepEqual(statuses, ["dry_run"]);
});

integration("worker refuses to run when live SMS mode is enabled", async () => {
  await seedOutboxJob();
  const summary = await runWorker("worker-a", { liveEnabled: true });
  assert.equal(summary.refused, true);
  assert.equal(summary.reason, "LIVE_SMS_ENABLED");
  assert.equal(summary.claimed, 0);
  assert.equal((await SmsOutbox.findOne({})).status, "pending");
  assert.equal(await SmsNotificationLog.countDocuments({}), 0);
});
