# KrishiBondhu Final QA Report — Part 8

- **Review date:** 22 November 2026
- **Starting commit:** `4fede1a5800aa08ae1e0c596d8718d85c1c6e130`
- **Branch / remote:** `main` / `origin` (`shahed-hassan-fz-rabbi/KrishiBondhu`)

## Readiness assessment

**Production readiness is not verified.** The client build and automated suites pass, and all 28 source routes responded to an HTTP GET from the production build. Live backend, database, AI-provider, authenticated workflows, final responsive recheck, screenshot evidence, and detailed browser-console triage remain incomplete.

## PASS — verified

- Repository was clean at the start of Part 8. `main`, the configured `origin`, and the starting commit matched the requested Part 7 baseline. No `.env` file or credential value was added to Git.
- The production build emitted 28 source-defined `page.js` routes (32 entries in Next.js build output, including framework and dynamic route entries). All 28 route URLs returned HTTP 200 from the local production frontend. This verifies route response only; it does not verify user interactions or access control.
- Client suite: **231 passed, 0 failed** (includes Bondhu/tour regressions and two new responsive source regressions).
- Backend unit suite: **113 passed, 0 failed**.
- Backend offline suite: **8 passed, 0 failed, 1 safely skipped** because `MONGODB_TEST_URI` is absent. The offline HTTP and AI fallback checks ran against the test harness, not the running backend or live providers.
- Python scientific suite: **67 passed** under Python 3.14.0 with NumPy 2.5.4.
- `npm run lint`: passed. `npm run build`: passed on Next.js 16.4.5.
- The browser’s 360 × 680 emulation exposed a narrow-screen width issue in the public header and homepage preview tabs. The header is now constrained, its inner row is full-width with a smaller mobile gap, and the preview tabs wrap. A regression test covers these source-level constraints.
- The root quickstart and client API example incorrectly named port 5000. Both now use the configured backend port 5001.
- Source review confirms Three.js is imported inside Bondhu’s mount effect and cleanup disposes geometries, materials, and the renderer. This is code review, not a repeated live lifecycle stress test.

### Routes with HTTP 200 responses

`/`, `/assistant`, `/climate`, `/crop-calendar`, `/crop-rotation`, `/dashboard`, `/data-sources`, `/handoff`, `/location-onboarding`, `/login`, `/map`, `/market`, `/market-import`, `/matikohon`, `/my-farm`, `/my-farm/[id]`, `/my-farm/[id]/edit`, `/my-farm/new`, `/my-farm/plan`, `/my-farm/reviews`, `/officer/reviews`, `/rainfall`, `/register`, `/rotation-planner`, `/saved-advisories`, `/settings`, `/soil-moisture`, `/vegetation`.

## FAIL — issue observed

- At emulated 360 × 680, the document initially measured 388px against a 360px client width. After the first layout fix, it measured 364px against 360px; the remaining 4px came from the mobile header action row. A final 4px gap reduction was applied. **The final build was not remeasured in the browser**, so this remains unverified rather than marked fixed.
- DevTools showed **21 console errors and 9 warnings** during the browser session. The messages were not individually isolated. The backend was unavailable and may explain some request failures, but that cause was not confirmed. React/Three.js error absence, including the prior `removeChild` issue, is therefore not verified.

## BLOCKED — environment or access missing

- No service listened on backend port 5001 or local MongoDB port 27017 during the check. The configured server `.env` uses a remote MongoDB URI, while no isolated `MONGODB_TEST_URI` is configured. To avoid connecting tests or application flows to an unknown remote database, the backend was not started and database integration tests were not run.
- No authorized test account or isolated database was available. Login/logout, session persistence, farm create/edit/delete, saved-advisory writes, officer-only routes, market-import actions, and protected-page behavior were not exercised against an authenticated service.
- Live market, weather, satellite, and AI provider responses were not tested. The successful offline tests are explicitly not treated as live integration evidence.
- A local browser session displayed Bondhu, but its full state/interaction lifecycle was not repeated for this phase. Idle/blink, listening/talking synchronization, sleeping/flying/dragging, persisted position, reduced-motion, WebGL fallback, duplicate canvas, and repeated unmount checks are **not fully verified** here.
- The Mati Kohon reference URL was inaccessible through the available web inspection tool, so no Part 8 side-by-side comparison was completed.
- Screenshot files were not produced. The interactive browser had active user input, so I did not take over that session; the headless Edge invocation rejected multiple targets and Chrome failed GPU initialization. `qa-screenshots/` contains no evidence images.

## Responsive viewport matrix

| Requested viewport | Result |
| --- | --- |
| 360 × 680 | **FAIL observed before final spacing change; final recheck not completed** |
| 390px | **NOT TESTED** |
| 768px | **NOT TESTED** |
| 1024px | **NOT TESTED** |
| 1440px | **NOT TESTED** |
| Short viewport height (680px) | Emulated during the 360px check; final dialog/panel recheck not completed |

No screenshot path is listed as evidence because no screenshot file was saved.

## Accessibility, security, and performance

- **Accessibility:** Existing automated client tests passed. A full keyboard-only journey, screen-reader check, contrast audit, touch-target audit, and reduced-motion browser run were not completed. Mark these **NOT TESTED**.
- **Security:** Existing auth, role, ownership, and validation tests passed within the client/backend unit suites. Live authentication and role-gated workflows are **BLOCKED** by the missing authorized test environment. Environment values were not printed or copied into this report.
- **Performance:** The production build completed. `.next/static/chunks` contains 61 JavaScript chunks totaling **3.36 MiB on disk**; this is aggregate uncompressed file size, not an initial-route transfer measurement. No Lighthouse, Web Vitals, layout-shift, or mobile frame-rate measurement was taken. DevTools reported warnings; font/network warnings were not fully triaged.
- No production infrastructure or user records were changed.

## Changes made

- Constrained the mobile public header and wrapped homepage preview tabs to address the observed narrow-width issue.
- Added `tests/responsive.home.test.js` and included it in the client test command.
- Corrected the two stale backend port references from 5000 to 5001.

## Remaining work before production sign-off

Repeat the final viewport check at all five requested widths; save actual screenshots; isolate the browser console errors; complete authorized authenticated workflows; run live API/AI checks only against an approved test database/environment; and repeat Bondhu/tour state, reduced-motion, and cleanup checks in a real browser.
