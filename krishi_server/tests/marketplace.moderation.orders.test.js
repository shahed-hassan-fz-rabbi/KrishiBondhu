import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import mongoose from "mongoose";

import "../src/config/env.config.js";
import { createApp } from "../src/app.js";
import { User } from "../src/models/user.model.js";
import { MarketplaceProduct } from "../src/models/marketplaceproduct.model.js";
import { MarketplaceOrderRequest } from "../src/models/marketplaceorderrequest.model.js";
import { signToken } from "../src/utils/token.util.js";
import { createMarketplaceOrderRequest, maxListingQuantity } from "../src/controllers/marketplace.controller.js";

let server;
let baseUrl;
const adminId = new mongoose.Types.ObjectId();
const farmerId = new mongoose.Types.ObjectId();
const buyerId = new mongoose.Types.ObjectId();
const productId = new mongoose.Types.ObjectId();

const admin = { _id: adminId, email: "admin@test.dev", phone: "+8801700000000", role: "admin" };
const farmer = { _id: farmerId, email: "farmer@test.dev", phone: "+8801711111111", role: "farmer" };
const buyer = { _id: buyerId, email: "buyer@test.dev", phone: "+8801722222222", role: "farmer", phoneVerifiedAt: new Date("2026-11-20T00:00:00.000Z") };
const unverifiedBuyer = { _id: new mongoose.Types.ObjectId(), email: "new@test.dev", phone: "+8801733333333", role: "farmer" };
const adminToken = signToken(admin);
const farmerToken = signToken(farmer);
const buyerToken = signToken(buyer);
const unverifiedToken = signToken(unverifiedBuyer);

const approvedListing = {
  _id: productId,
  ownerId: farmerId,
  productName: "Fresh potato",
  quantity: 100,
  unit: "kg",
  askingPricePerUnit: 25,
  status: "active",
  approvalStatus: "approved",
};

async function request(method, path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, payload: await response.json() };
}

/** User mocks must be chainable because both auth and controllers use .select/.lean. */
function asQuery(value) {
  if (!value) return null;
  return { ...value, select() { return this; }, lean: async () => value };
}

function mockAuth(t, byId) {
  t.mock.method(User, "findById", async (id) => {
    const key = String(id);
    for (const user of [admin, farmer, buyer, unverifiedBuyer]) {
      if (key === String(user._id)) return byId?.[key] || asQuery(user);
    }
    return null;
  });
}

before(async () => {
  server = http.createServer(createApp());
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
});

after(async () => { await new Promise((resolve) => server.close(resolve)); });

test("new listings are always created in pending_review, never public on create", async (t) => {
  mockAuth(t);
  let createdInput;
  t.mock.method(MarketplaceProduct, "create", async (input) => { createdInput = input; return { _id: productId }; });
  t.mock.method(MarketplaceProduct, "findById", () => ({
    select() { return this; },
    lean: async () => ({ ...approvedListing, approvalStatus: "pending_review" }),
  }));

  const { response, payload } = await request("POST", "/api/v1/marketplace/products", {
    productName: "Fresh potato", quantity: 10, unit: "kg", askingPricePerUnit: 25, district: "Cumilla", upazila: "Burichang",
  }, farmerToken);

  assert.equal(response.status, 201);
  assert.equal(createdInput.approvalStatus, "pending_review");
  assert.equal(createdInput.ownerId.toString(), farmerId.toString());
  assert.equal(payload.data.product.approvalStatus, "pending_review");
});

test("quantity above the configured per-listing limit is rejected", async (t) => {
  mockAuth(t);
  const previous = process.env.MARKETPLACE_MAX_LISTING_QUANTITY;
  process.env.MARKETPLACE_MAX_LISTING_QUANTITY = "50";
  t.after(() => {
    if (previous === undefined) delete process.env.MARKETPLACE_MAX_LISTING_QUANTITY;
    else process.env.MARKETPLACE_MAX_LISTING_QUANTITY = previous;
  });
  assert.equal(maxListingQuantity(), 50);

  let createCalled = false;
  t.mock.method(MarketplaceProduct, "create", async () => { createCalled = true; });
  const { response, payload } = await request("POST", "/api/v1/marketplace/products", {
    productName: "Fresh potato", quantity: 51, unit: "kg", askingPricePerUnit: 25, district: "Cumilla", upazila: "Burichang",
  }, farmerToken);
  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "VALIDATION_ERROR");
  assert.match(payload.error.details[0].message, /cannot exceed 50/);
  assert.equal(createCalled, false);
});

test("admin queue is admin-only and reviews only pending listings", async (t) => {
  mockAuth(t);
  const seenFilters = [];
  t.mock.method(MarketplaceProduct, "find", (filter) => {
    seenFilters.push(filter);
    return {
      sort() { return this; }, skip() { return this; }, limit() { return this; },
      select() { return this; }, lean: async () => [{ ...approvedListing, approvalStatus: "pending_review" }],
    };
  });
  t.mock.method(MarketplaceProduct, "countDocuments", async () => 1);

  const denied = await request("GET", "/api/v1/marketplace/admin/products", undefined, farmerToken);
  assert.equal(denied.response.status, 403);

  const ok = await request("GET", "/api/v1/marketplace/admin/products", undefined, adminToken);
  assert.equal(ok.response.status, 200);
  assert.deepEqual(seenFilters[0], { approvalStatus: "pending_review" });
  assert.equal(ok.payload.data.products.length, 1);
});

test("admin can approve or reject; reject requires a reason and non-admins are denied", async (t) => {
  mockAuth(t);
  let update;
  let filter;
  t.mock.method(MarketplaceProduct, "findOneAndUpdate", (f, changes) => {
    filter = f;
    update = changes;
    return {
      select() { return this; },
      lean: async () => ({ ...approvedListing, approvalStatus: changes.$set.approvalStatus }),
    };
  });

  const missingReason = await request("PATCH", `/api/v1/marketplace/admin/products/${productId}/review`, { decision: "reject" }, adminToken);
  assert.equal(missingReason.response.status, 400);

  const forbidden = await request("PATCH", `/api/v1/marketplace/admin/products/${productId}/review`, { decision: "approve" }, farmerToken);
  assert.equal(forbidden.response.status, 403);

  const approved = await request("PATCH", `/api/v1/marketplace/admin/products/${productId}/review`, { decision: "approve" }, adminToken);
  assert.equal(approved.response.status, 200);
  assert.deepEqual(filter, { _id: productId.toString(), approvalStatus: "pending_review" });
  assert.equal(update.$set.approvalStatus, "approved");
  assert.equal(update.$set.reviewedBy.toString(), adminId.toString());
  assert.ok(update.$set.reviewedAt);

  const rejected = await request("PATCH", `/api/v1/marketplace/admin/products/${productId}/review`, { decision: "reject", reason: "Misleading photo" }, adminToken);
  assert.equal(rejected.response.status, 200);
  assert.equal(update.$set.approvalStatus, "rejected");
  assert.equal(update.$set.reviewNote, "Misleading photo");
});

test("editing listing content sends it back to pending_review", async (t) => {
  mockAuth(t);
  let update;
  t.mock.method(MarketplaceProduct, "findOneAndUpdate", (f, changes) => {
    update = changes;
    return { select() { return this; }, lean: async () => ({ ...approvedListing, ...changes.$set }) };
  });
  const { response } = await request("PATCH", `/api/v1/marketplace/products/${productId}`, { askingPricePerUnit: 30 }, farmerToken);
  assert.equal(response.status, 200);
  assert.equal(update.$set.approvalStatus, "pending_review");
  assert.equal(update.$set.reviewNote, "");
});

function fakeRes() {
  return {
    code: 0,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("Buy now requires a verified phone (HTTP) and stores an order with farmer contact (controller)", async (t) => {
  const guest = await request("POST", "/api/v1/marketplace/orders", { productId: productId.toString(), quantity: 2 });
  assert.equal(guest.response.status, 401);

  // Direct controller call avoids stacking auth + contact findById mocks.
  t.mock.method(MarketplaceProduct, "findById", () => ({
    select() { return this; }, lean: async () => approvedListing,
  }));
  let orderInput;
  t.mock.method(MarketplaceOrderRequest, "create", async (input) => {
    orderInput = input;
    return { ...input, _id: new mongoose.Types.ObjectId(), createdAt: new Date(), currency: "BDT", status: "confirmed" };
  });
  t.mock.method(User, "findById", () => ({
    lean: async () => ({ name: "Test Farmer", phone: "+8801711111111" }),
  }));

  const unverifiedRes = fakeRes();
  await createMarketplaceOrderRequest({ body: { productId: productId.toString(), quantity: 2 }, user: unverifiedBuyer }, unverifiedRes, (error) => { throw error; });
  assert.equal(unverifiedRes.code, 403);
  assert.equal(unverifiedRes.body.error.code, "PHONE_NOT_VERIFIED");

  const res = fakeRes();
  await createMarketplaceOrderRequest({ body: { productId: productId.toString(), quantity: 2 }, user: buyer }, res, (error) => { throw error; });
  assert.equal(res.code, 201);
  assert.equal(orderInput.buyerId.toString(), buyerId.toString());
  assert.equal(orderInput.farmerId.toString(), farmerId.toString());
  assert.equal(orderInput.subtotalPaisa, 5000);
  assert.equal(res.body.data.farmerContact.phone, "+8801711111111");
  assert.equal(res.body.data.payment.collected, false);
  assert.equal(res.body.data.order.status, "confirmed");
});

test("Buy now refuses pending listings", async (t) => {
  mockAuth(t);
  t.mock.method(MarketplaceProduct, "findById", () => ({
    select() { return this; },
    lean: async () => ({ ...approvedListing, approvalStatus: "pending_review" }),
  }));
  let created = false;
  t.mock.method(MarketplaceOrderRequest, "create", async () => { created = true; });
  const { response, payload } = await request("POST", "/api/v1/marketplace/orders", { productId: productId.toString(), quantity: 1 }, buyerToken);
  assert.equal(response.status, 409);
  assert.equal(payload.error.code, "PRODUCT_NOT_APPROVED");
  assert.equal(created, false);
});

test("buyer can list only their own orders with farmer contact", async (t) => {
  mockAuth(t);
  const orderId = new mongoose.Types.ObjectId();
  t.mock.method(MarketplaceOrderRequest, "find", (filter) => {
    assert.deepEqual(filter, { buyerId });
    return {
      sort() { return this; }, limit() { return this; },
      lean: async () => [{
        _id: orderId, buyerId, farmerId, productId,
        productNameSnapshot: "Fresh potato", unitSnapshot: "kg", quantity: 2,
        subtotalPaisa: 5000, currency: "BDT", status: "confirmed", createdAt: new Date(),
      }],
    };
  });
  t.mock.method(User, "find", () => ({
    select() { return this; },
    lean: async () => [{ _id: farmerId, name: "Test Farmer", phone: "+8801711111111" }],
  }));

  const { response, payload } = await request("GET", "/api/v1/marketplace/orders/mine", undefined, buyerToken);
  assert.equal(response.status, 200);
  assert.equal(payload.data.orders.length, 1);
  assert.equal(payload.data.orders[0].farmerContact.phone, "+8801711111111");
});
