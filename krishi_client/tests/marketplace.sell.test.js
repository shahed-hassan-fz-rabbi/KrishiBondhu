import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMarketplaceProduct } from "../services/api.js";

const sellForm = readFileSync(new URL("../components/marketplace/MarketplaceSellForm.js", import.meta.url), "utf8");
const sellPage = readFileSync(new URL("../app/(public-data)/marketplace/sell/page.js", import.meta.url), "utf8");
const browse = readFileSync(new URL("../components/marketplace/MarketplaceBrowse.js", import.meta.url), "utf8");
const backendRoute = readFileSync(new URL("../../krishi_server/src/routes/v1/marketplace.routes.js", import.meta.url), "utf8");

test("sell page uses the existing session for guest, farmer, and restricted-role states", () => {
  assert.match(sellPage, /MarketplaceSellForm/);
  assert.match(sellForm, /useAuth\(\)/);
  assert.match(sellForm, /isLoading \? <p role="status"/);
  assert.match(sellForm, /!user \? <section/);
  assert.match(sellForm, /user\.role !== "farmer" \? <section/);
  assert.match(sellForm, /\/login\?redirect=%2Fmarketplace%2Fsell/);
  assert.match(sellForm, /\/register\?redirect=%2Fmarketplace%2Fsell/);
  assert.match(sellForm, /server/);
  assert.match(backendRoute, /router\.post\("\/products", authenticate, requireRole\("farmer"\), createMarketplaceProduct\)/);
});

test("sell form exposes all backend-supported fields and matching validation boundaries", () => {
  for (const field of ["productName", "description", "quantity", "unit", "askingPricePerUnit", "district", "upazila"]) {
    assert.match(sellForm, new RegExp(`name="${field}"`));
  }
  assert.match(sellForm, /name="productName"[\s\S]*maxLength=\{100\}/);
  assert.match(sellForm, /name="quantity"[\s\S]*min="0\.01"/);
  assert.match(sellForm, /name="askingPricePerUnit"[\s\S]*min="0\.01"/);
  assert.match(sellForm, /name="district"[\s\S]*maxLength=\{80\}/);
  assert.match(sellForm, /name="upazila"[\s\S]*maxLength=\{80\}/);
  assert.match(sellForm, /name="description"[\s\S]*maxLength=\{2000\}/);
  assert.match(sellForm, /const UNITS = \["kg", "quintal", "ton"\]/);
  assert.match(sellForm, /aria-invalid/);
  assert.match(sellForm, /aria-describedby/);
  assert.match(sellForm, /priceNotice/);
  assert.match(sellForm, /IntersectionObserver/);
  assert.match(sellForm, /kb-marketplace-sell-page-visible/);
  assert.match(sellForm, /data-bondhu-no-fly/);
});

test("sell form prevents duplicate submission and confirms only server-created listings", () => {
  assert.match(sellForm, /if \(inFlight\.current \|\| user\?\.role !== "farmer"\) return/);
  assert.match(sellForm, /disabled=\{isSubmitting\}/);
  assert.match(sellForm, /result\.success && result\.data\?\.product/);
  assert.match(sellForm, /status === 401/);
  assert.match(sellForm, /status === 403/);
  assert.match(sellForm, /result\.error\?\.details/);
  assert.match(sellForm, /\/marketplace/);
});

test("create API preserves backend authorization failures and validation errors", async () => {
  const originalFetch = globalThis.fetch;
  const statuses = [401, 403, 400];
  const results = [];
  try {
    for (const status of statuses) {
      globalThis.fetch = async () => ({
        ok: false,
        status,
        statusText: "Mock error",
        json: async () => ({ error: { code: status === 400 ? "VALIDATION_ERROR" : status === 403 ? "FORBIDDEN" : "UNAUTHORIZED", message: "Rejected", details: [{ field: "quantity", message: "Quantity must be at least 0.01." }] } }),
      });
      results.push(await createMarketplaceProduct({ productName: "Potato" }));
    }
  } finally { globalThis.fetch = originalFetch; }
  assert.deepEqual(results.map((result) => result.status), statuses);
  assert.deepEqual(results.map((result) => result.error.code), ["UNAUTHORIZED", "FORBIDDEN", "VALIDATION_ERROR"]);
});

test("public Marketplace browsing remains available and links to selling", () => {
  assert.match(browse, /fetchMarketplaceProducts/);
  assert.match(browse, /href="\/marketplace\/sell"/);
  assert.match(browse, /Farmer asking price/);
  assert.match(browse, /Not a DAM-verified price/);
});
