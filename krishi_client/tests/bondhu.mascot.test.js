import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(path.join(root, ...parts), "utf8");

test("Bondhu supports the required interaction states and reduced-motion poses", async () => {
  const { BONDHU_STATES, getBondhuPose, normalizeBondhuState } = await import("../components/mascot/bondhuState.js");
  assert.deepEqual(BONDHU_STATES, ["idle", "happy", "listening", "talking", "sleeping", "flying", "dragging"]);
  assert.equal(normalizeBondhuState("greeting"), "happy");
  assert.ok(getBondhuPose("talking", 1).mouthOpen > 0);
  assert.equal(getBondhuPose("sleeping", 1, true).eyeOpen, 0.05);
  assert.equal(getBondhuPose("flying", 1, true).wingFlap, 0);
  assert.equal(getBondhuPose("dragging", 1, true).bodySway, 0);
});

test("existing mascot preferences migrate without losing position, visibility or voice settings", async () => {
  const { parseMascotPreferences } = await import("../components/mascot/mascotStore.js");
  assert.deepEqual(parseMascotPreferences(null, JSON.stringify({ animationEnabled: false, hidden: true, muted: true, x: 21, y: 77 })), {
    animationEnabled: false, hidden: true, muted: true, x: 21, y: 77, tourProgress: null,
  });
  assert.equal(parseMascotPreferences(JSON.stringify({ muted: false }), JSON.stringify({ muted: true })).muted, false);
  assert.equal(parseMascotPreferences("invalid").animationEnabled, true);
  assert.equal(parseMascotPreferences(null).hidden, false, "first-time visitors see Bondhu by default");
});

test("Bondhu is a transparent floating character by default, with a launcher label only when hidden or touring", () => {
  const guide = read("components", "MiniGuide.js");
  const mascot = read("components", "mascot", "BondhuMascot.js");
  const css = read("app", "globals.css");
  assert.match(guide, /const \[open, setOpen\] = useState\(false\)/, "assistant panel stays closed on page load");
  assert.match(guide, /<BondhuMascot active=\{!hidden && animationEnabled\}/);
  assert.match(guide, /\(hidden \|\| tourMode\) && <span>/, "normal floating character has no pill label");
  assert.match(mascot, /new THREE\.WebGLRenderer\(\{ alpha: true/);
  assert.match(mascot, /renderer\.setClearColor\(0x000000, 0\)/);
  assert.match(css, /\.kb-mini-launcher \{[^}]*background:transparent/);
  assert.match(css, /\.kb-bondhu-canvas canvas \{[^}]*background:transparent!important/);
  assert.match(css, /\.kb-mini-launcher \.kb-bondhu-canvas \{[^}]*background:transparent!important/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.kb-mini-launcher \{ width:70px; height:82px/);
});

test("one shared Bondhu scene replaces the old launcher without changing tour or voice integration", () => {
  const guide = read("components", "MiniGuide.js");
  const mascot = read("components", "mascot", "BondhuMascot.js");
  const assistant = read("app", "(app)", "assistant", "page.js");
  assert.equal((guide.match(/<BondhuMascot\b/g) || []).length, 1);
  assert.match(guide, /TOUR_STOPS/);
  assert.match(guide, /krishi:assistant-status/);
  assert.match(guide, /ArrowUp ArrowDown ArrowLeft ArrowRight/);
  assert.match(assistant, /krishi:assistant-status/);
  assert.match(mascot, /webglcontextlost/);
  assert.match(mascot, /prefers-reduced-motion/);
  assert.match(mascot, /\.dispose\(\)/);
  assert.doesNotMatch(guide, /KrishuMascot/);
});
