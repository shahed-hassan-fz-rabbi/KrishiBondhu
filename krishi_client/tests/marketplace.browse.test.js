import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchMarketplaceProducts } from "../services/api.js";

const component = readFileSync(new URL("../components/marketplace/MarketplaceBrowse.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/(public-data)/marketplace/page.js", import.meta.url), "utf8");
const marketPage = readFileSync(new URL("../app/(public-data)/market/page.js", import.meta.url), "utf8");
const publicChrome = readFileSync(new URL("../components/layout/PublicChrome.js", import.meta.url), "utf8");

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

test("public Marketplace API client requests the selected page and limit", async () => {
  const mock = mockFetch({ status: 200, body: { data: { products: [], pagination: { page: 3, limit: 12, total: 30, pages: 3 } } } });
  try {
    const response = await fetchMarketplaceProducts({ page: 3, limit: 12 });
    assert.equal(response.success, true);
    assert.equal(response.data.pagination.page, 3);
    assert.match(mock.requests[0].url, /\/marketplace\/products\?page=3&limit=12$/);
    assert.equal(mock.requests[0].options.cache, "no-store");
  } finally { mock.restore(); }
});

test("public Marketplace API client sends trimmed English/Bengali search and district filters", async () => {
  const mock = mockFetch({ status: 200, body: { data: { products: [], pagination: { page: 1, limit: 12, total: 0, pages: 0 } } } });
  try {
    await fetchMarketplaceProducts({ page: 1, limit: 12, q: "  আলু  ", district: " Cumilla " });
    const url = new URL(mock.requests[0].url);
    assert.equal(url.searchParams.get("q"), "আলু");
    assert.equal(url.searchParams.get("district"), "Cumilla");
    assert.equal(url.searchParams.get("page"), "1");
    assert.equal(url.searchParams.get("limit"), "12");
  } finally { mock.restore(); }
});

test("API client handles successful product data, including an empty listing set", async () => {
  const products = [{ _id: "demo-1", productName: "[DEMO / SAMPLE] Potato", askingPricePerUnit: 32, quantity: 5, unit: "kg", district: "Cumilla", upazila: "Burichang", description: "Fictional sample listing and price." }];
  const success = mockFetch({ status: 200, body: { data: { products, pagination: { page: 1, limit: 12, total: 1, pages: 1 } } } });
  try { assert.deepEqual((await fetchMarketplaceProducts()).data.products, products); } finally { success.restore(); }

  const empty = mockFetch({ status: 200, body: { data: { products: [], pagination: { page: 1, limit: 12, total: 0, pages: 0 } } } });
  try { assert.deepEqual((await fetchMarketplaceProducts()).data.products, []); } finally { empty.restore(); }
});

test("API client returns backend errors and network failures for the page error state", async () => {
  const httpError = mockFetch({ status: 503, body: { error: { message: "Unavailable", code: "SERVICE_UNAVAILABLE" } } });
  try {
    const result = await fetchMarketplaceProducts();
    assert.equal(result.success, false);
    assert.equal(result.status, 503);
  } finally { httpError.restore(); }
  const networkError = mockFetch(new Error("offline"));
  try { assert.equal((await fetchMarketplaceProducts()).success, false); } finally { networkError.restore(); }
});

test("public page presents loading, retry, empty, pagination, and demo disclosures without login or checkout", () => {
  assert.match(route, /MarketplaceBrowse/);
  assert.match(component, /status: "loading"/);
  assert.match(component, /status: "error"/);
  assert.match(component, /status: "ready"/);
  assert.match(component, /text\.emptyTitle/);
  assert.match(component, /setRetryKey/);
  assert.match(component, /changePage\(page - 1\)/);
  assert.match(component, /changePage\(page \+ 1\)/);
  assert.match(component, /name="q"[\s\S]*maxLength=\{100\}/);
  assert.match(component, /name="district"[\s\S]*maxLength=\{80\}/);
  assert.match(component, /onSubmit=\{submitFilters\}/);
  assert.match(component, /onClick=\{clearFilters\}/);
  assert.match(component, /setAppliedFilters\(next\)/);
  assert.match(component, /fetchMarketplaceProducts\(\{ page, limit: PAGE_SIZE, \.\.\.appliedFilters \}\)/);
  assert.match(component, /filteredEmpty/);
  assert.match(component, /setPage\(1\)/);
  assert.match(component, /draft\.q\.trim\(\)/);
  assert.match(component, /draft\.district\.trim\(\)/);
  assert.match(component, /names are not automatically translated/);
  assert.match(component, /Farmer asking price/);
  assert.match(component, /Not a DAM-verified price/);
  assert.match(component, /DEMO \/ SAMPLE/);
  assert.match(component, /Fictional sample listing and price/);
  assert.doesNotMatch(component, /Buy Now|Add to cart|checkout/i);
  assert.match(component, /data-bondhu-no-fly/);
  assert.match(marketPage, /href="\/marketplace"/);
  assert.match(publicChrome, /grid gap-12 xl:grid-cols-\[minmax\(0,1fr\)_auto\]/);
});
