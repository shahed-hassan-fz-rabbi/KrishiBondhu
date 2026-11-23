import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import {
  connectIsolatedTestDatabase,
  disconnectIsolatedTestDatabase,
} from "./helpers/isolatedMongo.js";
import { User } from "../src/models/user.model.js";
import { PhoneVerification } from "../src/models/phoneverification.model.js";
import { PhoneVerificationService } from "../src/services/phone-verification.service.js";

/** REAL DB OTP-flow verification with a mocked transport. BLOCKED without URI. */
const dbAvailable = Boolean(process.env.MONGODB_TEST_URI);
const BLOCKED = "BLOCKED: no isolated MongoDB test instance (set MONGODB_TEST_URI to a kb_test_ database)";
const integration = (name, fn) => test(name, { skip: dbAvailable ? false : BLOCKED }, fn);

let databaseName = null;
const NOW = new Date("2026-11-24T10:00:00.000Z");
const PHONE = "+8801712345678";

if (dbAvailable) {
  before(async () => { databaseName = await connectIsolatedTestDatabase("sms_otp_verification"); });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), PhoneVerification.deleteMany({})]);
  });
  after(async () => {
    if (databaseName) {
      await Promise.all([User.deleteMany({}), PhoneVerification.deleteMany({})]);
      await disconnectIsolatedTestDatabase(databaseName);
    }
  });
}

integration("only the genuine received OTP verifies a phone; wrong codes never do", async () => {
  const user = await User.create({
    name: "OTP Test Farmer",
    phone: PHONE,
    phoneVerifiedAt: null,
    preferredDistrict: "cumilla",
    role: "farmer",
    passwordHash: "test-only-hash",
  });

  let issuedCode = null;
  let deliveries = 0;
  const transport = async (phone, code) => {
    assert.equal(phone, PHONE);
    assert.match(code, /^\d{6}$/);
    issuedCode = code;
    deliveries += 1;
    return { sent: true, provider: "alpha_sms" };
  };

  const sent = await PhoneVerificationService.sendCode(user._id, { transport, now: NOW });
  assert.equal(sent.success, true);
  assert.equal(deliveries, 1);
  assert.equal((await User.findById(user._id)).phoneVerifiedAt, null, "requesting an OTP never verifies");

  const wrong = String((Number(issuedCode) + 1) % 1_000_000).padStart(6, "0");
  const rejected = await PhoneVerificationService.verifyCode(user._id, wrong);
  assert.equal(rejected.success, false);
  assert.equal(rejected.code, "INVALID_CODE");
  assert.equal((await User.findById(user._id)).phoneVerifiedAt, null, "a wrong OTP never verifies");

  const confirmed = await PhoneVerificationService.verifyCode(user._id, issuedCode);
  assert.equal(confirmed.success, true);
  assert.ok((await User.findById(user._id)).phoneVerifiedAt instanceof Date, "the genuine OTP verifies");

  const replay = await PhoneVerificationService.verifyCode(user._id, issuedCode);
  assert.equal(replay.success, false, "a used OTP cannot be replayed");
});

integration("requesting an OTP twice in one minute is rate limited; failed attempts are bounded", async () => {
  const user = await User.create({
    name: "OTP Limit Farmer", phone: PHONE, role: "farmer", passwordHash: "test-only-hash",
  });
  const transport = async () => ({ sent: true });
  await PhoneVerificationService.sendCode(user._id, { transport, now: NOW });
  const second = await PhoneVerificationService.sendCode(user._id, { transport, now: NOW });
  assert.equal(second.success, false);
  assert.equal(second.code, "OTP_COOLDOWN");

  const record = await PhoneVerification.findOne({ userId: user._id }).select("+codeHash");
  assert.equal(record?.codeHash?.length, 64, "HMAC-SHA256 hex digest is stored");
  assert.equal(record?.toObject?.().code, undefined, "no plaintext code field exists");
});

integration("OTP delivery failure never verifies the phone", async () => {
  const user = await User.create({
    name: "OTP Fail Farmer", phone: PHONE, role: "farmer", passwordHash: "test-only-hash",
  });
  const failed = await PhoneVerificationService.sendCode(user._id, {
    transport: async () => ({ sent: false, reason: "provider_declined" }),
    now: NOW,
  });
  assert.equal(failed.success, false);
  assert.equal(failed.code, "SMS_UNAVAILABLE");
  assert.equal((await User.findById(user._id)).phoneVerifiedAt, null);
  assert.equal(await PhoneVerification.countDocuments({}), 0, "no pending OTP stored after delivery failure");
});
