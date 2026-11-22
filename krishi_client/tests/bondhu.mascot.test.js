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

test("Bondhu stays character-first at rest and opens a compact speech bubble only after interaction", () => {
  const guide = read("components", "MiniGuide.js");
  const mascot = read("components", "mascot", "BondhuMascot.js");
  const css = read("app", "globals.css");
  assert.match(guide, /const \[open, setOpen\] = useState\(false\)/, "assistant panel stays closed on page load");
  assert.match(guide, /onClick=\{tapCompanion\}/, "a character tap starts a small contextual interaction");
  assert.match(guide, /className=\{`kb-mini-bubble/, "the guide uses a speech bubble, not a permanent assistant panel");
  assert.doesNotMatch(guide, /kb-mini-panel-head/, "the small bubble does not repeat the full assistant header");
  assert.match(guide, /<BondhuMascot active=\{!hidden && animationEnabled\}/);
  assert.match(guide, /\(hidden \|\| tourMode\) && <span>/, "normal floating character has no pill label");
  assert.match(mascot, /new THREE\.WebGLRenderer\(\{ alpha: true/);
  assert.match(mascot, /renderer\.setClearColor\(0x000000, 0\)/);
  assert.match(css, /\.kb-mini-launcher \{[^}]*background:transparent/);
  assert.match(css, /\.kb-bondhu-canvas canvas \{[^}]*background:transparent!important/);
  assert.match(css, /\.kb-mini-launcher \.kb-bondhu-canvas \{[^}]*background:transparent!important/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.kb-mini-launcher \{ width:104px; height:122px/);
  assert.match(mascot, /window\.addEventListener\("pointermove", onPointerMove/, "eyes and head track page pointer movement");
  assert.match(mascot, /parts\.gaze\.forEach/);
  assert.match(guide, /krishibondhu\.bondhu\.welcome-seen/, "first-visit greeting is shown at most once");
  assert.ok(guide.includes('if (pathname !== "/" || hidden || authLoading)'), "the greeting respects hidden preference and waits for auth state");
  assert.match(guide, /setOpen\(true\);[\s\S]*?localStorage\.setItem\(key, "1"\)/, "first visit opens only a temporary contextual bubble");
  assert.match(guide, /14_000/, "contextual speech dismisses automatically when idle");
  assert.match(guide, /const startDrag = \(event\)/, "pointer dragging remains available");
  assert.match(guide, /savePreferences\(position\)/, "dragged placement is saved");
  assert.match(guide, /onKeyDown=\{moveWithKeyboard\}/, "keyboard movement remains available");
});

test("contextual bubbles remain in the viewport and adapt around companion and tour targets", async () => {
  const { placeCompanionBubble } = await import("../components/mascot/companionLayout.js");
  for (const [viewportWidth, viewportHeight, size] of [[360, 800, 104], [390, 844, 104], [648, 800, 104], [768, 900, 170], [1024, 900, 170], [1440, 1000, 170]]) {
    const launcher = { left: viewportWidth - size - 8, right: viewportWidth - 8, top: viewportHeight - size - 90, bottom: viewportHeight - 90, width: size, height: size };
    const placed = placeCompanionBubble({
      viewportWidth,
      viewportHeight,
      launcher,
      bubble: { width: Math.min(320, viewportWidth - 24), height: 250 },
      target: { left: 24, right: Math.min(viewportWidth * 0.48, 330), top: 180, bottom: 440 },
      headerBottom: 64,
    });
    assert.ok(placed.left >= 12 && placed.top >= 76, `${viewportWidth}px bubble clears the screen edge and header`);
    assert.ok(placed.left + placed.width <= viewportWidth - 12, `${viewportWidth}px bubble fits horizontally`);
    assert.ok(placed.top + placed.height <= viewportHeight - 12, `${viewportWidth}px bubble fits vertically`);
  }
  const mobileTour = placeCompanionBubble({
    viewportWidth: 390, viewportHeight: 844,
    launcher: { left: 278, right: 382, top: 620, bottom: 742, width: 104, height: 122 },
    bubble: { width: 320, height: 280 },
    headerBottom: 64, preferredSide: "above",
  });
  assert.equal(mobileTour.side, "above", "narrow screens prefer the speech placement above Bondhu");
  assert.ok(mobileTour.top + mobileTour.height <= 832);
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
