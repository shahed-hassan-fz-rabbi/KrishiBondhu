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
const otherFarmerId = new mongoose.Types.ObjectId();
const officerId = new mongoose.Types.ObjectId();
const adminId = new mongoose.Types.ObjectId();
const spoofedOwnerId = new mongoose.Types.ObjectId();
const productId = new mongoose.Types.ObjectId();
const farmer = { _id: farmerId, email: "farmer@example.test", phone: "+8801712345678", passwordHash: "private-hash", role: "farmer" };
const otherFarmer = { _id: otherFarmerId, email: "otherfarmer@example.test", phone: "+8801712345677", role: "farmer" };
const officer = { _id: officerId, email: "officer@example.test", phone: "+8801712345679", role: "extension_officer" };
const admin = { _id: adminId, email: "admin@example.test", phone: "+8801712345680", role: "admin" };
const farmerToken = signToken(farmer);
const otherFarmerToken = signToken(otherFarmer);
const officerToken = signToken(officer);
const adminToken = signToken(admin);

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

function installBrowseDatasetMocks(t, inventory) {
  const filters = [];
  const matches = (product, filter) => {
    if (product.status !== filter.status) return false;
    if (filter.productName && !new RegExp(filter.productName.$regex, filter.productName.$options).test(product.productName)) return false;
    if (filter.district && !new RegExp(filter.district.$regex, filter.district.$options).test(product.district)) return false;
    return true;
  };

  t.mock.method(MarketplaceProduct, "find", (filter) => {
    filters.push(filter);
    let offset = 0;
    let pageSize = inventory.length;
    return {
      sort(sort) { assert.deepEqual(sort, { createdAt: -1, _id: -1 }); return this; },
      skip(value) { offset = value; return this; },
      limit(value) { pageSize = value; return this; },
      select(fields) { assert.doesNotMatch(fields, /ownerId|email|phone|passwordHash/); return this; },
      lean: async () => inventory
        .filter((product) => matches(product, filter))
        .sort((a, b) => b.createdAt - a.createdAt || String(b._id).localeCompare(String(a._id)))
        .slice(offset, offset + pageSize),
    };
  });
  t.mock.method(MarketplaceProduct, "countDocuments", async (filter) => {
    filters.push(filter);
    return inventory.filter((product) => matches(product, filter)).length;
  });
  return filters;
}

function browseInventory() {
  const date = (day) => new Date(`2026-11-${String(day).padStart(2, "0")}T00:00:00.000Z`);
  return [
    publicProduct({ _id: new mongoose.Types.ObjectId("650000000000000000000001"), productName: "Potato", district: "Cumilla", createdAt: date(23) }),
    publicProduct({ _id: new mongoose.Types.ObjectId("650000000000000000000002"), productName: "Sweet potato", district: "Cumilla", createdAt: date(22) }),
    publicProduct({ _id: new mongoose.Types.ObjectId("650000000000000000000003"), productName: "আলু", district: "Cumilla", createdAt: date(21) }),
    publicProduct({ _id: new mongoose.Types.ObjectId("650000000000000000000004"), productName: "BRRI dhan rice", district: "Cumilla", createdAt: date(20) }),
    publicProduct({ _id: new mongoose.Types.ObjectId("650000000000000000000005"), productName: "Rice", district: "Chattogram", createdAt: date(19) }),
    publicProduct({ _id: new mongoose.Types.ObjectId("650000000000000000000006"), productName: "Rice", district: "Cumilla", createdAt: date(18) }),
    publicProduct({ _id: new mongoose.Types.ObjectId("650000000000000000000007"), productName: "Rice", district: "Cumilla", status: "sold_out", createdAt: date(17) }),
    publicProduct({ _id: new mongoose.Types.ObjectId("650000000000000000000008"), productName: "Rice", district: "Cumilla", status: "archived", createdAt: date(16) }),
    publicProduct({ _id: new mongoose.Types.ObjectId("650000000000000000000009"), productName: "Special .* produce", district: "Noakhali", createdAt: date(15) }),
  ];
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

test("public product search matches English, Bengali, and case-insensitively as literal text", async (t) => {
  const filters = installBrowseDatasetMocks(t, browseInventory());
  const english = await request("GET", "/api/v1/marketplace/products?q=Potato");
  assert.equal(english.response.status, 200);
  assert.deepEqual(english.payload.data.products.map(({ productName }) => productName), ["Potato", "Sweet potato"]);
  assert.deepEqual(filters[0], { status: "active", productName: { $regex: "Potato", $options: "i" } });

  const bengali = await request("GET", "/api/v1/marketplace/products?q=%E0%A6%86%E0%A6%B2%E0%A7%81");
  assert.equal(bengali.response.status, 200);
  assert.deepEqual(bengali.payload.data.products.map(({ productName }) => productName), ["আলু"]);
  assert.deepEqual(filters[2], { status: "active", productName: { $regex: "আলু", $options: "i" } });

  const caseInsensitive = await request("GET", "/api/v1/marketplace/products?q=RICE");
  assert.equal(caseInsensitive.response.status, 200);
  assert.deepEqual(caseInsensitive.payload.data.products.map(({ productName }) => productName), ["BRRI dhan rice", "Rice", "Rice"]);
  assert.equal(caseInsensitive.payload.data.pagination.total, 3);

  const regexCharacters = await request("GET", "/api/v1/marketplace/products?q=%2E%2A");
  assert.equal(regexCharacters.response.status, 200);
  assert.deepEqual(regexCharacters.payload.data.products.map(({ productName }) => productName), ["Special .* produce"]);
  assert.deepEqual(filters[6], { status: "active", productName: { $regex: "\\.\\*", $options: "i" } });
});

test("district is an exact case-insensitive filter and combines with search before pagination", async (t) => {
  const filters = installBrowseDatasetMocks(t, browseInventory());
  const district = await request("GET", "/api/v1/marketplace/products?district=%20cumilla%20");
  assert.equal(district.response.status, 200);
  assert.deepEqual(filters[0], { status: "active", district: { $regex: "^cumilla$", $options: "i" } });
  assert.equal(district.payload.data.pagination.total, 5);
  assert.ok(district.payload.data.products.every((product) => product.district === "Cumilla"));

  const combined = await request("GET", "/api/v1/marketplace/products?q=rice&district=CUMILLA&page=2&limit=1");
  assert.equal(combined.response.status, 200);
  assert.deepEqual(filters[2], {
    status: "active",
    productName: { $regex: "rice", $options: "i" },
    district: { $regex: "^CUMILLA$", $options: "i" },
  });
  assert.deepEqual(combined.payload.data.products.map(({ productName }) => productName), ["Rice"]);
  assert.deepEqual(combined.payload.data.pagination, { page: 2, limit: 1, total: 2, pages: 2 });
  assert.deepEqual(filters[3], filters[2], "countDocuments uses the same combined filters as find");

  const noMatch = await request("GET", "/api/v1/marketplace/products?q=dragon&district=Cumilla");
  assert.equal(noMatch.response.status, 200);
  assert.deepEqual(noMatch.payload.data.products, []);
  assert.deepEqual(noMatch.payload.data.pagination, { page: 1, limit: 20, total: 0, pages: 0 });

  const reset = await request("GET", "/api/v1/marketplace/products");
  assert.equal(reset.response.status, 200);
  assert.deepEqual(filters[6], { status: "active" });
  assert.equal(reset.payload.data.pagination.total, 7, "clearing filters restores every active listing");
});

test("Marketplace search rejects malformed, oversized, control-character, and operator query inputs before database access", async (t) => {
  let findCalls = 0;
  let countCalls = 0;
  t.mock.method(MarketplaceProduct, "find", () => { findCalls += 1; throw new Error("Invalid filters must not query products"); });
  t.mock.method(MarketplaceProduct, "countDocuments", () => { countCalls += 1; throw new Error("Invalid filters must not count products"); });
  const invalidQueries = [
    "?q=one&q=two",
    `?q=${"a".repeat(101)}`,
    `?district=${"a".repeat(81)}`,
    "?q=bad%00value",
    "?q%5B%24ne%5D=anything",
    "?status%5B%24ne%5D=archived",
  ];

  for (const query of invalidQueries) {
    const { response, payload } = await request("GET", `/api/v1/marketplace/products${query}`);
    assert.equal(response.status, 400, query);
    assert.equal(payload.error.code, "INVALID_QUERY", query);
  }
  assert.equal(findCalls, 0);
  assert.equal(countCalls, 0);
});

test("GET marketplace products/mine returns only the farmer's listings across every status with safe pagination", async (t) => {
  t.mock.method(User, "findById", async (id) => String(id) === String(farmerId) ? farmer : null);
  const inventory = [
    publicProduct({ _id: new mongoose.Types.ObjectId("650000000000000000000011"), ownerId: farmerId, status: "active", createdAt: new Date("2026-11-23T00:00:00.000Z") }),
    publicProduct({ _id: new mongoose.Types.ObjectId("650000000000000000000012"), ownerId: farmerId, status: "sold_out", createdAt: new Date("2026-11-22T00:00:00.000Z") }),
    publicProduct({ _id: new mongoose.Types.ObjectId("650000000000000000000013"), ownerId: farmerId, status: "archived", createdAt: new Date("2026-11-21T00:00:00.000Z") }),
    publicProduct({ _id: new mongoose.Types.ObjectId("650000000000000000000014"), ownerId: otherFarmerId, status: "active", productName: "Other farmer's rice", createdAt: new Date("2026-11-24T00:00:00.000Z") }),
  ];
  const filters = [];
  let selectedFields;
  t.mock.method(MarketplaceProduct, "find", (filter) => {
    filters.push(filter);
    let offset = 0;
    let pageSize = 20;
    return {
      sort(sort) { assert.deepEqual(sort, { createdAt: -1, _id: -1 }); return this; },
      skip(value) { offset = value; return this; },
      limit(value) { pageSize = value; return this; },
      select(fields) { selectedFields = fields; return this; },
      lean: async () => inventory
        .filter((product) => String(product.ownerId) === String(filter.ownerId))
        .sort((a, b) => b.createdAt - a.createdAt || String(b._id).localeCompare(String(a._id)))
        .slice(offset, offset + pageSize)
        .map(({ _id, productName, description, quantity, unit, askingPricePerUnit, district, upazila, status, createdAt, updatedAt }) => ({ _id, productName, description, quantity, unit, askingPricePerUnit, district, upazila, status, createdAt, updatedAt })),
    };
  });
  t.mock.method(MarketplaceProduct, "countDocuments", async (filter) => {
    filters.push(filter);
    return inventory.filter((product) => String(product.ownerId) === String(filter.ownerId)).length;
  });

  const firstPage = await request("GET", "/api/v1/marketplace/products/mine?limit=2", undefined, farmerToken);
  assert.equal(firstPage.response.status, 200);
  assert.deepEqual(firstPage.payload.data.products.map(({ status }) => status), ["active", "sold_out"]);
  assert.deepEqual(firstPage.payload.data.pagination, { page: 1, limit: 2, total: 3, pages: 2 });
  assert.deepEqual(filters, [{ ownerId: farmerId }, { ownerId: farmerId }]);
  assert.match(selectedFields, /_id productName description quantity unit askingPricePerUnit district upazila status createdAt updatedAt/);
  assert.doesNotMatch(selectedFields, /ownerId|email|phone|password|session|googleId/);
  const serialized = JSON.stringify(firstPage.payload.data.products);
  assert.equal(serialized.includes("Other farmer's rice"), false);
  for (const privateValue of [farmer.email, farmer.phone, farmer.passwordHash, "ownerId", "session", "googleId"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.equal("ownerId" in firstPage.payload.data.products[0], false);
  assert.equal("email" in firstPage.payload.data.products[0], false);

  filters.length = 0;
  const secondPage = await request("GET", "/api/v1/marketplace/products/mine?page=2&limit=2", undefined, farmerToken);
  assert.equal(secondPage.response.status, 200);
  assert.deepEqual(secondPage.payload.data.products.map(({ status }) => status), ["archived"]);
  assert.deepEqual(secondPage.payload.data.pagination, { page: 2, limit: 2, total: 3, pages: 2 });
  assert.deepEqual(filters, [{ ownerId: farmerId }, { ownerId: farmerId }]);

  filters.length = 0;
  const allStatuses = await request("GET", "/api/v1/marketplace/products/mine?limit=100", undefined, farmerToken);
  assert.equal(allStatuses.response.status, 200);
  assert.deepEqual(allStatuses.payload.data.products.map(({ status }) => status), ["active", "sold_out", "archived"]);
  assert.deepEqual(allStatuses.payload.data.pagination, { page: 1, limit: 100, total: 3, pages: 1 });
});

test("GET marketplace products/mine requires a farmer role and excludes guest, officer, and admin", async (t) => {
  const guest = await request("GET", "/api/v1/marketplace/products/mine");
  assert.equal(guest.response.status, 401);
  assert.equal(guest.payload.error.code, "UNAUTHORIZED");

  t.mock.method(User, "findById", async (id) => {
    if (String(id) === String(officerId)) return officer;
    if (String(id) === String(adminId)) return admin;
    return null;
  });
  let findCalls = 0;
  let countCalls = 0;
  t.mock.method(MarketplaceProduct, "find", () => { findCalls += 1; throw new Error("Non-farmers must not query owner listings"); });
  t.mock.method(MarketplaceProduct, "countDocuments", () => { countCalls += 1; throw new Error("Non-farmers must not count owner listings"); });
  for (const token of [officerToken, adminToken]) {
    const denied = await request("GET", "/api/v1/marketplace/products/mine", undefined, token);
    assert.equal(denied.response.status, 403);
    assert.equal(denied.payload.error.code, "FORBIDDEN");
  }
  assert.equal(findCalls, 0);
  assert.equal(countCalls, 0);
});

test("GET marketplace products/mine returns an empty paginated result and rejects unsafe query parameters before database access", async (t) => {
  t.mock.method(User, "findById", async (id) => String(id) === String(farmerId) ? farmer : null);
  let findCalls = 0;
  let countCalls = 0;
  t.mock.method(MarketplaceProduct, "find", () => {
    findCalls += 1;
    return {
      sort() { return this; }, skip() { return this; }, limit() { return this; }, select() { return this; },
      lean: async () => [],
    };
  });
  t.mock.method(MarketplaceProduct, "countDocuments", async () => { countCalls += 1; return 0; });

  const empty = await request("GET", "/api/v1/marketplace/products/mine", undefined, farmerToken);
  assert.equal(empty.response.status, 200);
  assert.deepEqual(empty.payload.data.products, []);
  assert.deepEqual(empty.payload.data.pagination, { page: 1, limit: 20, total: 0, pages: 0 });

  for (const [query, code] of [
    [`?ownerId=${spoofedOwnerId}`, "INVALID_QUERY"],
    ["?page=1&page=2", "INVALID_PAGINATION"],
    ["?limit=20&limit=10", "INVALID_PAGINATION"],
    ["?page=1e2", "INVALID_PAGINATION"],
    ["?limit=101", "INVALID_PAGINATION"],
    ["?page=100000000&limit=100", "INVALID_PAGINATION"],
    ["?status=archived", "INVALID_QUERY"],
    ["?limit%5B%24gt%5D=1", "INVALID_QUERY"],
  ]) {
    const invalid = await request("GET", `/api/v1/marketplace/products/mine${query}`, undefined, farmerToken);
    assert.equal(invalid.response.status, 400, query);
    assert.equal(invalid.payload.error.code, code, query);
  }
  assert.equal(findCalls, 1, "only the valid empty request reaches find");
  assert.equal(countCalls, 1, "only the valid empty request reaches count");
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
    { ...validListing, askingPricePerUnit: 0.001 },
    { ...validListing, askingPricePerUnit: 0.009 },
    { ...validListing, askingPricePerUnit: -1 },
    { ...validListing, askingPricePerUnit: "3200" },
    { ...validListing, askingPricePerUnit: Number.MAX_SAFE_INTEGER + 1 },
    { ...validListing, quantity: 0 },
    { ...validListing, quantity: 0.001 },
    { ...validListing, quantity: 0.009 },
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

test("minimum quantity and asking price of 0.01 are accepted by the API", async (t) => {
  t.mock.method(User, "findById", async (id) => String(id) === String(farmerId) ? farmer : null);
  let createCalls = 0;
  let createdInput;
  t.mock.method(MarketplaceProduct, "create", async (input) => {
    createCalls += 1;
    createdInput = input;
    return new MarketplaceProduct({ ...input, _id: new mongoose.Types.ObjectId() });
  });
  t.mock.method(MarketplaceProduct, "findById", (id) => selectedQuery(() => {
    const document = new MarketplaceProduct({ ...createdInput, _id: id });
    const result = document.toObject();
    delete result.ownerId;
    return result;
  }));

  const { response, payload } = await request("POST", "/api/v1/marketplace/products", {
    ...validListing,
    quantity: 0.01,
    askingPricePerUnit: 0.01,
  }, farmerToken);
  assert.equal(response.status, 201);
  assert.equal(createCalls, 1);
  assert.equal(createdInput.quantity, 0.01);
  assert.equal(createdInput.askingPricePerUnit, 0.01);
  assert.equal(payload.data.product.quantity, 0.01);
  assert.equal(payload.data.product.askingPricePerUnit, 0.01);
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
  assert.deepEqual(paths.status.options.enum, ["active", "sold_out", "archived"]);
  const invalid = new MarketplaceProduct({ ...validListing, ownerId: farmerId, askingPricePerUnit: 0 });
  assert.ok(invalid.validateSync().errors.askingPricePerUnit);
});

test("owner can partially update an owned listing with an atomic ownership-scoped query", async (t) => {
  t.mock.method(User, "findById", async (id) => String(id) === String(farmerId) ? farmer : null);
  let queryFilter;
  let update;
  let options;
  let selectedFields;
  t.mock.method(MarketplaceProduct, "findOneAndUpdate", (filter, changes, opts) => {
    queryFilter = filter;
    update = changes;
    options = opts;
    return selectedQuery((fields) => {
      selectedFields = fields;
      return publicProduct({ _id: productId, productName: "Updated rice", status: "sold_out" });
    });
  });

  const { response, payload } = await request("PATCH", `/api/v1/marketplace/products/${productId}`, { productName: "Updated rice", status: "sold_out" }, farmerToken);
  assert.equal(response.status, 200);
  assert.equal(payload.data.product.productName, "Updated rice");
  assert.equal(payload.data.product.status, "sold_out");
  assert.deepEqual(queryFilter, { _id: productId.toString(), ownerId: farmerId, status: { $ne: "archived" } });
  assert.deepEqual(update, { $set: { productName: "Updated rice", status: "sold_out" } });
  assert.deepEqual(options, { new: true, runValidators: true });
  assert.doesNotMatch(selectedFields, /ownerId|email|phone|passwordHash/);
  assert.equal("ownerId" in payload.data.product, false);
});

test("another farmer cannot update or delete a listing they do not own", async (t) => {
  t.mock.method(User, "findById", async (id) => String(id) === String(otherFarmerId) ? otherFarmer : null);
  const filters = [];
  t.mock.method(MarketplaceProduct, "findOneAndUpdate", (filter) => {
    filters.push(filter);
    return selectedQuery(() => null);
  });

  const update = await request("PATCH", `/api/v1/marketplace/products/${productId}`, { productName: "Stolen listing" }, otherFarmerToken);
  const remove = await request("DELETE", `/api/v1/marketplace/products/${productId}`, undefined, otherFarmerToken);
  assert.equal(update.response.status, 404);
  assert.equal(remove.response.status, 404);
  assert.equal(update.payload.error.code, "NOT_FOUND");
  assert.equal(remove.payload.error.code, "NOT_FOUND");
  assert.deepEqual(filters, [
    { _id: productId.toString(), ownerId: otherFarmerId, status: { $ne: "archived" } },
    { _id: productId.toString(), ownerId: otherFarmerId, status: { $ne: "archived" } },
  ]);
});

test("guest and extension officer are denied edit and delete", async (t) => {
  const guestPatch = await request("PATCH", `/api/v1/marketplace/products/${productId}`, { productName: "No auth" });
  const guestDelete = await request("DELETE", `/api/v1/marketplace/products/${productId}`);
  assert.equal(guestPatch.response.status, 401);
  assert.equal(guestDelete.response.status, 401);

  t.mock.method(User, "findById", async (id) => String(id) === String(officerId) ? officer : null);
  let updateCalls = 0;
  t.mock.method(MarketplaceProduct, "findOneAndUpdate", async () => { updateCalls += 1; });
  const officerPatch = await request("PATCH", `/api/v1/marketplace/products/${productId}`, { productName: "No role" }, officerToken);
  const officerDelete = await request("DELETE", `/api/v1/marketplace/products/${productId}`, undefined, officerToken);
  assert.equal(officerPatch.response.status, 403);
  assert.equal(officerDelete.response.status, 403);
  assert.equal(updateCalls, 0);
});

test("patch rejects empty, invalid, archived-status, owner, and protected-field updates before database access", async (t) => {
  t.mock.method(User, "findById", async (id) => String(id) === String(farmerId) ? farmer : null);
  let updateCalls = 0;
  t.mock.method(MarketplaceProduct, "findOneAndUpdate", async () => { updateCalls += 1; });
  const invalidBodies = [
    {},
    { askingPricePerUnit: 0 },
    { askingPricePerUnit: 0.009 },
    { askingPricePerUnit: "100" },
    { quantity: 0 },
    { quantity: 0.009 },
    { quantity: "10" },
    { status: "archived" },
    { ownerId: String(spoofedOwnerId) },
    { _id: String(spoofedOwnerId) },
    { createdAt: "2026-01-01T00:00:00.000Z" },
    { updatedAt: "2026-01-01T00:00:00.000Z" },
    { email: "attacker@example.test" },
    { passwordHash: "attacker-value" },
  ];

  for (const body of invalidBodies) {
    const { response, payload } = await request("PATCH", `/api/v1/marketplace/products/${productId}`, body, farmerToken);
    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "VALIDATION_ERROR");
  }
  assert.equal(updateCalls, 0);
});

test("owner can archive a listing without deleting it", async (t) => {
  t.mock.method(User, "findById", async (id) => String(id) === String(farmerId) ? farmer : null);
  let queryFilter;
  let update;
  let deleteCalls = 0;
  t.mock.method(MarketplaceProduct, "findOneAndUpdate", (filter, changes) => {
    queryFilter = filter;
    update = changes;
    return selectedQuery(() => publicProduct({ _id: productId, status: "archived" }));
  });
  t.mock.method(MarketplaceProduct, "deleteOne", async () => { deleteCalls += 1; });

  const { response, payload } = await request("DELETE", `/api/v1/marketplace/products/${productId}`, undefined, farmerToken);
  assert.equal(response.status, 200);
  assert.equal(payload.data.product.status, "archived");
  assert.deepEqual(queryFilter, { _id: productId.toString(), ownerId: farmerId, status: { $ne: "archived" } });
  assert.deepEqual(update, { $set: { status: "archived" } });
  assert.equal(deleteCalls, 0);
});

test("archived listings are excluded from public browse and cannot be reactivated", async (t) => {
  let browseFilter;
  t.mock.method(MarketplaceProduct, "find", (filter) => {
    browseFilter = filter;
    return {
      sort() { return this; }, skip() { return this; }, limit() { return this; }, select() { return this; },
      lean: async () => [publicProduct({ status: "active" })],
    };
  });
  t.mock.method(MarketplaceProduct, "countDocuments", async (filter) => {
    assert.deepEqual(filter, { status: "active" });
    return 1;
  });
  const browse = await request("GET", "/api/v1/marketplace/products");
  assert.equal(browse.response.status, 200);
  assert.deepEqual(browseFilter, { status: "active" });
  assert.ok(browse.payload.data.products.every((item) => item.status === "active"));

  t.mock.method(User, "findById", async (id) => String(id) === String(farmerId) ? farmer : null);
  let queryFilter;
  t.mock.method(MarketplaceProduct, "findOneAndUpdate", (filter) => {
    queryFilter = filter;
    return selectedQuery(() => null);
  });
  for (const body of [{ status: "active" }, { productName: "Edit archived listing" }]) {
    const archivedUpdate = await request("PATCH", `/api/v1/marketplace/products/${productId}`, body, farmerToken);
    assert.equal(archivedUpdate.response.status, 404);
    assert.deepEqual(queryFilter, { _id: productId.toString(), ownerId: farmerId, status: { $ne: "archived" } });
  }
});

test("malformed product IDs return 400 without querying the database", async (t) => {
  t.mock.method(User, "findById", async (id) => String(id) === String(farmerId) ? farmer : null);
  let updateCalls = 0;
  t.mock.method(MarketplaceProduct, "findOneAndUpdate", async () => { updateCalls += 1; });
  for (const method of ["PATCH", "DELETE"]) {
    const { response, payload } = await request(method, "/api/v1/marketplace/products/not-an-object-id", method === "PATCH" ? { productName: "Valid" } : undefined, farmerToken);
    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "INVALID_ID");
  }
  assert.equal(updateCalls, 0);
});
