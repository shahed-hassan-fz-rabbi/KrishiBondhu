import test from "node:test";
import assert from "node:assert/strict";

import {
  SMS_CATEGORIES,
  maskPhone,
  isValidBangladeshMobile,
  normalizeSmsPreferences,
  hasSmsConsent,
  updateCategoryConsent,
  revokeAllSmsConsent,
  createUnsubscribeToken,
  hashUnsubscribeToken,
  smsParts,
} from "../src/services/sms/smsPreferences.js";

import {
  sendSms,
  getSmsMode,
  registerSmsGateway,
  resetSmsGatewayForTests,
} from "../src/services/sms/smsSender.service.js";

const NOW = new Date("2026-11-23T10:00:00.000Z");
const USER = {
  _id: "u1",
  phone: "+8801712345678",
  phoneVerifiedAt: new Date("2026-11-20T10:00:00.000Z"),
};

function memoryLogger() {
  const entries = [];
  return {
    entries,
    async create(entry) { const saved = { ...entry, _id: `log-${entries.length + 1}` }; entries.push(saved); return saved; },
    async findRecent({ dedupeKey, windowMs }) {
      const cutoff = new Date(Date.now() - windowMs);
      return [...entries].reverse().find((e) => e.dedupeKey === dedupeKey && e.occurredAt >= cutoff && e.status !== "skipped") || null;
    },
  };
}

test("SMS foundation defines only weather, market and farm reminder subscriptions", () => {
  assert.deepEqual(SMS_CATEGORIES, ["weather", "market", "farmReminder"]);
  const normalized = normalizeSmsPreferences({ categories: { weather: { enabled: true }, unknown: { enabled: true } } });
  assert.equal(normalized.categories.weather.enabled, true);
  assert.equal(normalized.categories.market.enabled, false);
  assert.equal(normalized.categories.farmReminder.enabled, false);
  assert.equal(normalized.categories.unknown, undefined);
});

test("SMS preferences normalise missing and malformed input safely", () => {
  const a = normalizeSmsPreferences(null);
  const b = normalizeSmsPreferences("bad");
  for (const prefs of [a, b]) {
    for (const category of SMS_CATEGORIES) {
      assert.equal(prefs.categories[category].enabled, false);
      assert.equal(prefs.categories[category].subscribedAt, null);
    }
    assert.equal(prefs.consentGivenAt, null);
  }
});

test("phone masking and Bangladesh mobile validation", () => {
  assert.equal(maskPhone("+8801712345678"), "5678");
  assert.equal(maskPhone("01712-345678"), "5678");
  assert.equal(maskPhone("123"), null);
  assert.equal(isValidBangladeshMobile("+8801712345678"), true);
  assert.equal(isValidBangladeshMobile("01712345678"), false);
  assert.equal(isValidBangladeshMobile("+8801212345678"), false);
});

test("explicit consent is required for every category", () => {
  const noConsent = normalizeSmsPreferences({ categories: { weather: { enabled: true, subscribedAt: NOW } } });
  assert.equal(hasSmsConsent({ user: USER, preferences: noConsent, category: "weather", now: NOW }), false);

  const withConsent = updateCategoryConsent(noConsent, "weather", true, { now: NOW });
  assert.equal(hasSmsConsent({ user: USER, preferences: withConsent, category: "weather", now: NOW }), true);
  // Enabling one category does not imply consent for others.
  assert.equal(hasSmsConsent({ user: USER, preferences: withConsent, category: "market", now: NOW }), false);
});

test("unverified or missing phone never has consent", () => {
  const prefs = updateCategoryConsent(null, "market", true, { now: NOW });
  assert.equal(hasSmsConsent({ user: { ...USER, phoneVerifiedAt: null }, preferences: prefs, category: "market", now: NOW }), false);
  assert.equal(hasSmsConsent({ user: { ...USER, phone: null }, preferences: prefs, category: "market", now: NOW }), false);
});

test("unsubscribe disables a category and global revoke disables all", () => {
  let prefs = updateCategoryConsent(null, "weather", true, { now: NOW });
  prefs = updateCategoryConsent(prefs, "market", true, { now: NOW });
  assert.equal(hasSmsConsent({ user: USER, preferences: prefs, category: "weather", now: NOW }), true);

  prefs = updateCategoryConsent(prefs, "weather", false, { now: new Date(NOW.getTime() + 1000) });
  assert.equal(hasSmsConsent({ user: USER, preferences: prefs, category: "weather", now: new Date(NOW.getTime() + 2000) }), false);
  assert.equal(hasSmsConsent({ user: USER, preferences: prefs, category: "market", now: new Date(NOW.getTime() + 2000) }), true);

  prefs = revokeAllSmsConsent(prefs, { now: new Date(NOW.getTime() + 3000) });
  assert.equal(hasSmsConsent({ user: USER, preferences: prefs, category: "market", now: new Date(NOW.getTime() + 4000) }), false);
});

test("unsubscribe tokens are high entropy and hashed at rest", () => {
  const first = createUnsubscribeToken();
  const second = createUnsubscribeToken();
  assert.notEqual(first.token, second.token);
  assert.equal(first.hash, hashUnsubscribeToken(first.token));
  assert.notEqual(first.hash, first.token);
  assert.match(first.hash, /^[a-f0-9]{64}$/);
});

test("Bangla SMS parts use 70/67 character limits", () => {
  assert.equal(smsParts(""), 0);
  assert.equal(smsParts("short ascii"), 1);
  assert.equal(smsParts("一".repeat(70)), 1);
  assert.equal(smsParts("一".repeat(71)), 2);
  assert.equal(smsParts("x".repeat(161)), 2);
});

test("dry-run mode logs safely and never contacts a gateway", async () => {
  resetSmsGatewayForTests();
  assert.equal(getSmsMode(), "dry_run");
  const logger = memoryLogger();
  const prefs = updateCategoryConsent(null, "farmReminder", true, { now: NOW });

  const result = await sendSms({
    user: USER,
    preferences: prefs,
    text: "আপনার জমির কাজ: আজ সেচ দিন।",
    category: "farmReminder",
    dedupeKey: "farm-reminder-demo",
    now: NOW,
    logger,
  });

  assert.equal(result.status, "dry_run");
  assert.equal(result.dryRun, true);
  assert.equal(result.log.status, "dry_run");
  assert.equal(result.log.phoneLast4, "5678");
  assert.equal(JSON.stringify(result).includes("+8801712345678"), false, "full phone must not appear in result");
  assert.equal(JSON.stringify(logger.entries).includes("+8801712345678"), false, "full phone must not be logged");
});

test("no-consent sends are skipped with a reason", async () => {
  resetSmsGatewayForTests();
  const logger = memoryLogger();
  const result = await sendSms({
    user: USER,
    preferences: normalizeSmsPreferences(null),
    text: "আবহাওয়া সতর্কতা",
    category: "weather",
    now: NOW,
    logger,
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no_consent");
  assert.equal(result.log.attempts, 0);
  assert.equal(result.log.lastError, "no_explicit_consent_or_phone_unverified");
});

test("duplicate alerts within the window are suppressed", async () => {
  resetSmsGatewayForTests();
  const logger = memoryLogger();
  const prefs = updateCategoryConsent(null, "market", true, { now: NOW });
  const payload = {
    user: USER,
    preferences: prefs,
    text: "দাম সতর্কতা: গোল আলু",
    category: "market",
    dedupeKey: "market-alert-1",
    now: NOW,
    logger,
    windowMs: 600000,
  };

  const first = await sendSms(payload);
  const second = await sendSms(payload);
  assert.equal(first.status, "dry_run");
  assert.equal(second.status, "skipped");
  assert.equal(second.reason, "duplicate");
  assert.equal(logger.entries.filter((e) => e.status === "dry_run").length, 1);
});

test("a registered gateway is reserved for future parts", async () => {
  resetSmsGatewayForTests();
  let called = 0;
  registerSmsGateway({ name: "future-gateway", send: async () => { called += 1; return { ok: true }; } });
  assert.equal(getSmsMode(), "live");
  const logger = memoryLogger();
  const prefs = updateCategoryConsent(null, "weather", true, { now: NOW });
  const result = await sendSms({ user: USER, preferences: prefs, text: "Test", category: "weather", now: NOW, logger });
  assert.equal(result.status, "sent");
  assert.equal(called, 1);
  resetSmsGatewayForTests();
});
