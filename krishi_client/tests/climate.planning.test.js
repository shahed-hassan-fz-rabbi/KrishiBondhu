import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { observedTemperature, summarizeMonthlyTemperature, rotationLinkForDistrict, resolveRotationDistrict, fillClimateText } from "../lib/climatePlanning.js";
import { translations } from "../lib/i18n/translations.js";

const row = (mean, years = 25) => ({ stats: { mean }, years_used: years });
test("monthly summary uses recorded averages, preserves zero and reports partial coverage", () => {
  const result = summarizeMonthlyTemperature({ 1: row(0), 4: row(30), 5: row(30), 6: row(null), 7: row(-999), 8: row(23, 0), 9: row("26") });
  assert.equal(result.monthsAvailable, 3);
  assert.equal(result.complete, false);
  assert.deepEqual(result.warmest, { value: 30, months: [4, 5] });
  assert.deepEqual(result.coolest, { value: 0, months: [1] });
});
test("no observations produce no invented extremes or completeness", () => {
  assert.deepEqual(summarizeMonthlyTemperature(), { monthsAvailable: 0, complete: false, warmest: null, coolest: null });
  for (const value of [null, undefined, NaN, Infinity, -999, 100, "25", false]) assert.equal(observedTemperature(value), null);
  assert.equal(summarizeMonthlyTemperature(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, row(i)]))).complete, true);
});
test("rotation handoff preserves only supported district identifiers", () => {
  assert.equal(rotationLinkForDistrict("chattogram"), "/crop-rotation?district=chattogram");
  assert.equal(rotationLinkForDistrict("cumilla"), "/crop-rotation?district=cumilla");
  assert.equal(rotationLinkForDistrict("https://example.test"), "/crop-rotation");
  assert.equal(resolveRotationDistrict("chattogram", "cumilla"), "chattogram");
  assert.equal(resolveRotationDistrict("bogus", "chattogram"), "chattogram");
  assert.equal(resolveRotationDistrict(null, null), "cumilla");
});
test("farmer-facing summaries and actions are available in both languages", () => {
  assert.deepEqual(Object.keys(translations.en.climatePlanning).sort(), Object.keys(translations.bn.climatePlanning).sort());
  for (const locale of ["en", "bn"]) {
    const result = fillClimateText(translations[locale].climatePlanning.summary, { district: "TEST", warmMonths: "APR", coolMonths: "JAN", warmValue: "30.1", coolValue: "19.2" });
    assert.ok(result.includes("TEST") && result.includes("30.1") && result.includes("19.2"));
    assert.doesNotMatch(result, /\{\w+\}/);
  }
});


test("rotation priority links accept only supported choices", async () => {
  const { resolveRotationPriority } = await import("../lib/climatePlanning.js");
  for (const key of ["water", "diversity", "calendar"]) assert.equal(resolveRotationPriority(key), key);
  for (const bad of [null, "", "admin", "profit"]) assert.equal(resolveRotationPriority(bad), "water");
});


test("signed-in climate links use the existing workspace planner", () => {
  assert.equal(rotationLinkForDistrict("cumilla", true), "/rotation-planner?district=cumilla");
  assert.equal(rotationLinkForDistrict("chattogram", true), "/rotation-planner?district=chattogram");
  assert.equal(rotationLinkForDistrict("cumilla", false), "/crop-rotation?district=cumilla");
});

test("latest climate panel labels archived observations and preserves provenance", async () => {
  const panel = await readFile(new URL("../components/climate/LatestClimateReadings.js", import.meta.url), "utf8");
  assert.match(panel, /fetchClimateLatest\(district\)/);
  assert.match(panel, /historical daily values stored from NASA POWER, not live weather or a forecast/i);
  assert.match(panel, /row\.observationDate/);
  assert.match(panel, /row\.unit/);
  assert.match(panel, /state\.meta\?\.provider/);
  assert.match(panel, /state\.meta\?\.timeStandard/);
  assert.match(panel, /Older observation/);
  assert.match(panel, /No verified archived observations are available/);
  assert.doesNotMatch(panel, /"Live weather"|"Today's weather"|"Current temperature"/);
});

test("rotation planning presents its existing inputs as an ordered three-step workflow", async () => {
  const planner = await readFile(new URL("../components/RotationPlanner.js", import.meta.url), "utf8");
  assert.match(planner, /Field and location/);
  assert.match(planner, /Crop history and priority/);
  assert.match(planner, /rotation\.baseline/);
  assert.match(planner, /compareCropRotations\)\(\{ \.\.\.profile, baseline \}\)/);
});
