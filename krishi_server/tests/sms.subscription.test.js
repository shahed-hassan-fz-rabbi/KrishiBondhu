import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  resolveCategory,
  validateCategoryUpdate,
  assertPhoneVerified,
  toPublicSmsPreferences,
  applyCategoryChange,
  applyUnsubscribeAll,
} from "../src/services/sms/smsSubscription.service.js";
import { createSmsSubscriptionController } from "../src/controllers/smsSubscription.controller.js";

const NOW = new Date("2026-11-23T10:00:00.000Z");
const VERIFIED_USER = {
  _id: "u1",
  phone: "+8801712345678",
  phoneVerifiedAt: new Date("2026-11-20T10:00:00.000Z"),
  role: "farmer",
};

function fakeResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

/** In-memory stand-in for the SmsPreferences model. */
function fakeModel(initial = {}) {
  const store = { ...initial, saveCalls: 0, createCalls: 0 };
  return {
    store,
    async findOne() {
      if (!store.userId) return null;
      return {
        ...store,
        async save() { store.saveCalls += 1; Object.assign(store, this); },
      };
    },
    async create(doc) { store.createCalls += 1; Object.assign(store, doc); return doc; },
  };
}

function makeController(model, user = VERIFIED_USER) {
  return createSmsSubscriptionController({ model, now: () => NOW });
}

test("category aliases resolve only to supported subscription keys", () => {
  assert.equal(resolveCategory("weather"), "weather");
  assert.equal(resolveCategory("market"), "market");
  assert.equal(resolveCategory("market-price"), "market");
  assert.equal(resolveCategory("farm-reminder"), "farmReminder");
  assert.equal(resolveCategory("unknown"), null);
  assert.equal(resolveCategory(""), null);
});

test("category update requires explicit boolean consent", () => {
  assert.equal(validateCategoryUpdate({ category: "weather" }, { enabled: true }).ok, true);
  assert.equal(validateCategoryUpdate({ category: "weather" }, { enabled: false }).ok, true);
  assert.equal(validateCategoryUpdate({ category: "weather" }, {}).ok, false);
  assert.equal(validateCategoryUpdate({ category: "weather" }, { enabled: "true" }).ok, false);
  assert.equal(validateCategoryUpdate({ category: "weather" }, { enabled: 1 }).ok, false);
  assert.equal(validateCategoryUpdate({ category: "bogus" }, { enabled: true }).code, "INVALID_SMS_CATEGORY");
});

test("phone verification is required only when enabling, never assumed", () => {
  assert.equal(assertPhoneVerified(VERIFIED_USER, { now: NOW }).ok, true);
  assert.equal(assertPhoneVerified({ ...VERIFIED_USER, phoneVerifiedAt: null }, { now: NOW }).code, "PHONE_NOT_VERIFIED");
  assert.equal(assertPhoneVerified({ ...VERIFIED_USER, phone: null }, { now: NOW }).ok, false);
  assert.equal(assertPhoneVerified({ ...VERIFIED_USER, phoneVerifiedAt: new Date(NOW.getTime() + 1000) }, { now: NOW }).ok, false);
});

test("public preferences never expose phone, tokens or credentials", () => {
  const prefs = applyCategoryChange({}, { category: "weather", enabled: true, source: "settings" }, { now: NOW });
  prefs.unsubscribeTokenHash = "secret-hash";
  const view = toPublicSmsPreferences({ preferences: prefs, user: VERIFIED_USER, now: NOW });
  const json = JSON.stringify(view);
  assert.equal(json.includes("+8801712345678"), false);
  assert.equal(json.includes("secret-hash"), false);
  assert.equal(json.includes("api_key"), false);
  assert.equal(view.categories.weather.enabled, true);
  assert.equal(view.categories.market.enabled, false);
  assert.equal(view.phone.last4, "5678");
  assert.equal(view.phone.verified, true);
  assert.equal(view.consent.givenAt, NOW.toISOString());
});

test("GET preferences returns all-off defaults for a new user", async () => {
  const model = fakeModel({});
  const controller = makeController(model);
  const res = fakeResponse();
  await controller.getPreferences({ user: VERIFIED_USER }, res, (e) => { throw e; });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.preferences.categories.weather.enabled, false);
  assert.equal(res.body.data.preferences.categories.market.enabled, false);
  assert.equal(res.body.data.preferences.categories.farmReminder.enabled, false);
  assert.equal(model.store.createCalls, 0, "GET must not create records");
});

test("PATCH enable requires verified phone and records consent timestamp", async () => {
  const unverified = { ...VERIFIED_USER, phoneVerifiedAt: null };
  const denied = fakeResponse();
  await makeController(fakeModel({}), unverified).updateCategory(
    { user: unverified, params: { category: "weather" }, body: { enabled: true } },
    denied,
    (e) => { throw e; }
  );
  assert.equal(denied.statusCode, 422);
  assert.equal(denied.body.error.code, "PHONE_NOT_VERIFIED");

  const model = fakeModel({ userId: "u1" });
  const res = fakeResponse();
  await makeController(model).updateCategory(
    { user: VERIFIED_USER, params: { category: "market" }, body: { enabled: true } },
    res,
    (e) => { throw e; }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.preferences.categories.market.enabled, true);
  assert.equal(model.store.consent.givenAt, NOW.toISOString());
  assert.equal(model.store.categories.market.subscribedAt, NOW.toISOString());
});

test("PATCH disable and unsubscribe-all revoke every category", async () => {
  const model = fakeModel({
    userId: "u1",
    categories: {
      weather: { enabled: true, subscribedAt: NOW.toISOString(), unsubscribedAt: null },
      market: { enabled: true, subscribedAt: NOW.toISOString(), unsubscribedAt: null },
      farmReminder: { enabled: false, subscribedAt: null, unsubscribedAt: null },
    },
    consent: { givenAt: NOW.toISOString(), source: "settings", revokedAt: null },
  });
  const controller = makeController(model);

  const disabled = fakeResponse();
  await controller.updateCategory({ user: VERIFIED_USER, params: { category: "weather" }, body: { enabled: false } }, disabled, (e) => { throw e; });
  assert.equal(disabled.body.data.preferences.categories.weather.enabled, false);
  assert.equal(disabled.body.data.preferences.categories.market.enabled, true, "disabling one category must not revoke others");

  const all = fakeResponse();
  await controller.unsubscribeAll({ user: VERIFIED_USER, params: {}, body: {} }, all, (e) => { throw e; });
  assert.equal(all.statusCode, 200);
  assert.equal(all.body.data.preferences.categories.weather.enabled, false);
  assert.equal(all.body.data.preferences.categories.market.enabled, false);
  assert.equal(all.body.data.preferences.categories.farmReminder.enabled, false);
  assert.ok(all.body.data.preferences.consent.revokedAt);
  assert.equal(JSON.stringify(all.body).includes("+8801712345678"), false);
});

test("a user can only ever modify their own preferences (userId from req.user)", async () => {
  const model = fakeModel({ userId: "u1" });
  let queriedWith = null;
  model.findOne = async (query) => { queriedWith = query; return null; };
  const res = fakeResponse();
  await makeController(model).updateCategory(
    { user: VERIFIED_USER, params: { category: "weather" }, body: { enabled: true, userId: "another-user" } },
    res,
    (e) => { throw e; }
  );
  assert.deepEqual(queriedWith, { userId: "u1" });
  assert.equal(model.store.userId, "u1", "caller supplied userId must be ignored");
});

test("routes require authentication, farmer role, rate limit, CSRF and own-user scoping", () => {
  const routes = readFileSync(new URL("../src/routes/v1/smsSubscription.routes.js", import.meta.url), "utf8");
  assert.match(routes, /router\.use\(authenticate\)/);
  assert.match(routes, /requireRole\("farmer"\)/);
  assert.match(routes, /rateLimit/);
  assert.match(routes, /requireSameOrigin/);
  assert.match(routes, /router\.get\("\/"/);
  assert.match(routes, /router\.patch\("\/:category"/);
  assert.match(routes, /router\.post\("\/unsubscribe-all"/);
  assert.doesNotMatch(routes, /req\.body\.userId|params\.userId/);

  const index = readFileSync(new URL("../src/routes/v1/index.js", import.meta.url), "utf8");
  assert.match(index, /smsSubscriptionRoutes/);
  assert.match(index, /router\.use\("\/sms-subscriptions", smsSubscriptionRoutes\)/);
});

test("no live SMS is triggered by subscription management", () => {
  const controller = readFileSync(new URL("../src/controllers/smsSubscription.controller.js", import.meta.url), "utf8");
  assert.doesNotMatch(controller, /sendSms|gateway|registerSmsGateway|SMS_LIVE/);
});
