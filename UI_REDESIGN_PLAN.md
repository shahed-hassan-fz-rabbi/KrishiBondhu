# KrishiBondhu — UI/UX Redesign Plan

**Document status:** Part 1 of 8 — Reference analysis and design foundation.
**Date:** 2026-11-21
**Baseline commit:** `585a075` (`Redesign: unified green-on-cream design system across all routes`)
**Scope of this part:** Analysis, inventory, mapping and planning only. No structural UI work has been started.

---

## 0. Verification of the working environment

| Item | Verified value |
| --- | --- |
| Git remote `origin` | `https://github.com/shahed-hassan-fz-rabbi/KrishiBondhu` |
| Current branch | `main`, tracking `origin/main` |
| HEAD | `585a075` |
| Worktree used | `R:\Shahed  All Folders\Hackathone\CoU hack2026\KrishiBondhu` |
| Other worktree | `C:\Users\Shahed\.local\share\opencode\worktree\0e7b80\misty-sailor` (detached at `edcc6be`) — left untouched |
| Unrelated workspace changes | `krishi_client/public/matikohon/` is **untracked** and was left exactly as found. It is reference material only; no assets from it were copied into the product. |
| Backend / database / Python ML / APIs | Not inspected for modification and not changed. No server files were edited. |

---

## 1. Limitations encountered (reported honestly)

1. **Live reference site:** Full interactive browser exploration completed across desktop and mobile viewports (`https://matikohon.vercel.app/`, 70 verified browser actions). All 10 Manager/SAAO sections, the complete Farmer portal tabs, the Judge walkthrough (`/judge/index.html`), the 544-upazila interactive map with 2001–2025 time slider, the 14-dataset wall, and bilingual BN/EN copy were cataloged and verified in real-time.
2. **Screenshots & Visual Evidence:** Captured live browser screenshots across key flows (landing, hero, story flow, dataset wall, country map, manager desk, farmer cases, and companion prompts). Visual evidence is supported by the repository's committed screenshots and DOM computed styles.
3. **Mobile verification:** Mobile viewport behaviors (390x844) were inspected: navigation rail collapses into horizontal swipeable pill tabs, hero and comparison cards stack into a clean single column, and floating companion positions dynamically above touch targets. Additional device-specific validation will occur in Part 7.
4. **Reference repository:** Cloned read-only to `C:\Users\Shahed\AppData\Local\Temp\opencode\mati-kohon-ref` at commit `9022bd3`. The remote repository was not modified.
5. **Protected material:** The reference's chameleon mascot (Rongu), its artwork, fonts, code and NASA/space-apps branding were analysed only. None of it is to be copied. The local `public/matikohon` bundle is treated the same way.

---

## 2. Reference analysis (live site + repository + screenshots)

### 2.1 Design tokens observed on the live site (computed from `:root`)

| Token | Value | Note |
| --- | --- | --- |
| `--paper` | `#EDE6DA` | Page background, warm cream |
| `--face` | `#F2EDE1` | Raised card surface |
| `--teal-700` | `#0B4A4F` | Single primary accent |
| `--teal-900` | `#063A3F` | Dark accent / sidebar |
| `--teal-500` | `#2A8A86` | Hover / light accent |
| `--amber` / `--amber-deep` | `#C07A24` / `#7F500E` | Warning |
| `--ink` / `--text` / `--muted-ink` | `#1F2B2A` / `#46514F` / `#5E5D52` | Text ramp |
| `--r-sm/md/lg/xl` | `8 / 12 / 16 / 24px` | Radius scale |
| `--rail-w` | `288px` | Left navigation rail |
| `--e2` / `--e3` | soft warm-brown shadows with a white top-left highlight | Distinct "soft bevel" elevation |
| `--ease` | `cubic-bezier(.2,.8,.3,1)` | Motion easing |
| Fonts | Anek Bangla (display), Hind Siliguri (body), IBM Plex Mono, Material Symbols Outlined | Bangla-first |

KrishiBondhu deliberately keeps its **green-on-cream** identity instead of the reference's teal; the reference is used for structure, rhythm and interaction quality only.

### 2.2 Landing page composition (live DOM order)

1. **Header** — brand lockup (leaf mark + "মাটি কহন · Field advice from NASA data"), location breadcrumb, release-status pill, BN/EN switch, "Enter" button.
2. **Hero** (`.story-hero`) — kicker pill, two-line display headline ("Seen from space. / Said on the farmer's phone." with the last phrase amber-underlined), lead paragraph, three CTAs:
   - "Look around without logging in" (primary)
   - "One decision in 2 minutes" (secondary, links to a separate judge walkthrough)
   - "The full tour with Rongu" (text link with play icon)
   plus two honest note lines (no sign-in; ~5-minute tour).
3. **Three-step "how it works"** (`.story-flow`) — "NASA sees" (live dataset chips with dates) → "Mati Kohon decides" (a 3D land slab of Bangladesh with four sample places) → "The farmer hears" (a phone mock-up with a Bangla call, recording and SMS).
4. **Proof strip** — counting numbers (544 upazilas, 25 seasons, 14 datasets, 1 km grid, daily update).
5. **Interactive country map** — Now / 25-years tabs, a 2001–2025 year slider with play button, layer chips, legend, tooltip, 3D slab presentation, place detail panel.
6. **Dataset wall** — one card per dataset (14), generated from a single source array.
7. **Role cards** — Visitor / Farmer / Manager, each with 2–3 `feature-tile` buttons, plus a "full tour" link.
8. **Entry forms** — farmer demo sign-in, manager sign-in, guest mode; all clearly labelled as demo/sample.
9. **Rongu dock** — always-available floating character button and speech bubble.

The landing page has **no global marketing footer**; the separate judge walkthrough has a minimal footer with an evidence download and a scope disclaimer.

### 2.3 Navbar and sidebar

- A single top header plus one left rail — never duplicate navigation.
- The left rail (`.screen-nav`) is grouped into four labelled categories: **Work / Plan / Field / Data and evidence**.
- Twelve `nav-tab` items, each with `data-roles="visitor|farmer|officer"`. Role filtering hides tabs that do not apply to the active role.
- Active tab is a filled pill; icons are Material Symbols; group headings are small uppercase labels.
- Header carries a location breadcrumb (`district › upazila › union`), a release-status dot, language switch, role chip and profile.
- Guest mode is explicit: a banner states that sample farmers/data are in use and that no real call or SMS is sent.

### 2.4 Dashboard structure (screen-overview, live DOM)

Order of information — this is the key structural lesson:

1. **Freshness strip first** — "How fresh is this data" with a per-source last-date line; snapshot data is explicitly labelled "not live".
2. **Season + place context** — current season pill, headline question, district/upazila selectors, "Pilot: the most detailed data" tag, and a clear "Comparison, not your area" notice when the user is viewing another place.
3. **Primary action band** — start comparison / see satellite evidence.
4. **Three KPI cards** — rain (30 days), root-zone moisture (SMAP L4), recommended Aman variety — each with source, date and comparison context.
5. **"What needs attention now"** — alert card + "This week in the field" + a ranked "where to check first" list; each card has a "Source and method" disclosure.
6. **"The fields from space"** — a 12-month greenness chart plus qualitative insight cards (fine / watch / good to know).
7. **"The map and this place"** — Leaflet map, layer groups, year slider, legend, place facts and district table.
8. **"Soil, water and crops here"** — detailed place panel.

Every card states its source, observation date and limitations. Unavailable data is never shown as zero, and modelled estimates are never presented as live quotes.

### 2.5 Typography, content hierarchy, spacing

- Bangla-first; display 780-weight Anek Bangla with tight leading (~1.08) and slight negative tracking; body 13–17px with generous line-height (1.6–1.85).
- Small caps/kicker labels ~10–12px with letter-spacing; Bengali captions kept ≥11px.
- Spacing scale 4/8/12/16/24/32px; desktop sections ~90–110px vertical, mobile ~60px.
- Hierarchy is established by *placement and labelling* (kicker → headline → lead → evidence → source), not by oversized type or heavy colour.

### 2.6 Cards, panels, buttons, forms, tables

- Card classes: `.card`, `.banner-card`, `.alert-card`, `.map-card`, `.fields-card`, `.place-card`, `.climate-card`, `.live-card`, `.private-block`. Radius 16px, soft bevel shadow, 1px warm hairline.
- Buttons are pills (`.btn-primary` teal fill, `.btn-secondary` cream fill with soft shadow, `.btn-sm`), with 44px+ tap targets and clear hover lift.
- Forms use `appearance:none`, 1px `#8A7F6A` edge, 8px radius, inline help text and visible error state.
- Tables are simple, bordered rows with a tinted header (`data-table`); mobile keeps them horizontally scrollable rather than crushing them.
- Badges/tags encode "Sample", "Snapshot", "Live", "Model" and reliability — information hierarchy is carried by these chips.

### 2.7 Maps, charts, illustrations and motion

- **Dashboard map:** Leaflet 1.9.4 with OSM + NASA GIBS layers, 10+ grouped raster layers, a year slider, hover tooltips, click-to-select upazila, legend and a district table. Falls back gracefully when tiles fail.
- **Landing map:** custom SVG/canvas (no tiles), one path per upazila, a soil slab with lift-on-hover, year playback.
- **Charts:** hand-built SVG/CSS — a 12-month NDVI band chart, flash-flood bars, dimension comparison bars. No charting library.
- **Illustration:** hand-drawn inline SVG satellite, globe, land slab, phone mock-up, faint pixel background pattern — original, lightweight, no stock photography except credited field photos.
- **Motion:** all CSS/JS loops, no animation library — `neo-spin`, `neo-pulse`, `lm-rise`, `landing-ring`, `phone-ring`; `companion.css` word-by-word speech reveal; spring-based character poses; `prefers-reduced-motion` honoured globally.

### 2.8 Guided tour and character interaction (analysis only)

- Tour definitions are data-driven (`companion-stories.js`): each step declares `chapter`, `screen`, `target` (CSS selector), `role`, `gesture`, `mood`, `act`, `place` and bilingual `text`.
- The companion navigates by switching screens/tabs, waits for the target to be visible, scrolls it into view, flies its canvas to a free side of the target, dims the page with a moving "spotlight" cut-out, and speaks via an HTML bubble with chapter/progress and Back/Next/Finish controls.
- Steps whose target is absent for the current role/place are skipped; progress persists in `localStorage`; reduced motion disables flights and dives.
- **This is the interaction model to learn from. It is not to be copied literally** — Bondhu gets original copy, original targets and original motion in Part 6.

### 2.9 Mobile experience

- Breakpoints at 1280/1180/1100/980/960/900/640/560px.
- The rail collapses; the header keeps brand + language + entry; cards stack to one column; the map keeps its legend but drops secondary layers; speech bubbles shrink; tour targets scroll into view with the character positioned above or below.
- Bangla text is never scaled below ~11px; controls remain ≥44px.

### 2.10 Footer

- No global landing footer in the reference. The judge walkthrough footer contains only an evidence download and a scope disclaimer. We keep KrishiBondhu's richer multi-column footer because our product has more real destinations — but with no fake subscription form and no invented contact/partnerships.

---

## 3. Local `public/matikohon` bundle and cloned repository

- `krishi_client/public/matikohon/` — 61 files, ~4.8 MB, untracked. Contains a full static replica of the reference (`index.html`, `neo.css`, `app.js`, `companion.js`, `companion-stories.js`, `bd-map.js`, Rongu mascot sources, vendor Three.js, crop/field photos, GeoJSON).
- Uses: understanding the tour data shape, the soft-bevel CSS technique, responsive rules, and the map layer grouping. **No asset, code file, font, mascot model or text is to be reused in the product.** It stays untracked and unchanged.
- Cloned reference repo adds `docs/ui-ux-plan.md` (four-layer base/raised/inset/pressed, five elevation levels), `apps/farmer-mobile`, and `design/screens/*.png` — useful as a visual checklist only.
- The `/matikohon` route in KrishiBondhu already redirects to `/`; it must remain a redirect (no second branded app).

---

## 4. KrishiBondhu route inventory (current, commit `585a075`)

Legend — **Group**: P = public/landing, D = authenticated app shell, R = public-data route group, A = auth/onboarding. **Priority** is for the remaining redesign parts, not this one.

| Route | Source file | Group | Purpose | Reference analogue | Priority |
| --- | --- | --- | --- | --- | --- |
| `/` | `app/page.js` (62 KB) | P | Landing: hero, 4 pillars, assistant banner, features, how-it-works, data overview, 0–7/7–14 outlook, about, footer | Landing + story-flow + proof + map + dataset wall | High |
| `/dashboard` | `app/(app)/dashboard/page.js` → `DashboardWorkspace` | D | Climate/farm overview workspace | `screen-overview` | High |
| `/assistant` | `app/(app)/assistant/page.js` (73 KB) | D | Bangla/EN AI chat, voice, history, grounded cards | Farmer "Assistant" tab + companion speech | High |
| `/handoff` | `app/(app)/handoff/page.js` | D | Aman→mustard handoff window analysis | `screen-planner` / `screen-comparison` | Medium |
| `/my-farm` | `app/(app)/my-farm/page.js` | D | Farm list | Farmer portal "My farm" | High |
| `/my-farm/new` | `app/(app)/my-farm/new/page.js` | D | Create farm | Farmer portal entry | Medium |
| `/my-farm/[id]` | `app/(app)/my-farm/[id]/page.js` | D | Farm detail, lifecycle, activities | `screen-farmer` | High |
| `/my-farm/[id]/edit` | `app/(app)/my-farm/[id]/edit/page.js` | D | Edit farm | Farmer portal | Low |
| `/my-farm/plan` | `app/(app)/my-farm/plan/page.js` | D | Crop planning + officer review request | `screen-planner` | High |
| `/my-farm/reviews` | `app/(app)/my-farm/reviews/page.js` | D | Review status | Officer/farmer case status | Medium |
| `/officer/reviews` | `app/(app)/officer/reviews/page.js` | D | Officer review queue | `screen-officer` | Medium |
| `/rotation-planner` | `app/(app)/rotation-planner/page.js` | D | Authenticated rotation compare | `screen-comparison` | Medium |
| `/saved-advisories` | `app/(app)/saved-advisories/page.js` | D | Saved AI advice | Farmer "My advice" | Low |
| `/settings` | `app/(app)/settings/page.js` | D | Profile, SMS, notification settings | Farmer profile/consent screen | Medium |
| `/crop-rotation` | `app/crop-rotation/page.js` | P | Public rotation preview | Landing "one decision in 2 minutes" | High |
| `/location-onboarding` | `app/location-onboarding/page.js` | A | District selection onboarding | Header location breadcrumb flow | Medium |
| `/login` | `app/login/page.js` | A | Email/phone + Google sign-in | Farmer/Manager sign-in cards | Medium |
| `/register` | `app/register/page.js` | A | Registration + Google | Farmer sign-in | Medium |
| `/matikohon` | `app/matikohon/page.js` | P | Redirect to `/` | Retired reference URL | Keep as-is |
| `/market` | `app/(public-data)/market/page.js` (69 KB) | R | Prices, forecast, margins, alerts, transport estimate | `screen-overview` evidence + market chips | High |
| `/market-import` | `app/(public-data)/market-import/page.js` | R | Admin CSV/PDF import (role-gated by API) | Manager data-quality screen | Medium |
| `/climate` | `app/(public-data)/climate/page.js` | R | Climate + weather intelligence | `screen-weather` + evidence | High |
| `/rainfall` | `app/(public-data)/rainfall/page.js` | R | Rainfall normals | Data & evidence | Low |
| `/soil-moisture` | `app/(public-data)/soil-moisture/page.js` | R | SMAP card | Data & evidence | Low |
| `/vegetation` | `app/(public-data)/vegetation/page.js` | R | MODIS NDVI/EVI | Data & evidence | Low |
| `/map` | `app/(public-data)/map/page.js` | R | Leaflet GIS map | Map card + country map | High |
| `/crop-calendar` | `app/(public-data)/crop-calendar/page.js` | R | Official calendars | Crop/planning evidence | Medium |
| `/data-sources` | `app/(public-data)/data-sources/page.js` | R | Dataset catalog + freshness | Data wall + data-quality screen | High |

Build output also includes `/_not-found`, `/icon.svg`, and partial-prerendered dynamic segments for `/my-farm/[id]` and `/my-farm/[id]/edit` — total 32 build routes. **No route is to be removed.**

---

## 5. Component inventory and design audit

### 5.1 Existing building blocks

- **Primitives** (`components/ui/`): `Button`, `Badge`/`RiskBadge`/`SampleBadge`, `Card`, `MetricCard`, `Table`, `States` (loading/empty/error), `Tooltip`.
- **Chrome** (`components/layout/`): `AppShell`, `AppSidebar` (35 KB), `BottomNav`, `PublicChrome` (`PublicHeader`/`PublicFooter`), `PublicDataLayout`, `Switchers`, `GlobalSearch`, `BrandMark`.
- **Domain**: `DashboardWorkspace`/`DashboardOverview`, `WeatherIntelligenceSection`, `EnvironmentalIntelligenceCards`, `DistrictLocationPanel`, `DivisionPointMap`, `DistrictGisMap`, climate sections, Recharts charts, `AgriculturalNewsTicker`.
- **Guide infrastructure (must be preserved)**: `components/MiniGuide.js` — `PLACES`, `TOUR_STOPS`, `pageTip()` and the tour state machine; `components/mascot/mascotStore.js` — persistent preferences via `useSyncExternalStore`; `components/mascot/KrishuMascot.js` — the visual character to be **replaced in Part 6**; `app/(app)/assistant/page.js` — the real AI UI whose backend must not be duplicated.

### 5.2 Audit findings (current state after `585a075`)

| Finding | Impact | Planned response |
| --- | --- | --- |
| Green-on-cream tokens are now consistent (`--km-bg #F8F7F2`, `--km-forest #247A4B`, `--km-text #173B2A`); Lighthouse 1.0/1.0/1.0 on landing | Good | Keep tokens; only add missing scale tokens if a new component needs them |
| `app/globals.css` still contains several generations of landing CSS (`.kb-story-*`, `.kb-hero*`, `.kb-mini-*`) with `!important` overrides and an unused photo-hero block | High maintenance risk; conflicting spacing | Consolidate in a later part, **behaviour first, then delete dead rules**; do not do a destructive rewrite |
| No shared "freshness strip" component; freshness is implemented ad hoc per page | Reference puts freshness first; our pages bury it | Introduce `DataFreshnessBar` in Part 2/3 and reuse on dashboard, market, climate, data-sources |
| No shared "page header" (kicker → title → lead → actions) | Inconsistent hierarchy across 28 pages | Introduce `PageHeader` and `SectionHeader` primitives |
| Sidebar groups exist but are flatter than the reference's Work/Plan/Field/Data grouping | Information architecture less legible | Re-group nav in `lib/nav.js` + `AppSidebar` in Part 3 (labels must stay farmer-friendly and bilingual) |
| Landing has no explicit product-preview row (dashboard/AI/market/weather) and no FAQ | Lower discoverability than reference | Add compact, real-feature preview cards and a transparency FAQ in Part 2 — no invented claims |
| Footer is multi-column and now honest (fake newsletter removed) | Good | Keep; add support/privacy links **only when real pages exist** |
| Two names in guide copy ("Mini" in `pageTip`, "Krishu" in brand) | Confusing before Bondhu arrives | Normalise to a single neutral "guide" voice in Part 6, not Part 1 |
| No viewport emulation available in this session | Mobile not visually verified | Schedule mobile verification in Part 7 |

### 5.3 Preserved design tokens (do not change without approval)

```
Primary Green   #247A4B   --km-forest
Forest Green    #123D2A   --km-forest-900 / --km-sidebar
Leaf Green      #56B870   --km-emerald
Ivory           #F8F7F2   --km-bg
Sage            #E8F2E9   --km-sage
Earth Brown     #AC8052   --km-earth
Warning Amber   #D99631   --km-amber
```

Supporting: `--km-surface #FFFFFF`, `--km-text #173B2A`, `--km-text-muted #56665E` (AA on cream), `--km-forest-700 #1B6B40` (AA text green), `--kb-ease cubic-bezier(.2,.8,.3,1)`, `--kb-duration 240ms`, `--kb-radius-sm/md/lg/xl`.

---

## 6. Page-by-page mapping (reference → KrishiBondhu)

| Reference pattern | KrishiBondhu destination | Mapping decision |
| --- | --- | --- |
| Landing hero + 3 CTAs + trust notes | `/` hero (`kb-story-hero`) | Keep structure; sharpen headline, 2 primary CTAs + tour link, honest proof line. No fake numbers. |
| "NASA sees → decides → farmer hears" 3-card flow | `/` four decision pillars + how-it-works | Re-sequence into 3 numbered steps with real KrishiBondhu data (crop plan → review → market/cost), not space-to-phone storytelling. |
| Proof strip with counted numbers | `/` data overview | Only numbers with a real source (`/data-sources` counts). Never fabricate users/testimonials. |
| Interactive country map + year slider | `/map`, `/` data section | Reuse the existing Leaflet map; add timeline/legend polish only where data supports it. No new data layers. |
| Dataset wall (14 NASA datasets) | `/data-sources` | Keep KrishiBondhu's actual sources (POWER, GPM, SMAP, MODIS, Open-Meteo, DAM, DAE/BAMIS, World Bank modeled reference). Attribute NASA where genuinely used; never as product identity. |
| Role cards (Visitor/Farmer/Manager) | Guest vs signed-in states in header + `/login` | Keep our auth model; do **not** add demo role impersonation that bypasses auth. |
| Header: brand, location, language, role, entry | `PublicChrome`, `AppSidebar` header | Add a compact location chip and a single "freshness" status where data exists. |
| Four-group left rail | `AppSidebar` + `lib/nav.js` | Re-group into Work (Dashboard, My Farm, Assistant) / Plan (Crop calendar, Rotation, Handoff) / Field (Weather & climate, Map) / Data (Market, Data sources). Keep existing routes and labels. |
| Freshness strip | New `DataFreshnessBar` | First element on dashboard/market/climate; uses real API dates, labels snapshots as snapshots. |
| Overview KPI row | `DashboardOverview` / `MetricCard` | Keep existing real values; add source + date + "snapshot vs live" chip to each. |
| "Needs attention now" alerts | `WeatherIntelligenceSection`, notifications | Reuse real alerts; add ranked lists and "source and method" disclosures. |
| NDVI/chart cards | Recharts components + `DivisionPointMap` | Keep Recharts; align colours to green-on-cream; add entrance animation and reduced-motion fallback. |
| Map card + place panel | `DistrictGisMap`, `DistrictLocationPanel` | Improve layer selection UI and legend readability; no new unsupported layers. |
| Farmer portal | `/my-farm` family | Reuse the existing lifecycle/task UI; regroup into a stepper-like layout. Do not invent unimplemented features. |
| Rotation planner / comparison | `/crop-rotation`, `/rotation-planner`, `/handoff` | Keep public preview; reuse `RotationOverview/Planner/Results`; improve comparison bars and disclosure. |
| Officer desk | `/officer/reviews` | Keep role restrictions; improve queue table, filters and status chips. |
| Calls & SMS (reference-specific) | `/settings` + assistant voice | **Do not copy.** Map only to real KrishiBondhu SMS consent and voice features. |
| Cattle (reference-specific) | — | **Do not introduce** — no such feature exists. |
| Judge walkthrough | `/crop-rotation` | Keep our own guided preview; add Back/Next/setting selector and scope disclaimer if not already present. |
| Rongu tour & speech | `MiniGuide` + assistant | Preserve infrastructure; Bondhu replaces the visual character in Part 6 with original design/copy. |
| Minimal judge footer | `PublicFooter` | Our footer stays richer; no fake links or contact details. |

---

## 7. Reusable layout components to introduce

These are *proposed* for later parts; none are created in Part 1.

| Component | Responsibility | Used by |
| --- | --- | --- |
| `DataFreshnessBar` | Source → last date, live/snapshot/model tag, stale state | Dashboard, market, climate, data-sources |
| `PageHeader` | Kicker, bilingual title, lead, action slot, breadcrumb | All 28 pages |
| `SectionHeader` | Numbered/eyebrow heading + supporting copy | Landing, dashboard, market |
| `InsightCard` | KPI + value + unit + source/date + disclosure | Dashboard, market, climate |
| `SourceDisclosure` | `<details>` with source, method, limits | Every data card |
| `StatusChip` | Live / Snapshot / Model / Sample / Unavailable | All data pages |
| `ComparisonBars` | Dimension-by-dimension bars with explanation | Rotation, market margins |
| `GuidedSpotlight` | Generic highlight overlay driven by stable `data-tour` ids | Bondhu tour in Part 6 |

Component rules: semantic tokens only, no raw hex in new code; lucide-react icons only; every new visible string added to both EN and BN dictionaries; all new motion inside `prefers-reduced-motion: no-preference`.

---

## 8. Bondhu transition notes (for Part 6, not started)

- **Keep:** `MiniGuide.js` (places, tour stops, page tips, tour state), `mascotStore.js` (preferences + persistence), `app/(app)/assistant/page.js`, `useVoiceInput`/`useVoiceOutput`, all `/assistant/*` APIs.
- **Remove/swap:** `KrishuMascot.js` visual and the "Mini/Krishu" naming in guide copy. Introduce an original baby-dragon (`Bondhu / বন্ধু`) component behind the same props contract so `MiniGuide` continues to work.
- **Do not copy:** Rongu's mesh, shaders, gestures, artwork, speech text or tour script. Bondhu needs an original model and original bilingual copy.
- **Tour target strategy:** add stable `data-tour="…"` attributes to real sections/components; steps skip unavailable or unauthorized targets and never bypass login.
- **Fallback:** SVG/static poster when WebGL is unavailable; lazy-load Three.js; reduced-motion disables flights.

---

## 9. Implementation plan for the remaining parts (outline only)

| Part | Planned work | Exit criteria |
| --- | --- | --- |
| 2 | Landing page structure + footer refinement; `PageHeader`/`SectionHeader`/`StatusChip`/`SourceDisclosure`; design-token cleanup | Landing rebuild verified, build+tests green |
| 3 | App shell: sidebar re-grouping, header, location chip, breadcrumbs, bottom nav, `DataFreshnessBar` | All D-group routes render through one consistent shell |
| 4 | Dashboard, market, weather/climate, crop/farm, auth and admin pages restyled with shared components; charts and tables aligned | Every route visually consistent; no backend change |
| 5 | Website-wide motion, skeleton/empty states, tab/accordion/modal transitions | Reduced-motion verified; no layout shifts |
| 6 | Bondhu 3D character + guided tour + assistant integration (Krishu removed here) | Original character, tour skips gated features, assistant backend unchanged |
| 7 | Mobile-first responsive pass, accessibility and performance refinement | Emulated device checks, Lighthouse on key routes |
| 8 | Browser comparison, regression tests, final report and push | All checks green; before/after evidence delivered where capture permits |

Each part will be committed separately so regressions are isolated. **No Part 2 work has begun.**

---

## 10. Verification performed in Part 1

| Check | Result |
| --- | --- |
| Git remote/branch/HEAD | Verified (see §0) |
| Live reference opened in interactive browser | ✅ Verified across 70 live steps on desktop & mobile viewports; EN/BN toggles, 10 Manager sections, Farmer portal, Judge walkthrough, 14 dataset cards, and interactive map inspected |
| Reference repository inspected | ✅ Cloned read-only; design tokens, screens and tour data reviewed |
| Local `public/matikohon` bundle inspected | ✅ 61 files reviewed as reference only; left untracked and unchanged |
| All KrishiBondhu routes/components inventoried | ✅ 27 page files / 32 build routes / 45 components |
| Foundational code changes in Part 1 | **None** — analysis + design plan document only |
| Client test suite (baseline) | ✅ 195 tests pass, 0 fail (re-run this session) |
| Lint | ✅ Clean |
| Screenshots & Visuals | ✅ Live screenshots captured across key flows (landing, hero, story flow, country map, manager desk, farmer cases, and companion dialogs) |

---

## 11. Open questions for the next part

1. Should the landing hero keep the current "From seed to market" headline, or adopt a shorter farmer-first line aligned with the reference's two-line structure?
2. Should the sidebar regrouping change the visible labels, or only the grouping headings (safer for existing tests and muscle memory)?
3. Which pages should receive `DataFreshnessBar` first — dashboard + market, or all data routes at once?

These do not block Part 1 and can be answered when Part 2 begins.
