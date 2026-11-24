import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (parts) => readFileSync(path.join(root, ...parts), "utf8");

test("API client exposes admin moderation and Buy now endpoints with safe payloads", () => {
  const api = read(["services", "api.js"]);
  assert.match(api, /export function fetchAdminMarketplaceProducts\(/);
  assert.match(api, /\/marketplace\/admin\/products\?/);
  assert.match(api, /export function reviewMarketplaceProduct\(/);
  assert.match(api, /JSON\.stringify\(\{ decision, reason: String\(reason\)\.slice\(0, 500\) \}\)/);
  assert.match(api, /\["approve", "reject"\]\.includes\(decision\)/);
  assert.match(api, /export function createMarketplaceOrder\(/);
  assert.match(api, /JSON\.stringify\(\{ productId, quantity: Number\(quantity\) \}\)/);
  assert.match(api, /export function fetchMyMarketplaceOrders\(\)/);
  assert.match(api, /\/marketplace\/orders\/mine/);
});

test("new listings are capped per listing and clearly marked as pending admin review", () => {
  const limits = read(["lib", "marketplaceLimits.js"]);
  assert.match(limits, /MAX_LISTING_QUANTITY = 1000/);
  assert.match(limits, /quantity <= MAX_LISTING_QUANTITY/);

  const sell = read(["components", "marketplace", "MarketplaceSellForm.js"]);
  assert.match(sell, /MAX_LISTING_QUANTITY/);
  assert.match(sell, /quantity > MAX_LISTING_QUANTITY/);
  assert.match(sell, /max=\{MAX_LISTING_QUANTITY\}/);
  assert.match(sell, /reviewNotice/);
  assert.match(sell, /waiting for admin approval and is not public yet/);
});

test("farmer listings show the real approval state and any rejection note", () => {
  const ui = read(["components", "marketplace", "MarketplaceMyListings.js"]);
  assert.match(ui, /approvalStatus/);
  assert.match(ui, /pending_review.*approved.*rejected/);
  assert.match(ui, /reviewNote/);
  assert.match(ui, /data-bondhu-no-fly/);
});

test("browse has a Buy now flow that saves an order and shows farmer contact, with no payment", () => {
  const ui = read(["components", "marketplace", "MarketplaceBrowse.js"]);
  assert.match(ui, /createMarketplaceOrder\(buyTarget\._id, quantity\)/);
  assert.match(ui, /PHONE_NOT_VERIFIED/);
  assert.match(ui, /farmerContact/);
  assert.match(ui, /tel:\$\{/);
  assert.match(ui, /fetchMyMarketplaceOrders\(\)/);
  assert.doesNotMatch(ui, /checkout|paymentStatus|Add to cart/i);
});

test("admin review page is role-gated and uses the moderation API", () => {
  const component = read(["components", "marketplace", "MarketplaceReview.js"]);
  assert.match(component, /user\?\.role !== "admin"/);
  assert.match(component, /fetchAdminMarketplaceProducts\(/);
  assert.match(component, /reviewMarketplaceProduct\(product\._id, action, reason\)/);
  assert.match(component, /action === "reject" && !reason/);
  assert.match(component, /data-bondhu-no-fly/);

  const route = read(["app", "(app)", "admin", "marketplace", "page.js"]);
  assert.match(route, /PrivateAccess/);
  assert.match(route, /MarketplaceReview/);

  const nav = read(["lib", "nav.js"]);
  assert.match(nav, /\/admin\/marketplace/);
  assert.match(nav, /nav\.marketplaceReview/);
  assert.match(nav, /roles: \["admin"\]/);

  const translations = read(["lib", "i18n", "translations.js"]);
  assert.match(translations, /marketplaceReview: "Review Marketplace Listings"/);
  assert.match(translations, /marketplaceReview: "মার্কেটপ্লেস তালিকা পর্যালোচনা"/);
});

test("official daily report is referenced at the source, not embedded", () => {
  const page = read(["app", "(public-data)", "market", "page.js"]);
  assert.doesNotMatch(page, /<iframe/);
  assert.match(page, /REPORT_BASE_URL/);
  assert.match(page, /target="_blank" rel="noreferrer"/);
  assert.match(page, /official source/i);
  assert.match(page, /we do not host or republish/i);
});
