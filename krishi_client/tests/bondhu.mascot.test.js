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

test("the real Three.js model uses continuous sculpted forms and animated eyelids", () => {
  const model = read("components", "mascot", "createBondhuModel.js");
  const renderer = read("components", "mascot", "BondhuMascot.js");
  assert.match(model, /function torsoPoint\(/, "torso is a continuous shaped surface");
  assert.match(model, /continuous-cream-belly/, "belly conforms to the torso surface");
  assert.match(model, /sculpted-head-and-muzzle/, "head and muzzle blend into one deformed surface");
  assert.match(model, /upper-eyelid/, "the eyes have actual eyelid meshes");
  assert.match(model, /ExtrudeGeometry\(wingShape/, "wings have a beveled three-dimensional membrane");
  assert.match(model, /tailGeometry\.computeVertexNormals\(\)/, "the tail uses a smooth custom tapered tube");
  assert.match(model, /roughness: 0\.76/, "skin uses a soft rough material response");
  assert.match(renderer, /parts\.lids\[index\]/, "blink motion moves the lid over the eye");
  assert.match(renderer, /flightLift/, "takeoff and landing use a smoothed body transition");
  assert.match(renderer, /Math\.exp\(-rate \* delta\)/, "animation easing is frame-rate aware");
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
  assert.match(mascot, /Three\.js initialization failed; keeping the SVG fallback/, "initialization failures are visible in browser diagnostics while retaining fallback");
  assert.match(css, /\.kb-mini-launcher \{[^}]*background:transparent/);
  assert.match(css, /\.kb-mini-launcher \.kb-mini-face \{[^}]*filter:none/, "the character has no colored CSS halo");
  assert.match(css, /\.kb-bondhu-canvas canvas \{[^}]*background:transparent!important/);
  assert.match(css, /\.kb-mini-launcher \.kb-bondhu-canvas \{[^}]*background:transparent!important/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.kb-mini-launcher \{ width:132px; height:154px/);
  assert.match(mascot, /window\.addEventListener\("pointermove", onPointerMove/, "eyes and head track page pointer movement");
  assert.match(mascot, /parts\.gaze\.forEach/);
  assert.match(guide, /krishibondhu\.bondhu\.welcome-seen/, "first-visit greeting is shown at most once");
  assert.ok(guide.includes('if (pathname !== "/" || hidden || authLoading)'), "the greeting respects hidden preference and waits for auth state");
  assert.match(guide, /setOpen\(true\);[\s\S]*?localStorage\.setItem\(key, "1"\)/, "first visit opens only a temporary contextual bubble");
  assert.match(guide, /14_000/, "the initial greeting is temporary");
  assert.match(guide, /if \(!open \|\| !greeting \|\| tourMode\)/, "user-requested contextual help stays open until dismissed");
  assert.match(guide, /#home \.kb-hero2-card-stage/, "homepage companion uses the reserved hero illustration area");
  assert.match(guide, /chooseCompanionPosition/, "other pages avoid visible copy and controls when placing the companion");
  assert.match(guide, /if \(position \|\| tourMode \|\| hidden \|\| isDragging\)/, "collision-aware positioning runs on internal routes unless the user is dragging or touring");
  assert.match(guide, /position \|\| visibleContentPosition \|\| contentPosition \|\| savedPosition/, "internal pages apply collision-aware placement before a saved default position");
  assert.match(guide, /const startDrag = \(event\)/, "pointer dragging remains available");
  assert.match(guide, /savePreferences\(position\)/, "dragged placement is saved");
  assert.match(guide, /onKeyDown=\{moveWithKeyboard\}/, "keyboard movement remains available");
});

test("contextual bubbles remain in the viewport and adapt around companion and tour targets", async () => {
  const { placeCompanionBubble } = await import("../components/mascot/companionLayout.js");
  for (const [viewportWidth, viewportHeight, width, height] of [[360, 800, 132, 154], [390, 844, 132, 154], [648, 800, 132, 154], [768, 900, 170, 182], [1024, 900, 170, 182], [1440, 1000, 170, 182]]) {
    const launcher = { left: viewportWidth - width - 8, right: viewportWidth - 8, top: viewportHeight - height - 76, bottom: viewportHeight - 76, width, height };
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
    launcher: { left: 296, right: 382, top: 620, bottom: 720, width: 86, height: 100 },
    bubble: { width: 320, height: 280 },
    headerBottom: 64, preferredSide: "above",
  });
  assert.equal(mobileTour.side, "above", "narrow screens prefer the speech placement above Bondhu");
  assert.ok(mobileTour.top + mobileTour.height <= 832);

  const helpAvoidsCopy = placeCompanionBubble({
    viewportWidth: 652, viewportHeight: 588,
    launcher: { left: 260, right: 392, top: 250, bottom: 404, width: 132, height: 154 },
    bubble: { width: 308, height: 240 },
    obstacles: [{ left: 28, right: 620, top: 455, bottom: 580, weight: 1 }],
    headerBottom: 72,
  });
  const overlapsCopy = helpAvoidsCopy.left < 620 && helpAvoidsCopy.left + helpAvoidsCopy.width > 28 && helpAvoidsCopy.top < 580 && helpAvoidsCopy.top + helpAvoidsCopy.height > 455;
  assert.equal(overlapsCopy, false, "contextual help stays clear of visible hero text when an alternative fits");

  const belowHeader = placeCompanionBubble({
    viewportWidth: 652, viewportHeight: 588,
    launcher: { left: 260, right: 392, top: 200, bottom: 354, width: 132, height: 154 },
    bubble: { width: 308, height: 240 },
    obstacles: [{ left: 28, right: 620, top: 455, bottom: 580, weight: 1 }],
    headerBottom: 166,
  });
  assert.ok(belowHeader.top >= 178, "contextual help stays below the visible navigation header");
});

test("content-aware companion placement avoids copy and keeps Bondhu inside the viewport", async () => {
  const { chooseCompanionPosition } = await import("../components/mascot/companionLayout.js");
  const obstacles = [
    { left: 0, right: 390, top: 350, bottom: 520, weight: 1 },
    { left: 12, right: 378, top: 570, bottom: 650, weight: 2.5 },
    { left: 0, right: 390, top: 0, bottom: 72, weight: 2.5 },
  ];
  const result = chooseCompanionPosition({ viewportWidth: 390, viewportHeight: 844, size: { width: 132, height: 154 }, obstacles });
  assert.ok(result.x >= 8 && result.y >= 8);
  assert.ok(result.x + 132 <= 382 && result.y + 154 <= 836);
  assert.ok(result.y >= 650 || result.y + 154 <= 350, "chooses clear space away from copy and calls to action");
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
