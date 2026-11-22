import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(path.join(root, ...parts), "utf8");

test("public mobile header is constrained to its viewport instead of intrinsic content width", () => {
  const chrome = read("components", "layout", "PublicChrome.js");
  assert.match(chrome, /<header className="sticky[^\"]*w-full min-w-0 max-w-7xl/);
  assert.match(chrome, /className="flex h-14 w-full min-w-0 items-center justify-between gap-1/);
});

test("homepage preview tabs wrap on narrow screens instead of widening the document", () => {
  const homepage = read("app", "page.js");
  assert.match(homepage, /<div className="flex max-w-full justify-center mb-8 pb-2">/);
  assert.match(homepage, /className="inline-flex max-w-full flex-wrap justify-center p-1\.5/);
});
