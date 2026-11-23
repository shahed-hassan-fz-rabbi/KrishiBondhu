import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import mongoose from "mongoose";

import "../src/config/env.config.js";
import { createApp } from "../src/app.js";
import { User } from "../src/models/user.model.js";
import { MarketplaceProduct } from "../src/models/marketplaceproduct.model.js";
import { signToken } from "../src/utils/token.util.js";

let server;
let baseUrl;
const farmerId = new mongoose.Types.ObjectId();
const officerId = new mongoose.Types.ObjectId();
const spoofedOwnerId = new mongoose.Types.ObjectId();
const farmer = { _id: farmerId, email: "farmer@example.test", phone: "+8801712345678", passwordHash: "private-hash", role: "farmer" };
const officer = { _id: officerId, email: "officer@example.test", phone: "+8801712345679", role: "extension_officer" };
const farmerToken = signToken(farmer);
const officerToken = signToken(officer);

const validListing = {
  productName: "BRRI dhan rice",
  description: "Fresh harvest, stored dry.",
  quantity: 12.5,
  unit: "quintal",
  askingPricePerUnit: 3200,
  district: "Cumilla",
  upazila: "Burichang",
};

function publicProduct(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    ...validListing,
    status: "active",
    createdAt: new Date("2026-11-23T00:00:00.000Z"),
    updatedAt: new Date("2026-11-23T00:00:00.000Z"),
    ...overrides,
  };
}

function selectedQuery(resolve) {
  return {
    select(fields) { this.fields = fields; return this; },
    lean() { return Promise.resolve(resolve(this.fields)); },
  };
}

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

before(async () => {
  server = http.createServer(createApp());
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("GET marketplace products is public, active-only, paginated, and privacy-safe", async (t) => {
  let filter;
  let skip;
  let limit;
  let selectedFields;
  const items = [publicProduct({ productName: "Newest" }), publicProduct({ productName: "Older" })];
  t.mock.method(MarketplaceProduct, "find", (query) => {
    filter = query;
    return {
      sort(sort) { assert.deepEqual(sort, { createdAt: -1, _id: -1 }); return this; },
      skip(value) { skip = value; return this; },
      limit(value) { limit = value; return this; },
      select(fields) { selectedFields = fields; return this; },
      lean: async () => items,
    };
  });
  t.mock.method(MarketplaceProduct, "countDocuments", async (query) => {
    assert.deepEqual(query, { status: "active" });
    return 5;
  });

  const { response, payload } = await request("GET", "/api/v1/marketplace/products?page=2&limit=2");
  assert.equal(response.status, 200);
  assert.deepEqual(filter, { status: "active" });
  assert.equal(skip, 2);
  assert.equal(limit, 2);
  assert.equal(payload.data.products.length, 2);
  assert.deepEqual(payload.data.pagination, { page: 2, limit: 2, total: 5, pages: 3 });
  assert.match(selectedFields, /productName/);
  assert.doesNotMatch(selectedFields, /ownerId|email|phone|passwordHash|googleId/);
  const serialized = JSON.stringify(payload.data.products);
  for (const privateValue of [farmer.email, farmer.phone, farmer.passwordHash, "ownerId", "googleId"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("guest cannot create a marketplace product (401)", async () => {
  const { response, payload } = await request("POST", "/api/v1/marketplace/products", validListing);
  assert.equal(response.status, 401);
  assert.equal(payload.error.code, "UNAUTHORIZED");
});

test("authenticated farmer creates listing with JWT owner; client cannot spoof ownership/status", async (t) => {
  t.mock.method(User, "findById", async (id) => String(id) === String(farmerId) ? farmer : null);
  let createdInput;
  t.mock.method(MarketplaceProduct, "create", async (input) => {
    createdInput = input;
    return new MarketplaceProduct({ ...input, _id: new mongoose.Types.ObjectId() });
  });
  let responseFields;
  t.mock.method(MarketplaceProduct, "findById", (id) => selectedQuery((fields) => {
    responseFields = fields;
    const document = new MarketplaceProduct({ ...createdInput, _id: id });
    const result = document.toObject();
    delete result.ownerId;
    return result;
  }));

  const { response, payload } = await request("POST", "/api/v1/marketplace/products", {
    ...validListing,
    ownerId: String(spoofedOwnerId),
    status: "sold_out",
    email: "attacker@example.test",
  }, farmerToken);
  assert.equal(response.status, 201);
  assert.equal(createdInput.ownerId.toString(), farmerId.toString());
  assert.notEqual(createdInput.ownerId.toString(), spoofedOwnerId.toString());
  assert.equal(createdInput.status, undefined);
  assert.equal(createdInput.email, undefined);
  assert.equal(payload.data.product.status, "active");
  assert.equal("ownerId" in payload.data.product, false);
  assert.equal("email" in payload.data.product, false);
  assert.doesNotMatch(responseFields, /ownerId|email|phone|passwordHash/);
});

test("extension officer cannot create farmer listings (403)", async (t) => {
  t.mock.method(User, "findById", async (id) => String(id) === String(officerId) ? officer : null);
  const { response, payload } = await request("POST", "/api/v1/marketplace/products", validListing, officerToken);
  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "FORBIDDEN");
});

test("invalid listing fields and unsupported units are rejected", async (t) => {
  t.mock.method(User, "findById", async (id) => String(id) === String(farmerId) ? farmer : null);
  let createCalls = 0;
  t.mock.method(MarketplaceProduct, "create", async () => { createCalls += 1; });
  const invalidInputs = [
    { ...validListing, askingPricePerUnit: 0 },
    { ...validListing, askingPricePerUnit: -1 },
    { ...validListing, askingPricePerUnit: "3200" },
    { ...validListing, askingPricePerUnit: Number.MAX_SAFE_INTEGER + 1 },
    { ...validListing, quantity: 0 },
    { ...validListing, quantity: -2 },
    { ...validListing, quantity: "12" },
    { ...validListing, quantity: Number.MAX_SAFE_INTEGER + 1 },
    { ...validListing, unit: "bag" },
    { ...validListing, productName: " " },
    { ...validListing, district: "" },
    { ...validListing, upazila: "" },
    { ...validListing, description: 123 },
  ];

  for (const body of invalidInputs) {
    const { response, payload } = await request("POST", "/api/v1/marketplace/products", body, farmerToken);
    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "VALIDATION_ERROR");
    assert.ok(payload.error.details.length > 0);
  }
  assert.equal(createCalls, 0);
});

test("pagination rejects malformed or excessive values", async () => {
  for (const query of ["?page=0", "?page=1abc", "?limit=101", "?limit=-1", "?page=100000000&limit=100"]) {
    const { response, payload } = await request("GET", `/api/v1/marketplace/products${query}`);
    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "INVALID_PAGINATION");
  }
});

test("schema keeps marketplace asking prices distinct and constrains fields", () => {
  const paths = MarketplaceProduct.schema.paths;
  assert.equal(paths.ownerId.options.ref, "User");
  assert.deepEqual(paths.unit.options.enum, ["kg", "quintal", "ton"]);
  assert.deepEqual(paths.status.options.enum, ["active", "sold_out"]);
  const invalid = new MarketplaceProduct({ ...validListing, ownerId: farmerId, askingPricePerUnit: 0 });
  assert.ok(invalid.validateSync().errors.askingPricePerUnit);
});
