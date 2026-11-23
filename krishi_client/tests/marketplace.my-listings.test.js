import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchMyMarketplaceProducts } from "../services/api.js";

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
  assert.doesNotMatch(component, /Edit listing|Archive listing|Delete listing|Sold Out button|onDelete/);
  assert.doesNotMatch(component, /phone|password|email|ownerId/i);
});
