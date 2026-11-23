# KrishiBondhu — Screenshot-Based UI Fix Report

**Document status:** Correction pass (Tasks 1–8) over the existing KrishiBondhu application.
**Date:** Mon Nov 23 2026
**Repository:** https://github.com/shahed-hassan-fz-rabbi/KrishiBondhu
**Branch:** `origin/main`
**HEAD commit (pre-existing):** `df6ce49 Fix Bondhu content-aware positioning`
**This pass:** uncommitted working-tree changes to `krishi_client/components/MiniGuide.js` and `krishi_client/components/mascot/companionLayout.js` (committed separately as part of delivery).

---

## 0. Verification of environment

| Item | Verified value |
| --- | --- |
| Git remote `origin` | `https://github.com/shahed-hassan-fz-rabbi/KrishiBondhu` |
| Current branch | `main`, tracking `origin/main` |
| HEAD | `df6ce49` |
| Unrelated workspace changes preserved | Yes — `krishi_client/public/matikohon/` (reference bundle, untracked) and the pre-existing `browser-evidence/` PNG set were left untouched and are not part of this commit. |
| Backend / database / Python ML / APIs | Not inspected for modification; no server files were edited. Port 5001 contract preserved. |

---

## 1. Problems identified from the provided screenshots

The user-provided screenshots (`krishibondhu-mobile-homepage-390.png`, `krishibondhu-tablet-768/1024-dashboard.png`, `krishibondhu-tablet-768/1024-homepage.png`, `bondhu-refined-home*.png`, `reference-homepage-1440.png`, `reference-dashboard-1440.png`) and the captured `.bondhu-capture-report.json` showed:

1. **Bondhu content overlap** — the mascot's fixed bottom-right position covered headings, buttons, cards, and agricultural data when the page was scrolled (e.g. dashboard 768×1024 scroll phase recorded `collisionCount: 2` against the context card and forecast card; homepage risk of covering the hero data card).
2. **Weak homepage composition** — hero/CTA balance, whitespace distribution, and mobile stacking needed alignment with the reference's information hierarchy.
3. **Dashboard hierarchy** — initial viewport needed to lead with selected location, observation dates, source coverage, weather/market summaries, and crop-planning actions rather than oversized placeholders.
4. **Agricultural data claims** — needed traceable sources; no fabricated live prices/yields.
5. **Responsive issues** — horizontal overflow risk at 1024px, bottom-nav label clipping, header crowding, mascot overlap, Bengali readability.

---

## 2. Files modified (this pass)

| File | Change |
| --- | --- |
| `krishi_client/components/mascot/companionLayout.js` | - `getCompanionPositionBounds` now accepts `bottomNavHeight` and caps the bottom edge so Bondhu never rests on the sticky header or fixed bottom navigation.<br>- `validateCompanionPosition` added: rejects saved positions that are obstructed or off-screen and returns a clamped safe alternative.<br>- `resolveCompanionPosition` wrapper added.<br>- Collision checks use the passed `collisionBounds` so transparent canvas padding is excluded from visible-mascot collision (preserves the existing forgiving padding semantics). |
| `krishi_client/components/MiniGuide.js` | - Added `bottomNavHeight` state measured from the fixed bottom navigation, fed into bounds/placement.<br>- Placement now validates `savedPosition` via `validateCompanionPosition`; obstructed/off-screen saved positions are relocated to a measured safe spot and persisted.<br>- Full-size collision bounds used for placement so Bondhu fully avoids content cards/controls.<br>- `bottomNavHeight` added to placement effect dependencies and to drag/keyboard clamping.<br>- Speech bubbles remain clamped to the viewport and away from header/target via `placeCompanionBubble` (unchanged, already correct). |

No new components, pages, or backend changes were introduced. Bondhu remains a single persistent Three.js companion with WebGL + SVG fallback, drag support, keyboard movement, reduced-motion handling, and resource cleanup preserved.

---

## 3. Task-by-task results

### Task 1 — Fix Bondhu content overlap (done)
Bondhu no longer rests on headings, buttons, forms, navigation, or agricultural data:
- Fixed bottom navigation is excluded from the usable viewport via `bottomNavHeight` (and `safeArea.bottom` already covered it).
- Sticky header is excluded via `measureCompanionSafeArea`.
- On scroll/resize/content mutation, placement re-measures obstacles and, if the current/saved position collides, relocates Bondhu to a clear viewport rectangle and persists the safe position.
- Saved positions that become invalid (e.g. after content loads or the user scrolls) are detected and replaced.
- Speech bubbles are clamped inside the viewport and offset from the launcher/tour target; on narrow screens they prefer the "above" side.
- The Three.js canvas is `pointer-events:none`; only the visible hit-area (`kb-mini-hit-area`, `clip-path:polygon`) captures input, so transparent canvas regions never block underlying controls.
- WebGL `webglcontextlost`/`webglcontextrestored`, `prefers-reduced-motion`, visibility, and `renderer.dispose()` cleanup are preserved.
- Bondhu is not permanently attached to the homepage data card or the dashboard hero; on desktop it may use the hero illustration area only when measured free space exists, otherwise it falls back to collision-aware placement.

### Task 2 — Improve homepage composition (reviewed)
The homepage (commit `1710db9 Complete reference-matched redesign of homepage...`) already implements:
- Two-column hero with background field illustration, balanced headline (`clamp(40px,6vw,62px)`), farmer-friendly eyebrow/description, and a clear CTA hierarchy (primary "Explore without login", secondary "Crop Rotation & Weather", tour button, tertiary market link).
- Honest proof strip (source + observation date; tour pause/skip/replay).
- Reserved hero illustration area (`#home .kb-hero2-card-stage`) for Bondhu, kept clear by collision-aware placement.
- Three-step story flow (Data → Decision → Farmer Delivery) with bilingual copy and real route links.
- Featured service cards grid (market, forecast, weather, crops, assistant, map, advisories, My Farm, data sources) linked to existing routes.
- Interactive previews (market/weather/planner/assistant tabs) with dated, sourced data and illustrative-demo labels where no live quote exists.
- Mobile: hero stacks to one column; CTA buttons stretch full width; featured grid collapses to one column; Bengali text remains ≥11px.

No structural homepage rebuild was performed because the existing composition already matches the reference's information hierarchy; changing it blindly without screenshot feedback risked regression.

### Task 3 — Fix dashboard information hierarchy (reviewed)
The dashboard (`DashboardWorkspace` + `DashboardOverview`) already leads the initial viewport with:
- `kb-freshness-strip`: source coverage and latest observation dates first (provenance, not live claims).
- Workspace card: selected location/district selector + "Plan crops" / "Crop calendar" / "Open My Farm" actions.
- `WeatherIntelligenceSection` and `DashboardMarketPreview`: weather and market summaries where data exists, with clearly labeled unavailable states.
- Historical climate context + charts + wettest/driest summaries (explicitly labeled historical averages, not current observations).
- Quick-access service cards.
- Proportional loading state (a single `Card` with `LoadingState`, not an oversized empty panel) and an error state with retry.
- Loading is scoped per district; the dashboard remains useful when one API fails (each fetch is settled independently).

No changes were needed beyond the Bondhu overlap fix.

### Task 4 — Verify agricultural claims (done)
Reviewed client-facing claims:
- **"25 years (2001–2025) of NASA POWER"**: appears as `climateBaseline` — "NASA POWER 25-Year Baseline: Mean annual rainfall … across {obs} verified daily records (2001–2025)" — and in data-source cards. It is explicitly framed as a **historical baseline/reference**, not a current farm observation. Acceptable; source (NASA POWER), period (2001–2025), and record count are stated.
- **"Soil moisture 0.31 m³/m³"**, **"rainfall risk below 5 mm"**, **"0–7 day sowing delay"**, **"ideal crop sowing windows"**: **not present** as client UI claims. `0.31` occurs only in a unit test value and 3D model math. No fabrication found.
- Market previews label illustrative/sample data unmistakably ("Sample format · Not a live quote", "DEMO · SAMPLE DATA") and link to the real DAM report; live market cards show `observedOn`, source, price type, and age-days.

No claim edits were required.

### Task 5 — Responsive layout fixes (reviewed)
- The capture report recorded `overflow: false` for all dashboard captures at 390×844, 768×1024, 1024×768, and 1440×900.
- Bottom navigation is `lg:hidden` (small screens only) with `pb-[env(safe-area-inset-bottom)]`; labels use `max-w-[9ch] truncate` to avoid clipping.
- Header is sticky with `max-w-7xl` and collapses gracefully; mascot avoids header/bottom-nav via safe-area bounds.
- Bondhu compact size on ≤760px (`kb-mini-launcher { width:132px; height:154px }`).
- No arbitrary fixed pixel offsets that work at only one width; placement is viewport-relative and re-measured on scroll/resize/mutation.
- Bengali fonts: Noto Sans Bengali for `html[lang="bn"]`, captions ≥11px, touch targets ≥44px.

### Task 6 — Valid visual comparison (partially automated)
Fresh browser screenshots **could not be captured**: the browser tool's `screenshot` operation failed with "Screenshot needs a visible tab. Call browser.tabs.focus and keep its desktop window visible" on every attempt, and the desktop window was not available to the capture tool. Per instructions, no browser evidence was fabricated.

Available visual evidence:
- Pre-existing `browser-evidence/` PNG set (homepage/dashboard at 360/390/768/1024/1440, initial + scroll, tour spotlight, Bondhu alone and with contextual help).
- `.bondhu-capture-report.json` recording `cssViewportWidth/Height`, `window.innerWidth/Height` (via capture), `scrollWidth`, `overflow`, mascot x/y/width/height, and collision details per route/phase.
- The user-provided reference screenshots remain the primary visual benchmark.

`devicePixelRatio` and exact screenshot dimensions were not captured because screenshot automation was blocked.

### Task 7 — Preserve the real Bondhu model (done)
`BondhuMascot.js` unchanged: continuous sculpted torso/head, animated eyelids, beveled wings, tapered tail, soft rough material, frame-rate-aware easing, pointer-tracked eyes/head, blink/lip-sync, idle/flying/happy/talking/sleeping/dragging poses, WebGL + SVG fallback, and resource cleanup. Bondhu is not replaced by a flat illustration or chatbot icon.

### Task 8 — Tests and delivery (done)
| Check | Result |
| --- | --- |
| `npm run lint` | Clean (0 errors, 0 warnings) |
| `npm test` | **239 passed, 0 failed** (includes `bondhu.mascot.test.js`) |
| `npm run build` | Production build succeeded; all 32 routes prerendered |
| `git diff --check` | No whitespace/conflict markers introduced |

---

## 3. Remaining reference differences (honest)

- KrishiBondhu keeps its own green-on-cream brand and `KrishiBondhu`/`Bondhu` identity; it is **not** a Mati Kohon clone and does not use NASA branding as product identity, Rongu's artwork/models, or the reference's protected code.
- Some reference interactions (full guided-tour spotlight flight, role-gated screen switching, judge walkthrough) exist in KrishiBondhu in a simplified form aligned to its actual routes; they were not re-implemented beyond existing scope per the "do not rebuild" constraint.
- Fresh before/after screenshots were not produced because browser screenshot automation was blocked; the report relies on code verification, tests, build, and pre-existing evidence.

---

## 4. Delivery

**Commit plan:** commit only `krishi_client/components/MiniGuide.js` and `krishi_client/components/mascot/companionLayout.js` with a message such as:

```
Fix Bondhu content-aware positioning and viewport-safe placement
```

**Push:** `git push origin main` (no force-push). Commit URL to be provided after push.

**Not committed:** untracked `krishi_client/public/matikohon/` reference bundle and pre-existing `browser-evidence/` PNG artifacts, per "preserve unrelated workspace changes" and "commit only relevant, verified changes".
