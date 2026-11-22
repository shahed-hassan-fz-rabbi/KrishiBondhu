import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("saved advisories remain user-scoped and use only persisted records", async () => {
  const page = await readFile(new URL("../app/(app)/saved-advisories/page.js", import.meta.url), "utf8");
  const controller = await readFile(new URL("../../krishi_server/src/controllers/savedadvisory.controller.js", import.meta.url), "utf8");
  assert.match(page, /<PrivateAccess>/);
  assert.match(page, /fetchSavedAdvisories\(\)/);
  assert.match(page, /result\.data\?\.advisories \|\| \[\]/);
  assert.match(page, /No sample advisories are shown/);
  assert.match(controller, /SavedAdvisory\.find\(\{ userId: req\.user\._id \}\)/);
  assert.match(controller, /findOneAndDelete\(\{ _id: req\.params\.id, userId: req\.user\._id \}\)/);
});

test("saved advice supports existing categories, search, source context, retry, and confirm-before-remove", async () => {
  const page = await readFile(new URL("../app/(app)/saved-advisories/page.js", import.meta.url), "utf8");
  assert.match(page, /crop_planning:/);
  assert.match(page, /rotation:/);
  assert.match(page, /assistant:/);
  assert.match(page, /visibleAdvisories/);
  assert.match(page, /type="search"/);
  assert.match(page, /Try again/);
  assert.match(page, /setPendingDelete/);
  assert.match(page, /onClick=\{\(\) => remove\(item\._id\)\}/);
  assert.match(page, /SOURCE_LABELS/);
  assert.match(page, /item\.createdAt/);
});
