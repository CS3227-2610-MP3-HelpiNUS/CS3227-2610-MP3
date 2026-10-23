# Requirements-to-Tests — S1-D2-F02 Student Mentor Discovery and Module Filtering

**Status:** Approved  
**Date:** 2026-10-14  
**Approver:** Repository owner  
**Approval date:** 2026-10-14  
**Branch:** `royden/feat-mentor-discovery`  
**Source PRD:** [PRD.md](PRD.md), approved by the repository owner on 2026-10-14  
**Source TDD:** [TDD.md](TDD.md), approved by the repository owner on 2026-10-14  
**RTT approval:** Granted; this document plans evidence but records no executed feature tests.  
**Implementation authorization:** Not granted. Approval of this RTT alone does not authorize implementation, test code, a commit, or a PR.

## 1. Authority, scope, and preflight

This plan covers the guarded `/student/mentors` route, the public `discoverMentors` callable through `HelpiNUSServices`, authorized per-ID module resolution, loaded-only search/filtering, inline details, the informational help dialog, page-local state, and the relevant Sprint 1 regressions. It excludes request creation, backend search, new shared contracts, Firestore Rules changes, live Firebase, and emulator seed changes. The public test seams are the rendered guarded route with `ServiceProvider servicesOverride`, `callables.invoke('discoverMentors', input)`, and the TDD-approved `modules.getById(id)`; adapter tests use the exported Firebase/mock services. Do not test private page helpers, refs, maps, or state variables.

Preflight found the expected branch and both approved artifacts. Their requirements and design are consistent; no unresolved product or technical choice blocks **test planning**. Existing uncommitted feature documents are preserved. The Sprint 1 `zh/` branch convention differs from the owner's explicit feature branch; use the verified feature branch. The remote integration base was not freshly verified in the Mission Brief and must be checked before later integration.

### Mission Brief approval metadata

The [Mission Brief](../../mission-brief/S1-D2-F02-mentor-discovery.md) now records repository-owner approval dated 2026-10-14. This resolves the administrative approval-metadata prerequisite identified during RTT planning. It does not change the approved PRD/TDD behavior or grant implementation authorization.

The Sprint 1 [requirements](../../../workflow/specs/sprint-1/requirements.md), [architecture](../../../workflow/specs/sprint-1/architecture.md), and [contracts](../../../workflow/specs/sprint-1/contracts.md) remain constraints. In particular, `users/{uid}` is authoritative for role/status; the callable provides public, eligible Mentors; direct `mentorProfiles` collection listing is denied; modules can be read under the existing active-user rule; components depend on services rather than Firebase SDK calls; and WCAG 2.1 AA plus laptop/mobile support are targets. Planned assertions below do not imply these behaviors have been verified for the new feature.

## 2. Verification strategy and test conventions

| Level | Purpose and seam | Evidence limit |
| --- | --- | --- |
| Unit | A pure search/selection function **only if** implementation extracts an exported, stable domain-facing function. Test worked examples through that public function, not a private helper. | No separate unit file is required when route tests cover the same behavior. |
| Component | React Testing Library (`render`, `screen`, `within`, `userEvent`) for controls, details, dialog, status, focus, and visible results. | JSDOM does not establish visual layout, screen-reader output, or native dialog behavior across browsers. |
| Frontend integration | A memory router with the real `ProtectedRoute`, `AppShell`, page, and `ServiceProvider servicesOverride`; deterministic callable/module adapters and deferred promises. | No production or live Firebase dependency. Assert exact service calls only at the public seam. |
| Adapter | Existing Vitest Firebase mocks and typed callable fixtures for `discoverMentors` output validation and `modules.getById` success/null/rejection. | Mocked SDK calls establish adapter behavior, not deployed permissions. |
| Security regression | Existing auth/role, callable emulator, and Firestore Rules suites; plus a read-only source audit of the feature diff. | Emulator evidence is distinct from new feature route evidence; no live project access. |
| Manual | Laptop/mobile browser, keyboard, assistive technology, focus, wrapping, contrast, and the documentation/source boundary audit. | Record device/browser, viewport, actions, observed results, and defects. Automation alone cannot certify WCAG 2.1 AA. |

Use existing Vitest, React Testing Library, `userEvent`, memory router, `ServiceProvider` overrides, `createMockCallableClient`, shared Zod schemas, and current test setup. Use literal expected arrays/messages rather than deriving expectations with the code under test. A suite may group related assertions, but each ID below must have independent pass/fail evidence. Tests are to be written in small behavior-first vertical slices after implementation is authorized; this catalogue is not test code.

## 3. Deterministic fixture contract and isolation

All fixture names identify samples. Define public discovery records **only** with `userId`, `displayName`, `biography`, `moduleIds`; validate each page with `discoverMentorsOutputSchema` at fixture construction, and use `moduleSchema` for present module records. Never reuse `mockDashboard.mentors`, whose nested `User` contains private fields. A reusable scenario set should include:

| Fixture | Literal contents and purpose |
| --- | --- |
| `P1` | `sample-a` / “Sample Aisha Rahman” / “Explains graph traversal” / `['cs2040s','cs2103t','missing-1']`; `sample-b` / “Sample Ben Lim” / “Practices software design” / `['cs2103t']`; `sample-c` / “Sample Cora Tan” / empty biography / `[]`; response cursor `opaque-page-2`. For the 20-item boundary case, add 17 distinct public records with stable literal IDs and assert exactly 20 ordered cards. |
| `P2` | `sample-d` / “Sample Devi Koh” / “Studies databases” / `['cs3227']`; optionally repeat `sample-b` to test first-record-wins deduplication; final cursor `null`. Use a separate empty `P2` with `nextCursor: 'opaque-page-3'` and a final `P3` to test bounded scans. |
| Modules | `cs2040s` = `CS2040S`, “Data Structures and Algorithms”, active; `cs2103t` = `CS2103T`, “Software Engineering”, inactive; `cs3227` = `CS3227`, “Agentic Software Engineering”, active. `missing-1` returns `null`; a failed read rejects. Keep IDs, code, title, and active values within the shared schema. |
| Faults | First-page rejection, later-page rejection at `opaque-page-2`, one-time rejection then success for that same cursor, one failed module alongside successful/absent reads, all module reads failing, one-time module recovery, permission/network rejection, invalid present document, mismatched stored/document ID, malformed callable output, and deferred page/module promises. |

The cursor-keyed handler returns `P1` only for omitted cursor, `P2` only for `opaque-page-2`, and so on; it rejects unknown cursors and wrong `limit` values. Counters belong to individual scenarios and reset between cases. Spies record `discoverMentors`, `modules.getById`, `createHelpRequest`, and any exposed mutation methods; assert no mutation, no server-side search arguments, and no duplicate ID read. In each route test, create a fresh router, services override, fixture handler, and deferred promises; do not share mutable `mockServices` sign-in state. Render the real guarded route unless a case explicitly targets an adapter. Do not use real users, production Firebase, a live external service, or modify the emulator seed.

## 4. Detailed test case catalogue

Each entry states **P** (preconditions/fixture), **T** (trigger), **E** (expected observable result), **B** (mock/service boundary), and **V** (verification method). “Automated” means proposed, not executed. The fixture names in §3 are illustrative literal data; the named behavior and expected results are binding.

### Suite A — access, privacy, and discovery pagination

**F02-TC-001 — Student entry and navigation** · Integration · FR-01; NFR-01; AC-01. P: active Student, `P1`, real Student shell. T: follow a desktop or mobile “Find a mentor” link. E: `/student/mentors` shows discovery and sample public cards under the Student shell. B: `ServiceProvider` callable/module overrides. V: RTL route, URL, heading, card, and navigation assertions.

**F02-TC-002 — Deny unauthorized and wrong-role entry** · Integration · FR-01; NFR-01; AC-01. P: separately signed out, `MENTOR`, `SUSPENDED`, and `DISABLED` sessions. T: open `/student/mentors` directly. E: existing guard routes to login, authorized role dashboard, or account-access state as appropriate; discovery is absent and `discoverMentors` is never called. B: session override plus callable spy. V: parameterized guarded-route assertions; retain existing auth-flow regression tests.

**F02-TC-003 — Public fields only** · Integration · FR-01, FR-05; NFR-01; AC-15, AC-25. P: `P1` and a test-only service sentinel for private email/role/status outside the public payload. T: render cards and expand details. E: only approved name, biography, and authorized module information appear; no private sentinel or raw module document is rendered. B: public callable payload and `modules.getById`. V: DOM assertions, plus the source audit in TC-045. Do not inject private fields into a schema-valid public record.

**F02-TC-004 — First page size and order** · Integration · FR-02; NFR-04; AC-02. P: 20 literal public Mentors in nonalphabetical backend order and a cursor. T: open discovery. E: one `{ limit: 20 }` call without `cursor`, 20 cards in exact response order, “Load more” present, no ranking/alphabetical claim. B: callable fixture. V: exact call and ordered visible-name assertions.

**F02-TC-005 — Cursor continuation and append** · Integration · FR-02; NFR-04; AC-03. P: `P1` then `P2`. T: activate “Load more.” E: request is `{ cursor: 'opaque-page-2', limit: 20 }`; `P2` appends after `P1`; prior cards and controls remain. B: cursor-keyed callable. V: spy call and ordered DOM assertions.

**F02-TC-006 — Exhaustion and empty catalogue** · Integration · FR-02, FR-07; AC-04, AC-14. P: separately `P1` with `nextCursor: null` and `{ mentors: [], nextCursor: null }`. T: load each response. E: no “Load more”; the empty catalogue says “No mentors available,” never “No matches.” B: callable. V: visible-state and absent-button assertions.

**F02-TC-007 — Empty continuation page** · Integration · FR-02, FR-07; AC-04, AC-23. P: first page empty with cursor, and separately an empty later page after `P1`. T: resolve page, then optionally load the next. E: first case says “No mentors loaded yet. Load more to continue.”; both keep manual continuation and never claim exhaustion or auto-request the next page. B: cursor-keyed callable. V: DOM and exact call-count assertions.

**F02-TC-008 — Later-page failure and exact retry** · Integration · FR-02, FR-07; AC-13. P: `P1`; cursor `opaque-page-2` rejects once, then succeeds. T: load more, then Retry. E: earlier cards, query, module choice, and cursor remain; inline error appears; Retry calls the same cursor with limit 20 and appends once, without a success/count claim for the failed attempt. B: callable fault fixture. V: DOM, controls, and call-sequence assertions.

**F02-TC-009 — Rapid repeated page actions** · Integration · FR-02, FR-07; AC-21. P: deferred `P2`, and a separate deferred failed-page retry. T: rapidly activate Load more or Retry multiple times before settlement. E: one request per cursor/attempt while pending, disabled/unavailable repeat action, one append after settlement. B: deferred callable. V: call counts before/after resolving promise and ordered cards.

**F02-TC-010 — Duplicate Mentor ID across pages** · Integration · FR-02; AC-03. P: `P2` repeats `sample-b` with changed public text and introduces `sample-d`. T: load `P2`. E: one `sample-b` card retains its first-page text and position; `sample-d` follows, with no ranking claim. B: callable pages. V: visible card count/order/content.

**F02-TC-011 — Nonadvancing or invalid cursor** · Integration/adapter · FR-02, FR-07; AC-04, AC-13. P: a later response repeats the requested cursor, or a Firebase callable response violates the shared cursor schema. T: load that page. E: recoverable pagination/discovery error; loaded cards remain, no automatic loop or false exhaustion, Retry targets the failed cursor. B: callable fixture or mocked `httpsCallable`. V: call counts, error/status, and no extra append; adapter parse rejection for malformed output.

**F02-TC-012 — Initial failure and retry** · Integration · FR-07; AC-12. P: first request rejects once then returns `P1` (also test empty-with-cursor recovery). T: enter route and activate Retry. E: initial full-page error and Retry, never empty-success text; retry sends `{ limit: 20 }` without cursor and renders the returned state. B: callable fault fixture. V: DOM and exact two-call sequence.

**F02-TC-013 — Distinct loading states** · Integration · FR-07; NFR-02; AC-21. P: deferred first page, then deferred `P2`. T: enter route and load more. E: initial polite loading status; later separate additional-page status while `P1` cards stay operable; no premature empty/no-match result. B: deferred callable. V: RTL status/card/action assertions before each settlement.

### Suite B — loaded-only search and module metadata

**F02-TC-014 — Name/biography search normalization** · Integration · FR-03; AC-05. P: `P1`, metadata ready. T: enter mixed-case substrings with outer spaces matching `Aisha` and `graph traversal`, then whitespace only. E: expected loaded names appear; blank trimmed query restores all loaded cards. B: callable/module fixtures. V: user typing and literal visible-name sets.

**F02-TC-015 — Real module code/title search** · Integration · FR-03, FR-04; AC-05, AC-08. P: active `CS2040S`, inactive `CS2103T`, confirmed absent `missing-1`. T: search substrings of actual code and title, then the missing ID. E: relevant loaded Mentors match real resolved metadata, including inactive metadata; `missing-1` creates no fabricated code/title match. B: `modules.getById`. V: literal result sets and no invented label assertions.

**F02-TC-016 — AND semantics and independent clearing** · Integration · FR-03, FR-04; AC-06. P: two Mentors sharing one module but different text; another Mentor with text but another module. T: select module, type text, clear text, then restore text and clear module. E: intersection in backend order; each clear preserves the other control and restores precisely its eligible loaded subset. B: service fixtures. V: labelled controls and literal ordered result sets.

**F02-TC-017 — Loaded-only, client-side controls** · Integration · FR-03; NFR-04; AC-20. P: `P1` with cursor and an unloaded matching `P2` Mentor. T: change query and module choice. E: only `P1` is evaluated; no discovery call beyond first page, no query/module fields sent to the callable, and UI does not claim all eligible Mentors were searched. B: callable spy. V: call count/arguments and visible text.

**F02-TC-018 — Additional page recomputes matches and choices** · Integration · FR-02–FR-04; AC-09, AC-20. P: active `CS2040S` on `P1`; a scenario-specific `P2` Mentor supports both `cs2040s` and new active `cs3227` and matches the current text; `cs2040s` is already selected. T: load `P2`. E: the new matching card and `CS3227` selector option appear under unchanged controls; `cs2040s` remains selected; Mentor order is a response-order subsequence. B: callable and module fixture. V: control value, options, ordered cards, exact calls.

**F02-TC-019 — Incomplete versus definitive no-match** · Integration · FR-03, FR-07; AC-07. P: query with zero visible `P1` matches and cursor; then final page with `null` cursor still has zero. T: search, then load more. E: first says no matches **among loaded Mentors** with Load more; exhausted state says no matches and exposes clearing action, never “No mentors available.” B: callable pages. V: visible status/action assertions.

**F02-TC-020 — Selector eligibility and initial value** · Integration · FR-04; AC-08. P: `P1`, active/inactive/absent module records, including an active module unsupported by loaded Mentors. T: resolve metadata and open selector. E: initial “All modules”; unique choices are only resolved, active, loaded-supported modules, in code-then-title order; inactive/absent/unsupported IDs are excluded. B: `modules.getById`. V: option labels/values/order and call IDs.

**F02-TC-021 — Module detail variants and empty biography** · Component/integration · FR-04, FR-05; AC-08, AC-15. P: Mentor with active, inactive, absent IDs in that order; separate Mentor with `[]` and empty biography. T: expand each. E: real code/title, “Inactive,” and “Module information unavailable” follow public ID order; empty list says “No modules listed”; no invented biography. B: module fixture. V: within-region ordered text and absence assertions.

**F02-TC-022 — No active supported choices** · Integration · FR-04; AC-09. P: separately no loaded Mentor module IDs, only inactive modules, and confirmed absent IDs. T: load and settle metadata. E: clear empty/unavailable selector explanation; browsing and name/biography search still work; no metadata-failure notice. B: module fixture. V: labelled selector/status and visible-card assertions.

**F02-TC-023 — Pending metadata is incomplete** · Integration · FR-04; AC-10, AC-21. P: discovery succeeds; one module read deferred. T: search a module title and attempt selector change before resolution. E: cards remain, module-loading notice states search currently covers names/biographies, selector changes are disabled; after settlement full search and choices become available. B: deferred `getById`. V: before/after UI and module call assertions.

**F02-TC-024 — Partial module failure** · Integration · FR-04; AC-10, AC-24. P: one active module resolves, one module read rejects, one returns `null`. T: settle reads and search resolved code/title. E: cards and successful labels remain; global selector disabled, metadata notice/Retry shown, search explicitly name/biography-only even for successful metadata; absent ID gets per-reference fallback. B: per-ID module faults. V: detail/search/notice assertions and call IDs.

**F02-TC-025 — Full module failure** · Integration · FR-04; AC-10. P: every referenced `getById` rejects. T: settle reads; search name and biography. E: Mentors remain browsable, selector disabled, notice and Retry present, name/biography search works, raw Firebase errors are absent. B: module faults. V: visible results, controls, and error-text absence.

**F02-TC-026 — Selected filter survives degradation and can clear** · Integration · FR-04; AC-11. P: select `cs2040s` while ready; `P2` introduces a module read that fails. T: load `P2`, then use separate Clear module action. E: selected choice remains identifiable and ID-membership filter remains applied while selector changes are disabled; Clear module works and leaves text intact. B: callable plus module fault. V: selected label, ordered cards, control state, no extra discovery call.

**F02-TC-027 — Retry only failed module IDs** · Integration · FR-04; AC-10, AC-24. P: partial failure with successful and absent cached IDs; failed ID succeeds on retry, possibly after a new page adds another ID. T: Retry once. E: successful/absent IDs are not reread, failed/new IDs resolve once, degradation clears only after all referenced IDs settle, full code/title search and active selector choices return. B: per-ID counters/deferred reads. V: exact ID call counts and before/after results.

**F02-TC-028 — Module read deduplication and rapid retry** · Integration · FR-04; AC-09, AC-10. P: two Mentors/pages reference the same pending ID; separately a failed ID has deferred retry. T: load overlapping page and rapidly activate metadata Retry. E: at most one pending read per ID and one request per retry attempt; no duplicate options or stale error after success. B: deferred `getById`. V: call counts and selector state.

**F02-TC-029 — Firebase module success and absence** · Adapter · FR-04; NFR-04; AC-24, AC-25. P: mocked `getDoc` on `modules/{id}` returns valid present snapshot, then confirmed missing snapshot. T: call exported `firebaseServices.modules.getById(id)`. E: valid result parses through `moduleSchema` with canonical document ID; missing returns `null`; no collection `getDocs` or Mentor profile read. B: mocked Firestore SDK. V: returned values and exact document-path calls.

**F02-TC-030 — Firebase module rejection classes** · Adapter · FR-04; NFR-04; AC-10, AC-24, AC-25. P: invalid present data, stored ID differing from document ID, and network/permission rejection. T: call `getById` for each. E: each rejects rather than returning `null` or silently changing identity; page-level TC-024/025 handles these as degraded metadata. B: mocked `getDoc`, shared `moduleSchema`. V: rejection and no-write/no-list assertions.

**F02-TC-031 — Firebase discovery callable validation** · Adapter · FR-01; NFR-04; AC-02, AC-25. P: mocked `httpsCallable` returns valid public output, then malformed output and a Mentor record with an extra private `email` field. T: invoke `discoverMentors` through `firebaseServices.callables`. E: valid output passes; malformed output rejects; the extra field rejects because the exported `publicMentorSchema` and outer `discoverMentorsOutputSchema` in `@helpinus/shared` both explicitly use `.strict()`. A rejected response is a discovery error, not an empty success. TC-003 separately verifies that private fields never appear in the discovery UI. B: callable SDK mock; production adapter parses with `callableSchemas.discoverMentors.output`, which references the exported `discoverMentorsOutputSchema`. V: resolved/rejected values and exact input/name calls.

**F02-TC-032 — Mock fixture contract and cursor faults** · Adapter/integration · FR-08; NFR-05; AC-19. P: default/sample cursor-keyed pages and scenario handler; valid, absent, invalid, and rejecting mock module records; wrong limit and unknown cursor. T: invoke pages and module reads through mock services. E: valid pages parse against shared discovery output schema; present modules parse with `moduleSchema`, confirmed absence returns `null`, invalid/read failure rejects; exact cursor/20 requests select the correct page; unsupported cursor/limit rejects deterministically. B: `createMockCallableClient` and mock `modules.getById`. V: literal outputs and rejection assertions; no Firebase import or network.

### Suite C — details, dialog, state lifetime, and regressions

**F02-TC-033 — Inline toggle and single expansion** · Component/integration · FR-05; AC-15. P: `P1` ready. T: open A, open B, toggle B closed. E: details are inline on same route; `aria-expanded`/`aria-controls` connect each button and region; at most one region is open, and a second toggle collapses it. B: fixture services. V: role/attribute/region and route assertions.

**F02-TC-034 — Hidden Mentor collapses without reopening** · Component/integration · FR-05; AC-22. P: A expanded among loaded cards. T: query or select module so A disappears, then clear that control. E: A's details collapse when hidden and stay collapsed after A reappears; loaded cards and the other control remain intact. B: fixture services. V: visible regions and control values.

**F02-TC-035 — Dialog context and no mutation** · Component/integration · FR-05, FR-06; NFR-01; AC-16. P: loaded Mentor, selected module, spies on `createHelpRequest` and any write path. T: Ask for help, then Close; repeat without a module selected. E: modal names correct Mentor and selected known module when present, otherwise Mentor only; says requests cannot yet be sent; no submit/save/success UI, mutation call, or persisted context; query, selection, loaded pages remain. B: callable/module spies. V: dialog text, call counts, and retained controls/cards.

**F02-TC-036 — Dialog keyboard and focus** · Component/integration · FR-05, FR-06; NFR-02; AC-16, AC-18. P: two cards, one Ask trigger. T: activate by keyboard, Tab within dialog, close by Escape/Close, and repeat after trigger disappears due to filtering. E: focus enters heading or Close, modal keyboard path is operable, Escape closes without mutation, focus returns to Ask trigger or related card toggle fallback. B: fixture services; browser-specific confirmation in TC-044. V: `userEvent.keyboard`, active-element and dialog assertions.

**F02-TC-037 — Route revisit and late old-route responses** · Integration · FR-08; AC-17. P: query/selection/pages/expansion set; a later page or module read deferred. T: leave route, settle old response, return. E: a fresh first page is requested, all page-local controls/cache/details reset, old data never appears in new route. B: deferred callable/module overrides and memory-router navigation. V: request sequence and new-page DOM/control assertions.

**F02-TC-038 — Service or session identity changes in place** · Integration · FR-01, FR-08; NFR-01; AC-01, AC-17, AC-25. P: old first/later page or module response deferred; replace `servicesOverride` or emit new authenticated Student session identity while mounted. T: resolve old promises after change. E: page resets to the new identity's first page, never mixes old Mentor/module records; a newly unauthorized identity is denied by the guard. B: session subscription and deferred services. V: DOM, exact new call sequence, absence of old records.

**F02-TC-039 — React StrictMode effect replay** · Integration · FR-08; NFR-05; AC-19, AC-21. P: guarded route under `<StrictMode>` with a deferred first-page response. T: render, allow effect setup/cleanup replay while the response is pending, then resolve it. E: replay reuses the pending first-page request for the same page lifetime and service/session identity, as the approved TDD specifies; the page initializes with the expected Mentor order and no duplicate rendered records. A response from a prior route or identity cannot repopulate the current page (TC-037/038), while a genuine remount starts a fresh first page (TC-037). B: deferred callable and guarded router. V: observe no duplicate concurrent first-page request caused by replay, then assert ordered unique cards and the cross-referenced stale-response/remount outcomes; do not assert a fixed total network-call count across route lifetimes.

**F02-TC-040 — Firestore Rules access regression** · Existing security regression · NFR-01, NFR-04; AC-25. P: existing rules-test synthetic active/unauthenticated/inactive/unverified/mismatched identities. T: run the existing access suite. E: direct Mentor collection listing is denied; authorized per-ID module read succeeds; unauthorized module reads and workflow writes fail. B: Firestore Rules emulator, not the feature page. V: existing `access.test.ts` pass record; inspect its assertions before claiming coverage.

**F02-TC-041 — Backend callable eligibility/public output regression** · Existing integration regression · FR-01; NFR-01, NFR-04; AC-02, AC-25. P: existing callable emulator test with suspended profiles and two active Mentors. T: run its discovery case. E: eligible public records paginate in backend order; sign-in email and role are absent. B: Auth/Firestore/Functions emulators. V: existing `callables.test.ts` pass record; no new backend fixture required for this feature.

**F02-TC-042 — Existing Student and auth navigation regression** · Existing frontend regression · FR-01, FR-08; NFR-01; AC-01, AC-17. P: current dashboard, auth-flow, and scaffold route tests with discovery route assertion updated during implementation. T: run existing suites. E: dashboard and Student links work, wrong-role/signed-out states remain protected, other workspace routes retain behavior. B: memory router and `ServiceProvider` mock. V: existing `app.test.tsx` and `auth-flow.test.tsx` pass records.

**F02-TC-043 — Laptop/mobile responsive walkthrough** · Manual · NFR-03; AC-18. P: deterministic mock page with long biography/module title, list, filter, expansion, and dialog. T: inspect at representative laptop and narrow mobile viewports, including scrolling and orientation change. E: no horizontal overflow or clipped controls; cards, feedback, selector, dialog, and touch targets remain usable within `AppShell`; text wraps. B: local mock browser, no Firebase. V: record browser/version, viewport, screenshots, actions, observations, defects.

**F02-TC-044 — Accessibility and keyboard/assistive-technology walkthrough** · Manual · NFR-02; AC-18, AC-21, AC-22. P: mock success, initial/later loading, no-match, errors, metadata degradation, dialog. T: navigate solely by keyboard and inspect with at least one available screen reader/browser combination; check focus visibility/order, labels, toggle state, dialog trapping/Escape/return, status/error announcements, contrast and zoom/reflow. E: perceivable and operable controls/feedback consistent with WCAG 2.1 AA target; document any unmet criterion and environment. B: local mock browser. V: manual checklist and observed evidence; automated DOM assertions do not substitute for this case.

**F02-TC-045 — Boundary and documentation audit** · Manual/read-only review · FR-01, FR-08; NFR-01, NFR-04, NFR-05; AC-19, AC-25. P: implementation diff and developer documentation. T: inspect imports, service calls, changed-file list, package manifests, seed, and docs. E: no frontend `mentorProfiles` collection listing, direct page Firebase SDK use, request mutation, shared/backend/rules/seed/dependency change, or unrelated feature edit; default samples are recognizable; emulator's empty `moduleIds`/catalogue limitation is documented. B: source/diff audit, no external service. V: signed review notes with file/line evidence and `git diff`/status record.

## 5. Requirements traceability

Each row maps the approved PRD requirement to its ACs, planned cases, and levels. AC references follow the PRD's requirement-to-acceptance index; cases may also cover related behavior outside that index. **All rows are planned coverage, not passed evidence.** “I” = frontend integration, “C” = component, “A” = adapter, “R” = existing regression, “M” = manual. Pure unit coverage is optional only under the §2 condition.

| Requirement | PRD acceptance criteria | Planned case IDs | Levels |
| --- | --- | --- | --- |
| FR-01 | 01, 02, 15, 25 | 001–003, 031, 038, 041–042, 045 | I, A, R, M |
| FR-02 | 02–04, 13, 21, 23 | 004–011, 013, 018 | I, A |
| FR-03 | 05–07, 10, 20, 24 | 014–019, 023–024, 027 | I |
| FR-04 | 06, 08–11, 24 | 015–016, 018, 020–030 | I, C, A |
| FR-05 | 15–18, 22 | 003, 021, 033–036, 043–044 | I, C, M |
| FR-06 | 16 | 035–036 | C, I |
| FR-07 | 04, 07, 10, 12–14, 21, 23–24 | 006–009, 011–013, 019, 023–027 | I |
| FR-08 | 17, 19, 22 | 032, 034–035, 037–039, 042, 045 | I, C, A, R, M |
| NFR-01 | 01, 15–16, 25 | 002–003, 035, 038, 040–042, 045 | I, C, R, M |
| NFR-02 | 18, 21–22 | 013, 033–036, 043–044 | C, I, M |
| NFR-03 | 18 | 043 | M |
| NFR-04 | 02–03, 10, 19–20, 25 | 004–005, 017, 029–032, 040–041, 045 | I, A, R, M |
| NFR-05 | 19 | 032, 039, 045 | A, I, M |

For direct AC lookup, the following index ensures no acceptance criterion depends only on an implied range:

| AC | Cases | AC | Cases | AC | Cases | AC | Cases | AC | Cases |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | 001–002, 038, 042 | 02 | 004, 031, 041 | 03 | 005, 010 | 04 | 006–007, 011 | 05 | 014–015 |
| 06 | 016 | 07 | 019 | 08 | 015, 020–021 | 09 | 018, 022, 028 | 10 | 023–025, 027, 030 |
| 11 | 026 | 12 | 012 | 13 | 008, 011 | 14 | 006 | 15 | 003, 021, 033 |
| 16 | 035–036 | 17 | 037, 042 | 18 | 036, 043–044 | 19 | 032, 039, 045 | 20 | 017–018 |
| 21 | 009, 013, 023, 039, 044 | 22 | 034, 044 | 23 | 007 | 24 | 024, 027, 029–030 | 25 | 003, 029–031, 038, 040–041, 045 |

Manual evidence is necessary for **NFR-02/AC-18** because JSDOM cannot establish browser focus trapping, screen-reader announcements, visual focus, contrast, and reflow across real browsers; **NFR-03/AC-18** because DOM tests cannot establish layout/overflow and touch usability; and the source/document boundary portions of **NFR-01/NFR-04/NFR-05/AC-19/AC-25** because a behavior test alone cannot prove that no prohibited implementation path or unapproved file change exists. TC-045 is a review record, not a substitute for automated security tests.

### PRD scenario and extension mapping

| Scenario | Main path | Extensions |
| --- | --- | --- |
| SC-01 browse/continue | 001, 004–005 | Empty continuation 007; null cursor/empty catalogue 006; later failure 008–009. |
| SC-02 narrow loaded Mentors | 014–018, 020 | Incomplete/definitive no-match 019; expansion removal 034. |
| SC-03 inspect/ask | 021, 033, 035–036 | Inactive/absent/no modules 021; no module selected 035. |
| SC-04 module-data recovery | 023–027 | Selected filter and clear 026; confirmed absent 021, 024, 029. |
| SC-05 discovery recovery | 012 | Later failure/Retry 008; empty continuation after retry 012, 007. |

## 6. Test ownership and execution plan

Use the smallest practical set of **new or changed** files; a case ID may map to an `it` or a named parameterized row. Do not create a pure-unit test file unless a public pure function actually emerges. Keep case IDs in test names or a nearby table so reviewers can connect failures to this RTT.

| Proposed suite/file | Cases and fixtures | Dependencies | Independent? |
| --- | --- | --- | --- |
| `src/frontend/src/test/mentorDiscovery.test.tsx` (new) | 001–028, 033–039; cursor pages, module records/faults, deferred promises | Guarded memory router, RTL, `ServiceProvider` override, typed fixture helper | Yes, after TDD service/page interface exists. Group test blocks by pagination, filtering/metadata, details/dialog, lifetime. |
| `src/frontend/src/test/mentorDiscoveryAdapters.test.ts` (new) | 029–032; snapshots, callable outputs, cursor fixture | Existing Firebase SDK mocks, shared schemas, `mockServices` | Yes; can run without route/browser. If existing `firebaseServices.test.ts` is clearer, extend that file instead of adding this one. |
| `src/frontend/src/test/app.test.tsx` (existing, narrow update) | 042 and navigation part of 001 | Current route test setup | Yes; replace only obsolete scaffold expectation. |
| `src/frontend/src/test/auth-flow.test.tsx` (existing) | 002/042 regression | Existing mock sessions | Yes; add only a discovery-specific row if route test does not cover denial. |
| `src/functions/rules-tests/access.test.ts` and `src/functions/integration-tests/callables.test.ts` (existing; no feature edit planned) | 040–041; synthetic emulator records | Local Firebase emulators/JDK per repo setup | Each runs independently of frontend; may require documented emulator setup. |
| Browser checklist and review record (implementation review notes, not test code) | 043–045 | Mock app, laptop/mobile browser, assistive technology, implementation diff | Yes after UI exists. |

During implementation, run a focused frontend case/suite after each behavior-first slice, then the frontend test, lint, and typecheck scripts. Before independent review, run the complete frontend suite, relevant existing auth/navigation tests, frontend build, and record TC-043/044 observations. Before PR merge, run root `npm run check`, existing Rules and callable emulator regressions, TC-045 audit, and the independent/human reviews required by Sprint 1. The implementation conversation must confirm available emulator/JDK setup and use the documented commands below; no command is executed in this RTT phase.

Repository-supported commands, from the repository root unless indicated:

```sh
npm run test -w src/frontend
npm run lint -w src/frontend
npm run typecheck -w src/frontend
npm run build -w src/frontend
npm run check
npm run test:rules -w src/functions
npm run test:integration -w src/functions
```

For a focused Vitest file, use the existing frontend `test` script with Vitest's file filter, for example `npm run test -w src/frontend -- mentorDiscovery.test.tsx`; this is a script argument, not a new repository script. The Rules and integration commands above are already declared in `src/functions/package.json`; check their documented emulator context before execution and do not nest workspace commands inside `emulators:exec`. The existing integration suite is not a substitute for frontend behavior cases. No live Firebase or production access is required.

## 7. Completion and evidence criteria

Feature verification is complete only after implementation authorization and code exist, every applicable automated case above has a recorded passing result, the existing regression suites pass, frontend lint/typecheck/build and root checks pass, manual TC-043–045 observations are recorded truthfully, critical defects are resolved, and no unapproved Developer 1-owned backend/shared-contract/Rules/seed change appears in the diff. A failed or skipped case must be named with reason and owner; neither this plan nor an unrun case counts as passing evidence. Keep command, date, environment, test file, result, and relevant manual notes in the later implementation/review handoff. Any product or architecture change that alters expected outcomes goes back to the approved PRD/TDD and owner before this traceability is revised.

## 8. Independent consistency review

Read-only comparison with the approved PRD/TDD found all FR-01–08, NFR-01–05, AC-01–25, SC-01–05 main paths and their listed extensions mapped above. Negative and recovery paths include wrong role, no list permission, invalid callable/module data, empty-with-cursor pages, duplicate IDs, nonadvancing cursor, partial/full metadata failure, retry, stale async results, and unavailable mutation. Expected outcomes follow loaded-only filtering, selected-ID persistence during degradation, and the TDD's first-record-wins/one-expanded-card rules. The case catalogue uses route/service/adapter interfaces rather than page internals, groups related assertions, reuses existing backend security tests, and reserves responsive/assistive-technology judgment for manual evidence. No unresolved test-planning ambiguity or new product decision was found. The Mission Brief approval-metadata gate identified in §1 was resolved by the owner's subsequent approval on 2026-10-14.

## 9. Final cross-feature traceability — 2026-10-22

This matrix describes the original S1-D2-F02 verification plan. Its placeholder/unavailable help-request expectation is historical for that feature and was superseded by S2-D2-F01's implemented request flow. It is not a current negative acceptance criterion for the application. Existing execution evidence remains historical; no test was rerun or newly marked passed for this documentation revision.
