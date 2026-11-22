import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(path.join(root, ...parts), "utf8");

test("tour data covers existing areas with unique routes, targets and bilingual captions", async () => {
  const { BONDHU_TOUR_STEPS, getTourStepIndexForRoute } = await import("../components/mascot/tourSteps.js");
  assert.deepEqual(BONDHU_TOUR_STEPS.map((step) => step.route), [
    "/", "/dashboard", "/market", "/climate", "/crop-rotation", "/map", "/my-farm", "/saved-advisories", "/assistant",
  ]);
  assert.equal(new Set(BONDHU_TOUR_STEPS.map((step) => step.id)).size, BONDHU_TOUR_STEPS.length);
  for (const step of BONDHU_TOUR_STEPS) assert.ok(step.id && step.target && step.en && step.bn);
  assert.equal(getTourStepIndexForRoute("/my-farm/records"), 6);
  assert.equal(getTourStepIndexForRoute("/"), 0);
});

test("tour targets exist on real route content and protected steps require sign in", async () => {
  const { BONDHU_TOUR_STEPS } = await import("../components/mascot/tourSteps.js");
  const sources = [
    read("app", "page.js"),
    read("components", "dashboard", "DashboardOverview.js"),
    read("app", "(public-data)", "market", "page.js"),
    read("components", "dashboard", "DashboardWorkspace.js"),
    read("components", "RotationOverview.js"),
    read("app", "(public-data)", "map", "page.js"),
    read("app", "(app)", "my-farm", "page.js"),
    read("app", "(app)", "saved-advisories", "page.js"),
    read("app", "(app)", "assistant", "page.js"),
  ].join("\n");
  for (const step of BONDHU_TOUR_STEPS) {
    assert.ok(sources.includes('data-tour-target="' + step.target + '"'), "Missing target " + step.target);
  }
  for (const route of ["/map", "/my-farm", "/saved-advisories", "/assistant"]) {
    assert.equal(BONDHU_TOUR_STEPS.find((step) => step.route === route).requiresAuth, true, route + " is private");
  }
});

test("guest navigation skips every protected tour step", async () => {
  const { findEligibleTourStepIndex } = await import("../components/mascot/tourSteps.js");
  assert.equal(findEligibleTourStepIndex(1, false), 1);
  assert.equal(findEligibleTourStepIndex(5, false), -1);
  assert.equal(findEligibleTourStepIndex(5, true), 5);
  assert.equal(findEligibleTourStepIndex(8, true, undefined, -1), 8);
});

test("tour progress resumes only on user request and remains bounded", async () => {
  const { normalizeTourProgress } = await import("../components/mascot/tourSteps.js");
  const { parseMascotPreferences } = await import("../components/mascot/mascotStore.js");
  assert.equal(normalizeTourProgress(99), 8);
  assert.equal(normalizeTourProgress(-2), 0);
  assert.equal(normalizeTourProgress("3"), 0);
  assert.equal(parseMascotPreferences(JSON.stringify({ tourProgress: 4 })).tourProgress, 4);
  const guide = read("components", "MiniGuide.js");
  assert.match(guide, /preferences\.tourProgress/);
  assert.match(guide, /setTourMode\(true\)/);
});

test("spotlight tracks target layout, retains captions and uses the existing voice controls", () => {
  const guide = read("components", "MiniGuide.js");
  const mascot = read("components", "mascot", "BondhuMascot.js");
  const assistant = read("app", "(app)", "assistant", "page.js");
  assert.match(guide, /new MutationObserver/);
  assert.match(guide, /new ResizeObserver/);
  assert.match(guide, /addEventListener\("scroll", refresh/);
  assert.match(guide, /scrollIntoView/);
  assert.match(guide, /onClick=\{readTourStep\}/);
  assert.match(guide, /stopTourVoice\(\)/);
  assert.match(guide, /aria-live="polite"/);
  assert.match(guide, /prefers-reduced-motion/);
  assert.match(mascot, /facingRef\.current/);
  assert.match(mascot, /webglcontextlost/);
  assert.match(assistant, /: isLoading\s*\n\s*\? "thinking"/);
  assert.match(assistant, /: isTtsSpeaking\s*\n\s*\? "talking"/);
  assert.doesNotMatch(guide, /getUserMedia|startListening|SpeechRecognition/);
});
