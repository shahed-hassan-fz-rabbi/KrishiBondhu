import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import mongoose from "mongoose";

import "../src/config/env.config.js";
import { createApp } from "../src/app.js";
import { MarketplaceProduct } from "../src/models/marketplaceproduct.model.js";
import { MARKETPLACE_DEMO_PRODUCTS } from "../scripts/seed-marketplace-demo-products.js";

let server;
let baseUrl;

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

async function preview(body) {
  const response = await fetch(`${baseUrl}/api/v1/marketplace/checkout/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}

function product(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    productName: "BRRI dhan rice",
    quantity: 12.5,
    unit: "quintal",
    askingPricePerUnit: 3200,
    status: "active",
    ownerId: new mongoose.Types.ObjectId(),
    ...overrides,
  };
}

function findByIdMock(t, result, inspect = () => {}) {
  let calls = 0;
  t.mock.method(MarketplaceProduct, "findById", (id) => {
    calls += 1;
    return {
      select(fields) { inspect({ id, fields }); return this; },
      lean() { return Promise.resolve(result); },
    };
  });
  return () => calls;
}

test("guest can preview an active listing using the stored farmer asking price only", async (t) => {
  const listing = product();
  let selected;
  const calls = findByIdMock(t, listing, (query) => { selected = query; });
  let writes = 0;
  for (const method of ["create", "findOneAndUpdate", "updateOne", "deleteOne", "deleteMany"]) {
    t.mock.method(MarketplaceProduct, method, () => { writes += 1; throw new Error("Preview must not write marketplace inventory"); });
  }

  const { response, payload } = await preview({ productId: listing._id.toString(), quantity: 1.25 });
  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.deepEqual(payload.data, {
    productName: "BRRI dhan rice",
    unit: "quintal",
    requestedQuantity: 1.25,
    availableQuantity: 12.5,
    askingPricePerUnit: 3200,
    subtotal: 4000,
    currency: "BDT",
    rounding: "nearest_0.01_bdt_half_up",
    priceLabel: "farmer_set_asking_price_not_DAM_verified",
    availability: { available: true, status: "active" },
    previewOnly: true,
    orderConfirmed: false,
    priceLocked: false,
    stockReserved: false,
  });
  assert.equal(selected.id, listing._id.toString());
  assert.equal(selected.fields, "productName quantity unit askingPricePerUnit status");
  for (const privateField of ["ownerId", "phone", "email", "passwordHash", "googleId"]) {
    assert.equal(privateField in payload.data, false);
  }
  assert.equal(calls(), 1);
  assert.equal(writes, 0);

  const forgedPrice = await preview({ productId: listing._id.toString(), quantity: 1.25, askingPricePerUnit: 0.01 });
  assert.equal(forgedPrice.response.status, 400);
  assert.equal(forgedPrice.payload.error.code, "VALIDATION_ERROR");
  assert.equal(calls(), 1, "unsupported client price is rejected before any product read");
  assert.equal(writes, 0);
});

test("preview rounds BDT subtotal to the nearest paisa using half-up rounding", async (t) => {
  const listing = product({ quantity: 0.05, unit: "kg", askingPricePerUnit: 0.1 });
  findByIdMock(t, listing);
  const { response, payload } = await preview({ productId: listing._id.toString(), quantity: 0.05 });
  assert.equal(response.status, 200);
  assert.equal(payload.data.subtotal, 0.01, "0.1 × 0.05 = 0.005 BDT, rounded half up to 0.01");
});

test("invalid product IDs and malformed, non-finite, or excessive quantities are rejected before database access", async (t) => {
  const calls = findByIdMock(t, product());
  const validId = new mongoose.Types.ObjectId().toString();
  const invalidBodies = [
    { productId: "not-an-object-id", quantity: 1 },
    { productId: validId },
    { productId: validId, quantity: 0 },
    { productId: validId, quantity: -1 },
    { productId: validId, quantity: 0.001 },
    { productId: validId, quantity: "1" },
    { productId: validId, quantity: null },
    { productId: validId, quantity: Number.POSITIVE_INFINITY },
    { productId: validId, quantity: Number.MAX_SAFE_INTEGER + 1 },
    { productId: validId, quantity: 1, price: 0.01 },
    [validId, 1],
    null,
  ];
  for (const body of invalidBodies) {
    const { response } = await preview(body);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(calls(), 0);
});

test("missing, sold-out, archived, and seeded demo listings cannot be previewed", async (t) => {
  t.mock.method(MarketplaceProduct, "findById", (id) => ({
    select() { return this; },
    lean() {
      if (String(id) === "650000000000000000000001") return Promise.resolve(null);
      if (String(id) === "650000000000000000000002") return Promise.resolve(product({ _id: id, status: "sold_out" }));
      return Promise.resolve(product({ _id: id, status: "archived" }));
    },
  }));

  const missing = await preview({ productId: "650000000000000000000001", quantity: 1 });
  assert.equal(missing.response.status, 404);
  assert.equal(missing.payload.error.code, "NOT_FOUND");
  for (const id of ["650000000000000000000002", "650000000000000000000003"]) {
    const unavailable = await preview({ productId: id, quantity: 1 });
    assert.equal(unavailable.response.status, 409);
    assert.equal(unavailable.payload.error.code, "PRODUCT_UNAVAILABLE");
  }

  for (const demo of MARKETPLACE_DEMO_PRODUCTS) {
    const blocked = await preview({ productId: demo.id, quantity: 1 });
    assert.equal(blocked.response.status, 409, demo.crop);
    assert.equal(blocked.payload.error.code, "DEMO_PRODUCT_UNAVAILABLE", demo.crop);
  }
});

test("quantity above stock is rejected, including decimal overages", async (t) => {
  const listing = product({ quantity: 0.3 });
  findByIdMock(t, listing);
  const over = await preview({ productId: listing._id.toString(), quantity: 0.30000000000000004 });
  assert.equal(over.response.status, 409);
  assert.equal(over.payload.error.code, "INSUFFICIENT_STOCK");
  assert.equal(over.payload.error.details.availableQuantity, 0.3);
});

test("subtotal outside the supported BDT range is rejected", async (t) => {
  const listing = product({ quantity: Number.MAX_SAFE_INTEGER, askingPricePerUnit: Number.MAX_SAFE_INTEGER });
  findByIdMock(t, listing);
  const { response, payload } = await preview({ productId: listing._id.toString(), quantity: Number.MAX_SAFE_INTEGER });
  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "VALIDATION_ERROR");
});
