import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { archiveMarketplaceProduct, fetchMyMarketplaceProducts, updateMarketplaceProduct, updateMarketplaceProductStatus } from "../services/api.js";
import { buildMarketplaceListingEditPatch, validateMarketplaceListingEdit } from "../lib/marketplaceListingEdit.js";

const component = readFileSync(new URL("../components/marketplace/MarketplaceMyListings.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/(public-data)/marketplace/my-listings/page.js", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../lib/nav.js", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/layout/AppSidebar.js", import.meta.url), "utf8");

function mockFetch(response) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (response instanceof Error) throw response;
    return { ok: response.status >= 200 && response.status < 300, status: response.status, statusText: "mock", json: async () => response.body };
  };
  return { requests, restore: () => { globalThis.fetch = originalFetch; } };
}

test("my listings API requests only the selected page and limit using the cookie session", async () => {
  const products = [{ _id: "listing-1", productName: "Potato", status: "active" }];
  const mock = mockFetch({ status: 200, body: { success: true, data: { products, pagination: { page: 2, limit: 20, total: 21, pages: 2 } } } });
  try {
    const result = await fetchMyMarketplaceProducts({ page: 2, limit: 20, ownerId: "spoof" });
    assert.equal(result.success, true);
    assert.deepEqual(result.data.products, products);
    assert.match(mock.requests[0].url, /\/marketplace\/products\/mine\?page=2&limit=20$/);
    assert.equal(mock.requests[0].options.credentials, "include");
    assert.equal(mock.requests[0].options.cache, "no-store");
  } finally { mock.restore(); }
});

test("my listings API preserves 401 and 403 authorization responses", async () => {
  for (const status of [401, 403]) {
    const mock = mockFetch({ status, body: { error: { code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: "Rejected" } } });
    try {
      const result = await fetchMyMarketplaceProducts();
      assert.equal(result.success, false);
      assert.equal(result.status, status);
    } finally { mock.restore(); }
  }
});

test("my listings route and component gate the farmer-only dashboard before requesting private listings", () => {
  assert.match(route, /MarketplaceMyListings/);
  assert.match(component, /useAuth\(\)/);
  assert.match(component, /user\?\.role !== "farmer"/);
  assert.match(component, /if \(authLoading \|\| user\?\.role !== "farmer"\) return/);
  assert.match(component, /!user\) return/);
  assert.match(component, /response\.status === 401/);
  assert.match(component, /response\.status === 403/);
  assert.match(navigation, /href: "\/marketplace\/my-listings", key: "nav\.marketplaceListings", roles: \["farmer"\]/);
  assert.match(sidebar, /"\/marketplace\/my-listings": Store/);
});

test("dashboard displays all listing fields, all statuses, pagination, and read-only empty/error states", () => {
  for (const field of ["productName", "description", "quantity", "askingPricePerUnit", "district", "upazila", "status", "createdAt"]) assert.match(component, new RegExp(`product\\?\\.${field}`));
  assert.match(component, /Active — বিক্রি চলছে/);
  assert.match(component, /Sold Out — বিক্রি শেষ/);
  assert.match(component, /Archived — সরানো হয়েছে/);
  assert.match(component, /fetchMyMarketplaceProducts\(\{ page, limit: PAGE_SIZE \}\)/);
  assert.match(component, /setPage\(\(current\) => Math\.max\(1, current - 1\)\)/);
  assert.match(component, /setPage\(\(current\) => Math\.min\(pages, current \+ 1\)\)/);
  assert.match(component, /visibleStatus === "error"/);
  assert.match(component, /visibleStatus === "ready" && state\.products\.length === 0/);
  assert.match(component, /href="\/marketplace\/sell"/);
  assert.match(component, /href="\/marketplace"/);
  assert.match(component, /Not a DAM-verified price/);
  assert.match(component, /data-bondhu-no-fly/);
  assert.match(component, /status !== "archived"/);
  assert.match(component, /\["active", "sold_out"\]\.includes\(product\.status\)/);
  assert.doesNotMatch(component, /Delete listing|Sold Out button|onDelete/);
  assert.doesNotMatch(component, /phone|password|email|ownerId/i);
});

test("listing edit API sends only price and quantity in an authenticated PATCH", async () => {
  const mock = mockFetch({ status: 200, body: { success: true, data: { product: { _id: "p-1", askingPricePerUnit: 5, quantity: 12 } } } });
  try {
    const result = await updateMarketplaceProduct("p-1", { askingPricePerUnit: 5, quantity: 12, ownerId: "spoof", role: "admin", status: "active", productName: "spoof" });
    assert.equal(result.success, true);
    assert.match(mock.requests[0].url, /\/marketplace\/products\/p-1$/);
    assert.equal(mock.requests[0].options.method, "PATCH");
    assert.equal(mock.requests[0].options.credentials, "include");
    assert.deepEqual(JSON.parse(mock.requests[0].options.body), { askingPricePerUnit: 5, quantity: 12 });
  } finally { mock.restore(); }
});

test("listing edit numeric validation enforces finite values and inclusive backend bounds", () => {
  const messages = { askingPricePerUnit: "price", quantity: "quantity" };
  for (const value of ["", "0", "0.009", "Infinity", "NaN", String(Number.MAX_SAFE_INTEGER + 1)]) {
    assert.equal(Object.keys(validateMarketplaceListingEdit({ askingPricePerUnit: value, quantity: "2" }, messages)).includes("askingPricePerUnit"), true);
    assert.equal(Object.keys(validateMarketplaceListingEdit({ askingPricePerUnit: "2", quantity: value }, messages)).includes("quantity"), true);
  }
  assert.deepEqual(validateMarketplaceListingEdit({ askingPricePerUnit: "0.01", quantity: "0.01" }, messages), {});
  assert.deepEqual(validateMarketplaceListingEdit({ askingPricePerUnit: "0.01", quantity: String(Number.MAX_SAFE_INTEGER) }, messages), {});
  assert.deepEqual(buildMarketplaceListingEditPatch({ askingPricePerUnit: "3.5", quantity: "10" }, { askingPricePerUnit: 2, quantity: 10, status: "active", ownerId: "private" }), { askingPricePerUnit: 3.5 });
});

test("listing editor is accessible, prefilled, blocks duplicate saves, and updates only after API confirmation", () => {
  assert.match(component, /askingPricePerUnit: String\(product\.askingPricePerUnit/);
  assert.match(component, /quantity: String\(product\.quantity/);
  assert.match(component, /aria-invalid=\{Boolean\(errors\[name\]\)\}/);
  assert.match(component, /if \(editInFlight\.current \|\| managementInFlight\.current \|\| !editingId\) return/);
  assert.match(component, /response\.success && response\.data\?\.product/);
  assert.match(component, /setState\(\(current\) => \(\{ \.\.\.current, products:/);
  assert.match(component, /onClick=\{onCancel\}/);
  assert.match(component, /disabled=\{saving\}/);
  assert.match(component, /messages\[response\.status\]/);
  assert.match(component, /text\.errors\.network/);
  assert.match(component, /data-bondhu-no-fly onSubmit=\{onSave\}/);
});

test("listing edit API preserves backend 400, 401, 403 and 404 responses and handles network failures", async () => {
  for (const status of [400, 401, 403, 404]) {
    const mock = mockFetch({ status, body: { error: { code: "REJECTED", message: "Rejected" } } });
    try { assert.equal((await updateMarketplaceProduct("p-1", { quantity: 2 })).status, status); }
    finally { mock.restore(); }
  }
  const mock = mockFetch(new Error("offline"));
  try { assert.equal((await updateMarketplaceProduct("p-1", { quantity: 2 })).status, 0); }
  finally { mock.restore(); }
});

test("status API sends only active or sold_out with the existing cookie session", async () => {
  for (const status of ["sold_out", "active"]) {
    const mock = mockFetch({ status: 200, body: { success: true, data: { product: { _id: "p-1", status } } } });
    try {
      const result = await updateMarketplaceProductStatus("p-1", status);
      assert.equal(result.data.product.status, status);
      assert.equal(mock.requests[0].options.method, "PATCH");
      assert.equal(mock.requests[0].options.credentials, "include");
      assert.deepEqual(JSON.parse(mock.requests[0].options.body), { status });
    } finally { mock.restore(); }
  }
  const mock = mockFetch({ status: 200, body: { success: true } });
  try {
    const result = await updateMarketplaceProductStatus("p-1", "archived");
    assert.equal(result.status, 400);
    assert.equal(mock.requests.length, 0);
  } finally { mock.restore(); }
});

test("archive API uses DELETE with no body and preserves backend errors", async () => {
  const mock = mockFetch({ status: 200, body: { success: true, data: { product: { _id: "p-1", status: "archived" } } } });
  try {
    const result = await archiveMarketplaceProduct("p-1");
    assert.equal(result.data.product.status, "archived");
    assert.equal(mock.requests[0].options.method, "DELETE");
    assert.equal(mock.requests[0].options.credentials, "include");
    assert.equal(Object.hasOwn(mock.requests[0].options, "body"), false);
  } finally { mock.restore(); }
  for (const status of [400, 401, 403, 404]) {
    const failed = mockFetch({ status, body: { success: false, error: { code: "REJECTED" } } });
    try { assert.equal((await archiveMarketplaceProduct("p-1")).status, status); }
    finally { failed.restore(); }
  }
});

test("dashboard exposes only valid availability transitions and keeps archived cards read-only", () => {
  assert.match(component, /status === "active" \? "sold_out" : "active"/);
  assert.match(component, /text\.soldOut/);
  assert.match(component, /text\.available/);
  assert.match(component, /status !== "archived" && !editing/);
  assert.match(component, /response\.data\?\.product\?\.status === nextStatus/);
  assert.match(component, /response\.data\?\.product\?\.status === "archived"/);
  assert.match(component, /replaceProduct\(product\.\_id, response\.data\.product\)/);
  assert.match(component, /setEditFeedback\(\{ id: product\.\_id, type: "success", message: text\.statusUpdated \}\)/);
});

test("archive confirmation is an accessible dialog and cancellation does not call DELETE", () => {
  assert.match(component, /<dialog ref=\{archiveDialogRef\}/);
  assert.match(component, /aria-labelledby="marketplace-archive-title"/);
  assert.match(component, /aria-describedby="marketplace-archive-description"/);
  assert.match(component, /onCancel=\{\(event\) => \{ event\.preventDefault\(\)/);
  assert.match(component, /setArchiveTarget\(null\)/);
  assert.match(component, /cannot undo|cannot be undone/i);
  assert.match(component, /archiveBody: "Archiving removes this listing from public Marketplace browsing/);
  assert.match(component, /onClick=\{confirmArchive\}/);
});

test("availability and archive actions guard duplicate/conflicting requests and map errors", () => {
  assert.match(component, /managementInFlight\.current = true/);
  assert.match(component, /managementInFlight\.current \|\| editInFlight\.current/);
  assert.match(component, /disabled=\{management\?\.busy \|\| saving\} onClick=\{\(\) => onEdit\(product\)\}/);
  assert.match(component, /disabled=\{management\?\.busy \|\| saving\}/);
  assert.match(component, /disabled=\{Boolean\(managementAction\?\.busy\)\}/);
  for (const status of ["400", "401", "403", "404"]) assert.match(component, new RegExp(`${status}: text\\.errors\\.`));
  assert.match(component, /response\.status === 0 \? text\.errors\.network/);
  assert.match(component, /statusUpdated/);
  assert.match(component, /archivedSuccess/);
});
