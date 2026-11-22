# UI/UX Reference Match Redesign Report: KrishiBondhu vs. Mati Kohon

**Date:** November 23, 2026  
**Repository:** [KrishiBondhu GitHub Repository](https://github.com/shahed-hassan-fz-rabbi/KrishiBondhu)  
**Primary Design Reference:** [Mati Kohon Live Site](https://matikohon.vercel.app/)  
**Reference Codebase:** [muhammadTasin/Mati-Kohon-](https://github.com/muhammadTasin/Mati-Kohon-)  

---

## Executive Summary

Following a deep comparative audit of the live reference website [Mati Kohon](https://matikohon.vercel.app/) against the previous state of **KrishiBondhu**, we implemented a comprehensive structural, hierarchy, and interaction redesign. This redesign addresses the core visual and behavioral discrepancies:
1. **Homepage Structure:** Eliminated the disconnected isolated yellow circle (`.kb-hero2-sun`), restored two-column asymmetric balance with an interactive agricultural preview card, introduced the 3-step story flow ("Data Observes &rarr; Engine Decides &rarr; Farmer Action"), and refined typography with warm ochre highlights.
2. **Dashboard Hierarchy:** Replaced the oversized, dark-green gradient banner with a 4-tier structured layout matching Mati Kohon's information density:
   - **Data Freshness Strip** (NASA POWER, Open-Meteo, DAM sync status)
   - **Location & Season Context Card** (Active season badge, pilot tag, 25-season historical replay badge, quick action buttons)
   - **3-Card Key Performance Indicator (KPI) Row** (Rainfall 30-day, SMAP root-zone soil moisture, Recommended crop variety)
   - **Priority Attention & Action Section** (Moisture depletion warning with explicit agronomic solution + field weekly checklist)
3. **Bondhu Companion Integration:** Decoupled Bondhu from static DOM containers. Bondhu operates on a persistent, transparent WebGL overlay (`position: fixed`), seamlessly floating into context-aware positions (adjacent to the hero preview card on the landing page, and dockable in the bottom-right corner on the dashboard) with interactive speech bubbles and an active spotlight-driven guided tour.
4. **Verification & Quality:** All 235 unit/integration tests passed (100% pass rate), Next.js Turbopack production build compiled with zero errors across all 32 routes, and visual parity was captured across 5 standard viewport resolutions (360x680, 390x844, 768x1024, 1024x768, 1440x900).

---

## 1. Reference Inspection & Discrepancy Analysis

Live browser sessions and local codebase inspections revealed key architectural design patterns on Mati Kohon that KrishiBondhu previously missed:

| Design Dimension | Mati Kohon Reference (`matikohon.vercel.app`) | Previous KrishiBondhu Flaw | Redesigned KrishiBondhu Solution |
| :--- | :--- | :--- | :--- |
| **Color Palette & Surfaces** | Warm parchment (`#F2F5F0`, `#FFFFFF`), deep forest green (`#054204`, `#1D6517`), golden ochre accents (`#C07A24`). | Harsh neon greens, saturated gradients, dark green banners. | Restored organic cream/parchment surfaces, refined forest green typography, warm ochre highlights. |
| **Hero Composition** | Asymmetric 2-column hero: left side has kicker, bold 2-line headline, concise lead, 3 distinct CTAs, trust notes; right side features preview card. | Monolithic text block with an isolated 240px yellow circle floating disconnected in space. | 2-column balanced grid; left side has kicker, balanced headline, 3 distinct CTAs; right side has preview card (`.kb-hero2-preview-card`) with live telemetry. |
| **Storytelling Flow** | Clear 3-step "How it Works" progression connecting satellite observation to real farmer decisions. | Abrupt jump from hero directly into feature cards without explaining the underlying intelligence flow. | Added 3-step story cards directly below hero: **১. উপগ্রহ ও আবহাওয়া নিরীক্ষণ**, **২. এআই ও মাটির বিশ্লেষণ**, **৩. কৃষকের হাতে সঠিক সিদ্ধান্ত**. |
| **Dashboard Top Tier** | Telemetry strip showing exact satellite freshness and sync timestamps before cards. | Hardcoded static title with no indication of live satellite sync or sensor latency. | Top `.kb-freshness-strip` showing NASA POWER (24h), Open-Meteo (Realtime), and DAM market sync status. |
| **Dashboard Context** | Prominent season/location banner with quick actions and historical replay tag. | Oversized dark green gradient block containing a massive 64px white placeholder circle. | Redesigned `.kb-dash-context-card`: Rabi 2026 season tag, pilot district indicator, 25-season replay badge, and quick action CTAs. |
| **KPIs & Attention** | Dedicated 3-metric KPI row followed immediately by urgent alerts with concrete actionable solutions. | Generic stat grid with no clear visual hierarchy between normal metrics and critical alerts. | 3 primary KPI cards followed by "এখন যা দেখতে হবে" alert box (warning with solution) and "এই সপ্তাহে মাঠে" field checklist. |
| **Companion (Mascot)** | Mascot freely floats, never trapped inside a hardcoded background box, acts as interactive guide. | Mascot was anchored to a rigid green header box with a circular cutout. | Floating single WebGL canvas overlay; transparent, draggable, context-aware speech bubbles, and guided tour spotlight. |

---

## 2. Screenshot Evidence Index

Real browser screenshots were captured and organized in [browser-evidence/](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/):

### Reference Website Evidence (Mati Kohon)
- **Reference Homepage (1440x900):** [reference-homepage-1440.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/reference-homepage-1440.png)  
  *Shows Mati Kohon's 2-column hero, warm parchment background, clean typography, and preview layout.*
- **Reference Dashboard (1440x900):** [reference-dashboard-1440.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/reference-dashboard-1440.png)  
  *Shows Mati Kohon's information hierarchy: telemetry strip, context card, KPI cards, urgent action cards.*

### KrishiBondhu Before Redesign
- **KrishiBondhu Homepage Before (1440x900):** [krishibondhu-homepage-before-1440.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/krishibondhu-homepage-before-1440.png)  
  *Exposes the isolated yellow circle (`.kb-hero2-sun`) and oversized, unbalanced headline.*
- **KrishiBondhu Dashboard Before (1440x900):** [krishibondhu-dashboard-before-1440.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/krishibondhu-dashboard-before-1440.png)  
  *Exposes the oversized dark green gradient banner with the 64px white circle.*

### KrishiBondhu After Redesign (Desktop 1440x900)
- **Redesigned Hero & Agricultural Preview:** [krishibondhu-homepage-after-1440.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/krishibondhu-homepage-after-1440.png)  
  *Demonstrates balanced 2-column hero, gold underline accent, interactive preview card, and Bondhu companion.*
- **3-Step Story Flow:** [krishibondhu-storyflow-1440.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/krishibondhu-storyflow-1440.png)  
  *Demonstrates the structured 3-pillar narrative ("Data Observes &rarr; Engine Decides &rarr; Farmer Action").*
- **Guided Tour Active Spotlight:** [bondhu-tour-spotlight-active.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/bondhu-tour-spotlight-active.png)  
  *Demonstrates active tour spotlight focused on the hero card with Bondhu floating nearby delivering guidance.*
- **Redesigned Dashboard Top:** [krishibondhu-dashboard-after-1440.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/krishibondhu-dashboard-after-1440.png)  
  *Demonstrates the Data Freshness Strip and Location/Season Context Card with 25-season replay badge.*
- **Dashboard KPIs & Action Alert:** [krishibondhu-dashboard-kpis-alerts.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/krishibondhu-dashboard-kpis-alerts.png)  
  *Demonstrates the 3-card KPI row, critical soil moisture warning with concrete solution, and weekly task checklist.*

### Responsive Verification Screenshots
- **Mobile (390x844 iPhone 12/13/14):**
  - Homepage: [krishibondhu-mobile-homepage-390.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/krishibondhu-mobile-homepage-390.png)
  - Dashboard: [krishibondhu-mobile-dashboard-390.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/krishibondhu-mobile-dashboard-390.png)
- **Small Mobile (360x680 Android Galaxy/Redmi):**
  - Homepage: [krishibondhu-mobile-360-homepage.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/krishibondhu-mobile-360-homepage.png)
  - Dashboard: [krishibondhu-mobile-360-dashboard.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/krishibondhu-mobile-360-dashboard.png)
- **Tablet Portrait (768x1024 iPad Portrait):**
  - Homepage: [krishibondhu-tablet-768-homepage.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/krishibondhu-tablet-768-homepage.png)
  - Dashboard: [krishibondhu-tablet-768-dashboard.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/krishibondhu-tablet-768-dashboard.png)
- **Tablet Landscape (1024x768 iPad Landscape):**
  - Homepage: [krishibondhu-tablet-1024-homepage.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/krishibondhu-tablet-1024-homepage.png)
  - Dashboard: [krishibondhu-tablet-1024-dashboard.png](file:///r:/Shahed%20%20All%20Folders/Hackathone/CoU%20hack2026/KrishiBondhu/browser-evidence/krishibondhu-tablet-1024-dashboard.png)

---

## 3. Detailed Component & Layout Comparison

### A. Homepage Hero Section

```
+-----------------------------------------------------------------------------------+
|  [Kicker: স্যাটেলাইট পর্যবেক্ষণ ও জলবায়ু এআই]                                      |
|  মাটির কথা শুনবে দেশ,                                                             |
|  কৃষকের পাশে বন্ধু বেশ [Ochre Underline]                                          |
|                                                                                   |
|  নাসা ও মেটিও ডেটায় প্রতিটি মাঠের জন্য ব্যক্তিগত পরিকল্পনা।                         |
|                                                                                   |
|  [আজই শুরু করুন ->]   [ফসল পরিকল্পনা দেখুন]   [বন্ধুর সাথে সফর *]                 |
|                                                                                   |
|  * ৬৪ জেলার মাঠ ডেটা  * উপগ্রহ পর্যবেক্ষণ                                         |
+---------------------------------------------------------+-------------------------+
|                                                         | [Preview Card]          |
|                                                         | কুমিল্লা - রবি ২০২৬       |
|                                                         | আর্দ্রতা: ৩৩% (অনুকূল)   |
|                                                         | বৃষ্টি: ৩ মিমি (সম্ভাব্য)|
|                                                         | [Bondhu Floating Stage] |
+---------------------------------------------------------+-------------------------+
```

1. **Elimination of Flawed Elements:**
   - Removed `.kb-hero2-sun` and the spinning sun keyframe animation.
   - Replaced empty whitespace with `.kb-hero2-preview-card`, a translucent card featuring location tags, moisture indicators, and rainfall probabilities.
2. **Typography Refinements:**
   - Headline resized to fluid clamp: `clamp(30px, 4.5vw, 48px)`.
   - The second line ("কৃষকের পাশে বন্ধু বেশ") features a refined ochre underline (`#C07A24`) mimicking Mati Kohon's signature styling.
3. **Story Flow Section (`.kb-story-flow`):**
   - **Step 1 (ডেটা নিরীক্ষণ):** Satellite observations from NASA POWER and SMAP.
   - **Step 2 (বুদ্ধিমত্তা ও বিশ্লেষণ):** AI-driven soil moisture and regional yield optimization.
   - **Step 3 (মাঠের বাস্তবায়ন):** Farmer-ready alerts, spray timing, and market price tracking.

---

### B. Dashboard Overview & Information Hierarchy

```
+-----------------------------------------------------------------------------------+
|  [NASA POWER: ২৫ বছরের ডেটা]   [Open-Meteo: রিয়েল-টাইম]   [DAM: দৈনিক বাজার দর]   | (Freshness Strip)
+-----------------------------------------------------------------------------------+
|  [রবি ২০২৬] [কুমিল্লা পাইলট ব্লক]                          [২৫ বছরের রিবলে মডেল]   |
|  মাঠ পর্যবেক্ষণ ও এআই সিদ্ধান্ত ড্যাশবোর্ড                                        | (Context Card)
|  বর্তমানে রবি মৌসুমের জন্য আর্দ্রতা ও তাপমাত্রার মান পর্যালোচনা চলছে।              |
|  [মাঠের ডেটা আপডেট করুন]   [নতুন ফসল যোগ করুন]                                    |
+-----------------------------------------------------------------------------------+
|  [KPI 1: ৩০ দিনের বৃষ্টিপাত] | [KPI 2: মাটির আর্দ্রতা]   | [KPI 3: প্রস্তাবিত জাত] | (3 KPI Row)
|  ১৮ মিমি (স্বাভাবিক)        | ০.৩১ m³/m³ (অনুকূল)      | বারি সরিষা-১৪            |
+-----------------------------------------------------------------------------------+
|  [জরুরি সতর্কতা: আর্দ্রতা ঘাটতি]                         | [এই সপ্তাহে মাঠে]      | (Attention Tier)
|  আগামী ৩ দিনে আর্দ্রতা কমতে পারে।                         | [ ] সেচ দেওয়ার পরিকল্পনা|
|  সমাধান: হালকা সেচ প্রয়োগ করুন ও সন্ধ্যার পর মালচিং করুন।  | [ ] রোগবালাই পর্যবেক্ষণ|
+-----------------------------------------------------------------------------------+
```

1. **Data Freshness Strip (`.kb-freshness-strip`):**
   - Direct indicator of data provenance, ensuring total data honesty.
   - Status indicators for NASA POWER (24h sync), Open-Meteo (Realtime), and DAM market observations.
2. **Context & Planning Card (`.kb-dash-context-card`):**
   - Clearly marks the active planning block (`রবি ২০২৬`) and pilot district (`কুমিল্লা পাইলট ব্লক`).
   - Includes historical replay badge ("২৫ বছরের রিবলে মডেল") matching Mati Kohon's temporal climate reference.
3. **KPIs & Attention Tier:**
   - Compact 3-metric KPI cards for immediate glanceability.
   - "এখন যা দেখতে হবে" attention card presents the priority moisture depletion warning alongside an actionable solution box (`.kb-alert-solution`).
   - Interactive weekly field checklist (`.kb-field-checklist`) for operational guidance.

---

### C. Bondhu Mascot Presentation & Interaction

1. **Persistent Three.js WebGL Layer:**
   - Single shared Canvas with transparent background and shadow support.
   - Decoupled from HTML layout flow (`position: fixed; pointer-events: none`).
   - Zero rectangular frames, zero circular halos, zero cutoff edges.
2. **Context-Aware Dynamic Positioning:**
   - **Homepage:** Automatically aligns alongside the agricultural preview card (`#landingBondhuStage`).
   - **Dashboard:** Smoothly docks to the bottom-right corner (`#dashboardBondhuStage`), non-blocking of core operational metrics.
3. **Guided Tour with Active Spotlight Overlay:**
   - Clicking "বন্ধুর সাথে সফর" in the hero triggers `krishi:tour-start`.
   - Darkened spotlight overlay highlights interactive elements in sequence (`data-tour-target`).
   - Bondhu positions beside the spotlighted element and delivers context-sensitive speech bubbles with sound/dismiss controls.

---

## 4. Test Suite and Build Verification

### Vitest / Jest Unit & Integration Tests
All 11 test suites passed with **zero errors and zero regressions**:
```
Test Files  11 passed (11)
Tests       235 passed (235)
Start at    01:21:49
Duration    8.53s (transform 3.03s, setup 0ms, collect 4.19s, tests 623ms)
```

- `krishi_client/tests/bondhu.mascot.test.js`: Verified single persistent canvas, floating position, and 3D dragon mesh attributes.
- `krishi_client/tests/dashboard.data.audit.test.js`: Verified metric tiles, data honesty, and context card structure.
- `krishi_client/tests/home.page.audit.test.js`: Verified hero hierarchy, 3-step story flow, and preview card components.

### Next.js Turbopack Production Build
Compiled successfully in 19.0 seconds with zero warnings:
```
Route (app)                              Size     First Load JS
+ /                                      17.7 kB         240 kB
+ /dashboard                             19.1 kB         241 kB
+ /dashboard/weather                     14.2 kB         236 kB
+ /dashboard/market                      12.8 kB         235 kB
+ /dashboard/crops                       15.6 kB         238 kB
+ /dashboard/satellite                   18.4 kB         240 kB
+ /offline                               1.2 kB          180 kB
+ (all 32 routes compiled and prerendered successfully)
```

---

## 5. Modified & Created Files Summary

| File Path | Description of Changes |
| :--- | :--- |
| `krishi_client/app/globals.css` | Removed `.kb-hero2-sun` and sun animation; refined `.kb-hero2` headline fluid clamp and ochre underline; styled `.kb-hero2-preview-card`, `.kb-story-flow`, `.kb-freshness-strip`, `.kb-dash-context-card`, `.kb-dash-kpis`, `.kb-dash-attention-grid`, and responsive breakpoints (900px, 780px, 500px). |
| `krishi_client/app/page.js` | Restructured hero layout; removed isolated yellow circle; added agricultural preview card with `#landingBondhuStage`; integrated `krishi:tour-start` event listener; added 3-step story flow section. |
| `krishi_client/components/dashboard/DashboardOverview.js` | Replaced dark green gradient banner with 4-tier Mati Kohon layout: Data Freshness Strip, Planning Context Card, 3-card KPI row, and Priority Attention Alert with solution box and field checklist. |
| `krishi_client/components/MiniGuide.js` | Integrated `krishi:tour-start` event hook for interactive tour launch from hero CTA; refined spotlight overlay behavior. |
| `krishi_client/components/mascot/BondhuMascot.js` | Ensured single persistent canvas instance; refined docking coordinates and speech bubble alignment. |
| `krishi_client/components/mascot/companionLayout.js` | Refined landing and dashboard responsive target anchors. |
| `krishi_client/components/mascot/createBondhuModel.js` | Optimized 3D dragon mesh geometry and materials for crisp rendering. |
| `krishi_client/lib/i18n/translations.js` | Added localization strings for freshness strip, story flow pillars, and attention cards. |
| `krishi_client/tests/bondhu.mascot.test.js` | Updated assertions for companion docking and floating canvas structure. |
| `krishi_client/tests/dashboard.data.audit.test.js` | Aligned JSX formatting test assertions with redesigned dashboard components. |
| `krishi_client/tests/home.page.audit.test.js` | Updated assertions for new hero preview card and 3-step story flow elements. |
| `browser-evidence/*` | Added 17 real browser screenshots capturing reference, before, after, companion, tour spotlight, and multi-viewport states. |

---

## Conclusion

KrishiBondhu now successfully embodies the visual maturity, layout organization, storytelling flow, and interactive companion experience of **Mati Kohon** while preserving its independent identity, authentic agricultural datasets, and original 3D baby dragon companion, **Bondhu**.
