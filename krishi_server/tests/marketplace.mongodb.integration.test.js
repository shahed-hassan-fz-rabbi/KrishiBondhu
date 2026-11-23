import { randomUUID } from "node:crypto";
import { isIPv4 } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import mongoose from "mongoose";

import "../src/config/env.config.js";
import { createApp } from "../src/app.js";
import { User } from "../src/models/user.model.js";
import { MarketplaceProduct } from "../src/models/marketplaceproduct.model.js";
import { signToken } from "../src/utils/token.util.js";
import { connectIsolatedTestDatabase, disconnectIsolatedTestDatabase } from "./helpers/isolatedMongo.js";

const TEST_DATABASE_PREFIX = "kb_test_";
const configuredTestUri = process.env.MONGODB_TEST_URI;

/** Validate before the shared connection helper is allowed to connect. */
export function validateLocalMarketplaceTestUri(uri) {
  if (!uri) throw new Error("MONGODB_TEST_URI is required; refusing to use MONGODB_URI.");
  if (typeof uri !== "string" || !uri.startsWith("mongodb://")) {
    throw new Error("MONGODB_TEST_URI must use a direct local mongodb:// connection.");
  }

  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("MONGODB_TEST_URI must be a valid MongoDB connection URI.");
  }

  const authority = uri.slice("mongodb://".length).split(/[/?#]/, 1)[0];
  const hostList = authority.slice(authority.lastIndexOf("@") + 1);
  if (hostList.includes(",") || parsed.searchParams.has("replicaSet")) {
    throw new Error("MONGODB_TEST_URI must target one local MongoDB host without remote replica discovery.");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const localHost = hostname === "localhost" || hostname === "::1" || (isIPv4(hostname) && hostname.startsWith("127."));
  if (!localHost) throw new Error("MONGODB_TEST_URI must target localhost or a loopback IP address.");

  let databaseName = "";
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    throw new Error("MONGODB_TEST_URI must include a valid database name.");
  }
  if (!/^kb_test_[a-z0-9_-]+$/i.test(databaseName)) {
    throw new Error("MONGODB_TEST_URI database name must start with kb_test_.");
  }
  return { hostname, databaseName };
}

test("Marketplace MongoDB test target refuses unsafe or ambiguous database URIs", () => {
  for (const unsafeUri of [
    undefined,
    "mongodb+srv://user:secret@cluster.example.test/kb_test_marketplace",
    "mongodb://db.example.test/kb_test_marketplace",
    "mongodb://127.0.0.1/production",
    "mongodb://localhost,db.example.test/kb_test_marketplace",
    "mongodb://localhost/kb_test_marketplace?replicaSet=prod",
  ]) {
    assert.throws(() => validateLocalMarketplaceTestUri(unsafeUri));
  }
  assert.deepEqual(validateLocalMarketplaceTestUri("mongodb://127.0.0.1:27017/kb_test_marketplace"), {
    hostname: "127.0.0.1",
    databaseName: "kb_test_marketplace",
  });
});

const safeTarget = configuredTestUri ? validateLocalMarketplaceTestUri(configuredTestUri) : null;

test("Marketplace CRUD workflows use isolated real MongoDB persistence", {
  skip: safeTarget ? false : "BLOCKED: MONGODB_TEST_URI is not configured; no database connection attempted.",
}, async (t) => {
  const runId = randomUUID().replaceAll("-", "");
  const databaseName = `${TEST_DATABASE_PREFIX}marketplace_${process.pid}_${runId}`;
  const fixtureIds = { userIds: [], productIds: [] };
  let server;
  let baseUrl;

  t.after(async () => {
    if (mongoose.connection.readyState === 1) {
      // Delete only IDs generated and recorded by this test. Never clear or drop a collection/database.
      await MarketplaceProduct.deleteMany({ _id: { $in: fixtureIds.productIds } });
      await User.deleteMany({ _id: { $in: fixtureIds.userIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectIsolatedTestDatabase(databaseName);
  });

  try {
    await connectIsolatedTestDatabase("marketplace_integration", databaseName);
  } catch (error) {
    if (/remote_socket_refused|server_selection_or_network_timeout/.test(error.message)) {
      t.skip("BLOCKED: the configured loopback MongoDB test service is not reachable.");
      return;
    }
    throw error;
  }

  // A loopback URI is checked before connection, then verify the established socket target too.
  const connectedHost = String(mongoose.connection.host || "").replace(/^\[|\]$/g, "").toLowerCase();
  const connectedHostIsLocal = connectedHost === "localhost" || connectedHost === "::1" || (isIPv4(connectedHost) && connectedHost.startsWith("127."));
  if (!connectedHostIsLocal || mongoose.connection.name !== databaseName) {
    await disconnectIsolatedTestDatabase(databaseName);
    throw new Error("Marketplace integration safety check refused a non-loopback or unexpected database connection.");
  }

  const marker = `KB-MONGO-${runId}`;
  const testPassword = `TestOnly-${runId}-Password!`;
  const makeUser = async (role, label) => {
    const user = await User.create({
      name: `Marketplace ${label}`,
      email: `${label}-${runId}@example.test`,
      passwordHash: await User.hashPassword(testPassword),
      role,
    });
    fixtureIds.userIds.push(user._id);
    return user;
  };

  const farmer = await makeUser("farmer", "farmer");
  const otherFarmer = await makeUser("farmer", "other-farmer");
  const officer = await makeUser("extension_officer", "officer");
  const admin = await makeUser("admin", "admin");
  const farmerToken = signToken(farmer);
  const otherFarmerToken = signToken(otherFarmer);
  const officerToken = signToken(officer);
  const adminToken = signToken(admin);

  server = http.createServer(createApp());
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

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

  async function createListing(token, listing) {
    const { response, payload } = await request("POST", "/api/v1/marketplace/products", listing, token);
    assert.equal(response.status, 201, JSON.stringify(payload.error || {}));
    const id = payload.data.product._id;
    fixtureIds.productIds.push(new mongoose.Types.ObjectId(id));
    return payload.data.product;
  }

  const baseListing = {
    description: `Fictional integration fixture ${marker}`,
    quantity: 18,
    unit: "kg",
    askingPricePerUnit: 42,
    district: "Cumilla",
    upazila: "Burichang",
  };

  await t.test("farmer creation persists a privacy-safe active listing", async () => {
    const created = await createListing(farmerToken, {
      ...baseListing,
      productName: `Potato ${marker}`,
      ownerId: otherFarmer._id.toString(),
      status: "sold_out",
      email: "must-not-be-stored@example.test",
    });
    const stored = await MarketplaceProduct.findById(created._id).lean();
    assert.ok(stored, "the created product should exist in MongoDB");
    assert.equal(stored.ownerId.toString(), farmer._id.toString());
    assert.equal(stored.status, "active");
    assert.equal(stored.productName, `Potato ${marker}`);
    assert.equal("email" in stored, false);

    const serialized = JSON.stringify(created);
    for (const privateValue of [farmer.email, farmer.phone, farmer.passwordHash, "ownerId", "googleId", "passwordHash"]) {
      assert.equal(serialized.includes(privateValue), false);
    }
  });

  await t.test("public browsing searches and filters using real MongoDB queries before pagination", async () => {
    const potato = await MarketplaceProduct.findOne({ ownerId: farmer._id, productName: `Potato ${marker}` }).lean();
    assert.ok(potato);
    const bengali = await createListing(farmerToken, { ...baseListing, productName: `আলু ${marker}` });
    const tomato = await createListing(farmerToken, { ...baseListing, productName: `Tomato ${marker}`, district: "Rangpur" });
    const foreign = await createListing(otherFarmerToken, { ...baseListing, productName: `Foreign ${marker}` });

    const english = await request("GET", `/api/v1/marketplace/products?q=${encodeURIComponent(`potato ${marker}`)}`);
    assert.equal(english.response.status, 200);
    assert.deepEqual(english.payload.data.products.map((product) => product._id), [potato._id.toString()]);

    const bangla = await request("GET", `/api/v1/marketplace/products?q=${encodeURIComponent(`আলু ${marker}`)}`);
    assert.equal(bangla.response.status, 200);
    assert.deepEqual(bangla.payload.data.products.map((product) => product._id), [bengali._id]);

    const district = await request("GET", `/api/v1/marketplace/products?district=${encodeURIComponent("cUmIlLa")}&limit=1`);
    assert.equal(district.response.status, 200);
    assert.equal(district.payload.data.products.length, 1);
    assert.equal(district.payload.data.pagination.total, 3);
    assert.equal(district.payload.data.pagination.pages, 3);
    assert.ok([potato._id, bengali._id, foreign._id].includes(district.payload.data.products[0]._id));
    const districtPageTwo = await request("GET", `/api/v1/marketplace/products?district=Cumilla&page=2&limit=1`);
    const districtPageThree = await request("GET", `/api/v1/marketplace/products?district=Cumilla&page=3&limit=1`);
    assert.equal(districtPageTwo.payload.data.pagination.total, 3);
    assert.equal(districtPageThree.payload.data.pagination.pages, 3);
    assert.equal(new Set([
      district.payload.data.products[0]._id,
      districtPageTwo.payload.data.products[0]._id,
      districtPageThree.payload.data.products[0]._id,
    ]).size, 3);

    const combined = await request("GET", `/api/v1/marketplace/products?q=${encodeURIComponent(`POTATO ${marker}`)}&district=CUMILLA`);
    assert.equal(combined.response.status, 200);
    assert.deepEqual(combined.payload.data.products.map((product) => product._id), [potato._id.toString()]);
    assert.equal(combined.payload.data.pagination.total, 1);

    const publicListing = await request("GET", `/api/v1/marketplace/products?q=${encodeURIComponent(marker)}`);
    const responseProducts = publicListing.payload.data.products;
    assert.equal(publicListing.response.status, 200);
    assert.ok(responseProducts.some((item) => item._id === tomato._id));
    assert.ok(responseProducts.every((item) => item.status === "active"));
    assert.ok(responseProducts.every((item) => !("ownerId" in item) && !("email" in item) && !("phone" in item)));
  });

  await t.test("guest checkout preview reads trusted MongoDB price and stock without reserving or changing inventory", async () => {
    const listing = await MarketplaceProduct.findOne({ ownerId: farmer._id, productName: `Potato ${marker}` }).lean();
    assert.ok(listing);
    const beforeCount = await MarketplaceProduct.countDocuments({ ownerId: farmer._id });
    const beforeUpdatedAt = listing.updatedAt.toISOString();

    const preview = await request("POST", "/api/v1/marketplace/checkout/preview", {
      productId: listing._id.toString(),
      quantity: 1.25,
      askingPricePerUnit: 0.01,
    });
    assert.equal(preview.response.status, 400, "client-supplied asking price is not accepted");

    const valid = await request("POST", "/api/v1/marketplace/checkout/preview", {
      productId: listing._id.toString(),
      quantity: 1.25,
    });
    assert.equal(valid.response.status, 200);
    assert.equal(valid.payload.data.productName, `Potato ${marker}`);
    assert.equal(valid.payload.data.unit, "kg");
    assert.equal(valid.payload.data.requestedQuantity, 1.25);
    assert.equal(valid.payload.data.availableQuantity, 18);
    assert.equal(valid.payload.data.askingPricePerUnit, 42);
    assert.equal(valid.payload.data.subtotal, 52.5);
    assert.equal(valid.payload.data.currency, "BDT");
    assert.equal(valid.payload.data.priceLabel, "farmer_set_asking_price_not_DAM_verified");
    assert.equal(valid.payload.data.previewOnly, true);
    assert.equal(valid.payload.data.orderConfirmed, false);
    assert.equal(valid.payload.data.priceLocked, false);
    assert.equal(valid.payload.data.stockReserved, false);
    for (const privateField of ["ownerId", "email", "phone", "passwordHash"]) {
      assert.equal(privateField in valid.payload.data, false);
    }

    const after = await MarketplaceProduct.findById(listing._id).lean();
    assert.equal(await MarketplaceProduct.countDocuments({ ownerId: farmer._id }), beforeCount);
    assert.equal(after.quantity, listing.quantity);
    assert.equal(after.status, listing.status);
    assert.equal(after.updatedAt.toISOString(), beforeUpdatedAt);
  });

  await t.test("mine query scopes results and counts to the authenticated farmer across statuses", async () => {
    const response = await request("GET", "/api/v1/marketplace/products/mine?limit=1", undefined, farmerToken);
    assert.equal(response.response.status, 200);
    assert.equal(response.payload.data.pagination.total, 3);
    assert.equal(response.payload.data.pagination.pages, 3);
    assert.equal(response.payload.data.products.length, 1);
    assert.ok(response.payload.data.products.every((item) => !("email" in item) && !("phone" in item) && !("passwordHash" in item)));
    assert.ok(response.payload.data.products.every((item) => !item.ownerId));

    const allMine = await request("GET", "/api/v1/marketplace/products/mine?limit=100", undefined, farmerToken);
    assert.equal(allMine.response.status, 200);
    assert.deepEqual(new Set(allMine.payload.data.products.map((item) => item.productName)), new Set([
      `Potato ${marker}`,
      `আলু ${marker}`,
      `Tomato ${marker}`,
    ]));
  });

  await t.test("owner updates asking price and quantity and MongoDB stores the confirmed values", async () => {
    const listing = await MarketplaceProduct.findOne({ ownerId: farmer._id, productName: `Potato ${marker}` });
    const update = await request("PATCH", `/api/v1/marketplace/products/${listing._id}`, { askingPricePerUnit: 55.5, quantity: 25 }, farmerToken);
    assert.equal(update.response.status, 200);
    assert.equal(update.payload.data.product.askingPricePerUnit, 55.5);
    assert.equal(update.payload.data.product.quantity, 25);
    const stored = await MarketplaceProduct.findById(listing._id).lean();
    assert.equal(stored.askingPricePerUnit, 55.5);
    assert.equal(stored.quantity, 25);
  });

  await t.test("owner moves listing between active and sold out states", async () => {
    const listing = await MarketplaceProduct.findOne({ ownerId: farmer._id, productName: `Potato ${marker}` });
    const soldOut = await request("PATCH", `/api/v1/marketplace/products/${listing._id}`, { status: "sold_out" }, farmerToken);
    assert.equal(soldOut.response.status, 200);
    assert.equal((await MarketplaceProduct.findById(listing._id).lean()).status, "sold_out");
    const active = await request("PATCH", `/api/v1/marketplace/products/${listing._id}`, { status: "active" }, farmerToken);
    assert.equal(active.response.status, 200);
    assert.equal((await MarketplaceProduct.findById(listing._id).lean()).status, "active");
  });

  await t.test("another farmer cannot edit/archive; guest and non-farmer mutations are denied", async () => {
    const listing = await MarketplaceProduct.findOne({ ownerId: farmer._id, productName: `Potato ${marker}` });
    const otherPatch = await request("PATCH", `/api/v1/marketplace/products/${listing._id}`, { quantity: 99 }, otherFarmerToken);
    const otherArchive = await request("DELETE", `/api/v1/marketplace/products/${listing._id}`, undefined, otherFarmerToken);
    assert.equal(otherPatch.response.status, 404);
    assert.equal(otherArchive.response.status, 404);

    const guestCreate = await request("POST", "/api/v1/marketplace/products", { ...baseListing, productName: `Guest ${marker}` });
    const guestPatch = await request("PATCH", `/api/v1/marketplace/products/${listing._id}`, { quantity: 99 });
    const guestArchive = await request("DELETE", `/api/v1/marketplace/products/${listing._id}`);
    const guestMine = await request("GET", "/api/v1/marketplace/products/mine");
    assert.equal(guestCreate.response.status, 401);
    assert.equal(guestPatch.response.status, 401);
    assert.equal(guestArchive.response.status, 401);
    assert.equal(guestMine.response.status, 401);

    for (const token of [officerToken, adminToken]) {
      const create = await request("POST", "/api/v1/marketplace/products", { ...baseListing, productName: `Forbidden ${marker}` }, token);
      const update = await request("PATCH", `/api/v1/marketplace/products/${listing._id}`, { quantity: 99 }, token);
      const archive = await request("DELETE", `/api/v1/marketplace/products/${listing._id}`, undefined, token);
      const mine = await request("GET", "/api/v1/marketplace/products/mine", undefined, token);
      assert.equal(create.response.status, 403);
      assert.equal(update.response.status, 403);
      assert.equal(archive.response.status, 403);
      assert.equal(mine.response.status, 403);
    }
    const stored = await MarketplaceProduct.findById(listing._id).lean();
    assert.equal(stored.quantity, 25);
    assert.equal(stored.status, "active");
  });

  await t.test("archive removes listing from public browse but keeps it private to the owner", async () => {
    const listing = await MarketplaceProduct.findOne({ ownerId: farmer._id, productName: `Potato ${marker}` });
    const archived = await request("DELETE", `/api/v1/marketplace/products/${listing._id}`, undefined, farmerToken);
    assert.equal(archived.response.status, 200);
    assert.equal(archived.payload.data.product.status, "archived");
    const stored = await MarketplaceProduct.findById(listing._id).lean();
    assert.ok(stored);
    assert.equal(stored.status, "archived");

    const publicBrowse = await request("GET", `/api/v1/marketplace/products?q=${encodeURIComponent(`Potato ${marker}`)}`);
    assert.equal(publicBrowse.response.status, 200);
    assert.deepEqual(publicBrowse.payload.data.products, []);
    assert.equal(publicBrowse.payload.data.pagination.total, 0);

    const mine = await request("GET", "/api/v1/marketplace/products/mine?limit=100", undefined, farmerToken);
    assert.equal(mine.response.status, 200);
    assert.ok(mine.payload.data.products.some((item) => item._id === listing._id.toString() && item.status === "archived"));

    for (const [method, body] of [["PATCH", { askingPricePerUnit: 60 }], ["PATCH", { status: "active" }], ["DELETE", undefined]]) {
      const rejected = await request(method, `/api/v1/marketplace/products/${listing._id}`, body, farmerToken);
      assert.equal(rejected.response.status, 404);
    }
    const stillArchived = await MarketplaceProduct.findById(listing._id).lean();
    assert.equal(stillArchived.status, "archived");
  });
});
