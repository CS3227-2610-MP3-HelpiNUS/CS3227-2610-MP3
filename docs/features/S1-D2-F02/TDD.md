# Technical Design Document — S1-D2-F02 Student Mentor Discovery and Module Filtering

**Status:** Approved  
**Date:** 2026-10-14  
**Approver:** Repository owner  
**Approval date:** 2026-10-14  
**Branch:** `royden/feat-mentor-discovery`  
**Source:** [Approved PRD](PRD.md), approved 2026-10-14  
**Implementation authorization:** Not granted

## 1. Technical overview

### Objective and inherited constraints

Replace only the `/student/mentors` preview with a Student discovery page. Preserve the Sprint 1 `ProtectedRoute`, `AppShell`, navigation, service provider, shared Zod schemas, Firebase configuration, Firestore Rules, and `discoverMentors` callable. Results are the backend's eligible public Mentor records in backend order. Search and module filtering inspect loaded records only. No help-request mutation, new callable, shared schema change, dependency, production data access, or emulator seed change is proposed.

The PRD is the binding product specification and is explicitly approved. The Mission Brief now records repository-owner approval dated 2026-10-14, as also noted in the approved Requirements-to-Tests document. That resolves the earlier Mission Brief approval-metadata issue; it does not authorize implementation. Sprint 1's generic `zh/` branch convention differs from the owner's explicit branch for this feature; this document uses the verified feature branch and does not create another branch.

### Existing implementation and proposed architecture

- `appRoutes.tsx` already puts `/student/mentors` below `ProtectedRoute role="STUDENT"` and `AppShell`; the dashboard and desktop/mobile navigation already point there. Change only that route's element to a new `MentorDiscoveryPage`. Other `WorkspacePage` routes stay as they are.
- `HelpiNUSServices.callables.invoke('discoverMentors', input)` is already typed. `firebaseServices` already invokes and validates callable output with `callableSchemas`; the mock callable client already accepts typed fixtures. **No additional discovery service method is needed.** The page always supplies `{ limit: 20 }` plus the prior cursor on continuation.
- Add one `modules.getById(id): Promise<Module | null>` service interface. Firebase uses authorized `getDoc(doc(firestore, 'modules', id))`, returning `null` only for a confirmed absent document and parsing present data with shared `moduleSchema`. The mock adapter supplies deterministic module records or `null`. Errors reject. This resolves only IDs referenced by loaded Mentors; it does not list a catalogue, so the selector is the resolved active subset of loaded support.
- `MentorDiscoveryPage` owns page-local state, request guards, derived search/filter results, and presentation. Small presentational pieces may live in the same file initially; extract only if the page becomes hard to read. There is no new global store or URL state.

```text
ProtectedRoute(STUDENT) → AppShell → MentorDiscoveryPage
                                      ├─ search + active-module selector
                                      ├─ status/notice and Retry
                                      ├─ Mentor list → inline details → Ask for help
                                      ├─ Load more
                                      └─ informational dialog
           useServices() → callables.invoke('discoverMentors')
                         → modules.getById(id)
```

## 2. Repository impact analysis

| Existing file | Smallest implementation change and reason | Existing behavior preserved |
| --- | --- | --- |
| `src/frontend/src/routes/appRoutes.tsx` | Import the new page and replace only `/student/mentors`'s `WorkspacePage` element. | Same guard, shell, path, and every other route. |
| `src/frontend/src/services/contracts.ts` | Add `modules.getById(id): Promise<Module \| null>` to `HelpiNUSServices`; reuse its existing `Module` import. | Session, dashboard, and generic callable interfaces stay intact. |
| `src/frontend/src/services/firebaseServices.ts` | Implement authorized module document get and `moduleSchema` validation; leave discovery on existing callable method. | Existing auth and dashboard paths remain unchanged; no Mentor collection query. |
| `src/frontend/src/services/firebaseServiceProxy.ts` | Forward the new module method through existing lazy loading. | Existing lazy Firebase selection and forwarding remain unchanged. |
| `src/frontend/src/services/mockServices.ts` | Add the module adapter and a default typed `discoverMentors` fixture with several public Mentors and a cursor scenario; do not alter dashboard sample objects. | Existing dashboard preview, session fixture, and missing-fixture behavior for other callables remain. |
| `src/frontend/src/pages/WorkspacePage.tsx` | Remove its now unreachable `/student/mentors` preview entry and conditional Mentor card only, if desired during integration. | Other workspace scaffolds retain their copy and layout. |
| `src/frontend/src/App.css` and possibly `src/frontend/src/index.css` | Add scoped discovery/card/dialog/responsive rules and a visible select focus rule. Reuse existing color tokens, buttons, panels, spacing, and breakpoints. | Existing shell and dashboard selectors are not broadened. |
| `src/frontend/src/test/app.test.tsx` | Update the one scaffold navigation assertion and its memory-router element to the discovery page; retain the other foundation assertions. | Existing navigation, dashboard, and route-guard coverage continues. |
| `src/frontend/README.md` or `docs/DeveloperGuide.md` | Document mock discovery usage and that the unchanged emulator seed has no module catalogue and cannot demonstrate filtering. | Existing setup instructions remain. |

Proposed additions: `src/frontend/src/pages/MentorDiscoveryPage.tsx`; focused `src/frontend/src/test/mentorDiscovery.test.tsx` and module-adapter/mock fixture tests as needed during implementation. A small `src/frontend/src/services/mockMentorDiscovery.ts` fixture file is optional only if fixture complexity would obscure `mockServices.ts`. No `src/shared`, `src/functions`, Firestore Rules, backend tests, package manifest, or emulator seed changes are planned. Developer 1-owned shared service files and routes are touched only at the narrow points above; keep those edits isolated and rebase against their latest work before integration.

## 3. Component architecture

`MentorDiscoveryPage` obtains `services` through `useServices`, starts the first page on mount, and owns all discovery state. It renders a labelled text input, a labelled native `<select>` with an explicit “All modules” choice, and a separate “Clear module” action when a selection exists. A native select is sufficient for keyboard interaction and avoids a new UI dependency. Its choices are unique active resolved modules supported by loaded Mentors, in deterministic code-then-title order; changing choices never reorders Mentor cards. While metadata is loading or degraded, selector changes are disabled and the current selection is still displayed. If the selected module cannot currently be resolved, show its last known label if available, otherwise “Selected module information unavailable”; the separate clear action remains operable.

Each card shows only public `displayName` and a toggle button. The inline details region shows the public biography when nonempty and supported modules in the public `moduleIds` order: real code/title for resolved records, “Inactive” for resolved inactive records, “Module information unavailable” for confirmed absent/unresolved records, and “No modules listed” for an empty array. Empty biography is simply omitted. `aria-expanded`, `aria-controls`, stable IDs, and a named details region connect toggle and content. Store one `expandedMentorId`: at most one Mentor's details may be open; opening another collapses the previous one, and toggling the open Mentor collapses it. “Ask for help” opens a modal informational dialog with the Mentor name and currently selected module, if any, captured from the current page state. The dialog has only Close (plus Escape); there is no form or submit path.

The page distinguishes first-page loading, further-page loading, metadata loading/degradation, initial/later-page errors, catalogue-empty, no Mentors, and no visible matches. Existing `empty-panel`/button patterns and scoped styles are reused. Use the page component's mount lifetime so route departure unmounts it and resets query, selection, cursor, records, expansion, dialog, and cache on return. No `sessionStorage`, URL parameters, or cross-page cache.

## 4. Services and data contracts

### Discovery

The existing public interface is `services.callables.invoke('discoverMentors', { cursor?: string, limit: 20 }): Promise<DiscoverMentorsOutput>`. First call omits `cursor`; later calls pass the exact previous `nextCursor`. `DiscoverMentorsOutput` is `{ mentors: PublicMentor[], nextCursor: string | null }`, where `PublicMentor` has only `userId`, `displayName`, `biography`, `moduleIds`. The shared input caps `limit` at 50; the feature fixes it at 20. Firebase's existing generic callable path validates output with `callableSchemas.discoverMentors.output`. The feature never calls `getDoc` or `getDocs` on `mentorProfiles`, never uses dashboard mock `User` data as discovery data, and never sends query/module values to the callable. A rejection is a discovery error; do not reinterpret it as an empty page.

Mock discovery uses the existing typed `createMockCallableClient({ discoverMentors: async ({ cursor, limit }) => ... })` handler. The handler selects literal responses by the **input cursor**: `undefined` yields the initial page; each fixture `nextCursor` is a key for the next page; the final page returns `nextCursor: null`. It checks `limit === 20` in feature fixtures so wrong pagination calls fail visibly. An unexpected cursor rejects instead of returning an empty success. The default mock service includes a successful multi-Mentor sequence; scenario-specific handlers supplied through `ServiceProvider` can return an empty page with a continuation cursor, reject at a selected cursor, or reject once and then return that same page on Retry using a counter scoped to that scenario. Thus errors and exhaustion are deterministic without changing `MockCallableFixtures` or the generic mock client's missing-fixture behavior. Validate default and scenario fixture outputs against the shared discovery output schema at the feature fixture-construction boundary, since `createMockCallableClient` currently provides TypeScript typing but does **not** perform runtime schema validation.

### Module metadata

Add to `HelpiNUSServices`:

```ts
modules: { getById(id: string): Promise<Module | null> }
```

Caller inputs are IDs from validated discovery records; deduplicate before requests. The Firebase adapter calls `getDoc` for `modules/{id}` under the current authenticated session and existing `activeUser()` read rule. A confirmed missing snapshot returns `null`. A present snapshot is parsed with `moduleSchema`, assigning the canonical document ID to `id`; if a stored `id` exists and disagrees with the document ID, reject as corrupt metadata rather than silently changing identity. A permission/network failure or invalid present document rejects and is treated as degraded metadata. Do not use `getDocs` on the whole catalogue: no full catalogue is needed to satisfy the PRD. The mock adapter applies the same schema and result semantics. There is no backend or shared contract addition.

The page stores a session-local map `moduleId → Module | null` for successful/confirmed-absent reads, a set of failed IDs, and a set of pending IDs. Request each ID only if it is in none of those collections; this prevents overlapping page loads from reading the same ID twice. On Retry, move failed IDs to pending and request them again; if a new page introduced IDs, queue those once as well. Keep successful entries when one read fails. Use `Promise.allSettled` per batch so a partial failure can be identified rather than losing completed values. A batch with zero IDs is complete immediately. Derive metadata readiness from all IDs referenced by currently loaded Mentors: ready only when each is resolved or confirmed absent and no ID is pending or failed. A successful retry clears degradation only when that condition holds. Do not display raw Firebase errors or document contents.

## 5. Data flow and state management

The page keeps `mentors[]`, `nextCursor`, `initialStatus`, `nextPageStatus`, `moduleMap`, `pendingModuleIds`, `failedModuleIds`, `query`, `selectedModuleId`, `expandedMentorId`, and `dialogMentorId`; metadata status is derived from the ID collections. `nextCursor === null` means exhaustion only after a successful page; before the first success, status decides whether data is pending/error. Keep exact backend response order. If an overlapping page repeats a `userId`, retain the first loaded record and skip the duplicate to prevent repeated cards without reordering; this is a client resilience rule, not a ranking. A later empty page with a non-null cursor is a successful incomplete page, never a terminal state. Cursor advancement occurs only after success. If a malformed/unchanged cursor would cause a repeat loop, surface a recoverable pagination error rather than automatically requesting again; do not claim exhaustion.

1. **Mount:** initiate `{ limit: 20 }` once per page lifetime and session identity. Show initial status. On success store Mentors/cursor, then resolve distinct module IDs. Mentor cards may become available before metadata finishes; announce that module information is loading and search currently covers names/biographies until resolution completes. On failure show initial error and Retry; no empty-success message.
2. **Load more:** available only after a successful page with a cursor and while no page request is in flight. Synchronously guard repeated activation with an in-flight ref as well as disabled button state. Request `{ cursor: nextCursor, limit: 20 }`. On success append, advance cursor, resolve new module IDs, recompute visible results/options under unchanged controls. On failure keep all loaded data and current cursor; Retry targets exactly that cursor. Never mark a failed page loaded.
3. **Search/filter:** derive results from loaded `mentors[]` on render. Normalize text with `.trim().toLocaleLowerCase()` and match case-insensitive substrings of public display name/biography. Only when metadata is complete also match actual code/title of resolved supported modules, including resolved inactive modules. Missing IDs never contribute fabricated text. Apply the selected module by membership in `moduleIds`, then text by AND, preserving Mentor order. Changing either control performs no network request. Keep a selected module filter applied through metadata degradation; clear it only on the explicit clear action. If control changes make the expanded ID invisible, set it to `null` and do not restore it when the control is cleared.
4. **Metadata:** start ID reads after each successful page; absent records enter the map as `null`, failed reads enter the failed set, and resolved records enter the map. During pending reads, disable selector changes and label incomplete module search. If any read fails, show the degraded notice and Retry; keep already known labels in details but search only name/biography. Retry is guarded against duplicate activation. If all reads settle without failure, regenerate selector choices from loaded support and active records. If no choices exist, explain that no active supported modules are available while Mentor browsing continues. Do not erase a currently selected ID because metadata is temporarily unavailable.
5. **Expansion/dialog:** expansion and dialog do not alter loaded records or controls. The dialog captures Mentor name and selected module's known code/title at opening; if no selection, mention only Mentor. Closing discards that temporary context. On route unmount, generation tokens/active flags discard every late discovery or module response. If `services` or authenticated session identity changes while the page remains mounted, reset page data and start a fresh first page; never mix records from different sessions.

Use a page-generation counter for unmount/session changes and a request token for each discovery/module batch. Commit a response only if its generation and expected cursor/batch still match. The in-flight ref prevents same-page duplicate requests before React applies disabled state. `main.tsx` currently wraps the app in React development `StrictMode`, which can replay effect setup/cleanup. Keep the initial in-flight promise in a page-lifetime ref keyed by service/session identity; effect cleanup invalidates its consumer but does not issue or cancel another request, and replayed setup attaches a current consumer to that same promise. Clear the ref when it settles; a genuine route remount gets fresh page state and a fresh request. Apply the same pending-ID guard to module reads. Late results from an old generation never append records or repopulate a left page. Failed retries do not spawn concurrent retries. There is no background auto-pagination, so an empty page with a cursor always leaves a manual Load more action.

## 6. Error handling and recovery

| Condition | Exact page behavior and recovery |
| --- | --- |
| Initial discovery pending/fails | Accessible loading status, then a full-page discovery error and Retry. No “No mentors available.” Retry first page with limit 20. |
| Later page pending/fails | Keep cards, filters, details and cursor; announce additional loading separately. On failure show inline page error and Retry for the same cursor; avoid success/count claims. |
| Successful empty page, cursor present | If no records loaded, show “No mentors loaded yet. Load more to continue.” Always offer manual Load more. If records already loaded, retain them and the continuation control. |
| Exhausted zero-record catalogue | Show “No mentors available.” No Load more. |
| No visible matches, cursor present | Say “No matches among loaded mentors.” Keep Load more and controls available. |
| No visible matches, exhausted | Say no matches and offer clear query/filter actions; do not call this an empty Mentor catalogue. |
| No active resolved supported modules | Disable or empty the selector with a clear explanation; keep Mentor browsing and name/biography search usable. This is not a metadata error. |
| One or all referenced reads fail | Keep Mentors and successful module labels, show metadata notice and Retry, disable selector changes, and explicitly state name/biography-only search. Keep selected ID's filter and separate Clear module action. Retry failed IDs. |
| Confirmed absent module | Show “Module information unavailable” only for that reference; do not enter degraded state. |

Use human-readable fixed error messages and `role="alert"`/live status regions; no raw backend messages. A permission denial and schema failure use the same recoverable module notice, though repeated permission denial may require session recovery outside this page. An unexpected callable schema failure is a discovery failure. There is no mutation or optimistic success state.

## 7. Authorization, privacy and accessibility

`ProtectedRoute role="STUDENT"` remains the entry guard, backed by the existing authoritative session check. The callable checks active account status server-side and emits only public Mentor fields. Modules use existing active-user Firestore authorization through the adapter. The UI renders only callable public fields and authorized module code/title/active flag; no `User` email, account role/status, full Mentor profile, or private dashboard data. The dialog never calls `createHelpRequest` or any write path. Default mock Mentor fixture names visibly identify them as sample records, avoiding a new adapter-mode flag or page import of the mock adapter; Firebase mode renders the returned names as supplied and never labels live results as fixtures.

Use semantic headings/list/cards, associated input/select labels, named Load more/Retry/Clear buttons, and visible focus styles. The toggle announces `aria-expanded` and points to the inline region. Put initial and further-page loading in distinct polite status messages, errors in an alert, and no-match/metadata notices in perceivable text. A native `<dialog>` with `showModal()` may provide modal focus trapping and Escape; explicitly focus its heading or Close button on open, prevent backdrop/close behavior from implying submission, restore focus to the triggering Ask for help button on close, and fall back to the related card toggle if that trigger has disappeared. Use existing CSS breakpoints, allow long module titles and biographies to wrap, maintain touch target and keyboard usability, and avoid horizontal overflow at mobile width. Verify against the existing WCAG 2.1 AA target during implementation.

## 8. Mock data and testability

The public test seam is the rendered guarded route through `ServiceProvider servicesOverride`; the adapter seam is `HelpiNUSServices.callables` plus the new `modules.getById`. Do not mock private page helpers. Reuse Vitest, React Testing Library, `userEvent`, memory router, `createMockCallableClient`, and existing Firebase adapter mocks. No tests are written in this design phase; the next Requirements-to-Tests artifact will fix exact cases and names after owner approval of this TDD.

Use literal deterministic public Mentor records with distinct names/biographies and IDs; multiple real module records with active/inactive flags; one absent ID; one Mentor with no IDs; and at least two pages with opaque cursors. Exercise the same cursor-keyed fixture handler for initial page, later page, final `null` cursor, empty page with continuation, unexpected cursor, initial/later rejection, and a one-time failure followed by successful Retry at the same cursor. Include one failed module read alongside successful reads, all module reads failing, retry recovery, and deferred responses. Fixture objects must contain only the callable's public Mentor fields. Do not reuse `mockDashboard.mentors` because it contains `User` private fields. Mock overrides should let tests assert exact `{ cursor, limit: 20 }` requests and that no `createHelpRequest` invocation or module write occurs. The existing emulator seed remains untouched; document that it has an empty Mentor `moduleIds` array and no module catalogue, so it cannot demonstrate module filtering without separately approved seed changes.

Planned behavior evidence: route/role guard; 20-item boundary and append order; loaded-only search and combined filter; selector growth and inactive/missing/empty module displays; all loading/empty/no-match/error paths; module partial failure and retry; rapid duplicate Load more/Retry activations cause one request per cursor/attempt; deferred old-page or old-session results do not alter current results; only one details region is expanded; dialog focus and no mutation; route revisit reset; responsive and keyboard checks. Add a development `StrictMode` render case with a deferred initial response to verify effect replay shares one in-flight first-page request and yields one visible page, plus a genuine route-leave/return case that makes a fresh request and ignores the prior response. Prefer observable text, controls, calls at the service seam, and focus behavior over internal state assertions. Adapter tests separately establish callable schema validation and module `null`/valid/rejected semantics. No live Firebase is needed for the core suite.

## 9. Implementation decomposition

Tasks are proposed for a later authorized implementation. Tests should be added in small behavior-first vertical slices at the agreed seams, then just enough code for each slice. Do not have agents edit the same file concurrently; Sprint 1 allows at most two implementation agents.

| Task | Dependencies; owned files | Behavior and PRD evidence | Verification |
| --- | --- | --- | --- |
| A. Service data seam | Approved TDD; `contracts.ts`, `firebaseServices.ts`, `firebaseServiceProxy.ts`, `mockServices.ts`, optional fixture file; adapter tests | Typed module get, schema validation, callable fixture pages; FR-01/04/08, NFR-04/05, AC-19/24/25 | Adapter/mock fixture tests, typecheck. |
| B. Discovery page core | A; new `MentorDiscoveryPage.tsx`, `appRoutes.tsx`, route/page tests | Guarded route, first page, cursor/append/empty/error/Retry; guard duplicate page requests, stale responses and StrictMode effect replay; FR-01/02/07, AC-01–04/12–14/21/23 | RTL with cursor-keyed fixtures, deferred responses, rapid activation and StrictMode route rendering. |
| C. Search, modules, details | B; page and its tests | Loaded-only AND search, selector growth/degradation, single open details region and expansion reset; guard duplicate/stale module reads; FR-03/04/05, AC-05–11/15/20/22/24 | RTL partial-fault, overlapping-page and delayed-response scenarios. |
| D. Dialog and presentation | C; page, `App.css`/`index.css`, tests | Accessible dialog, no mutation, responsive and status feedback; FR-06/07, NFR-01–03, AC-16/18 | Keyboard/focus tests and manual laptop/mobile accessibility review. |
| E. Integration cleanup/docs | B–D; `app.test.tsx`, optional `WorkspacePage.tsx`, frontend README or Developer Guide | Replace old scaffold assertion, preserve other routes, explain mock and emulator limitation; FR-08, AC-17/19 | Relevant frontend tests, typecheck, lint, visual review. |

A's fixture and adapter work could run in parallel with a page skeleton only if ownership is disjoint and the agreed interface is frozen first. B–D share the page and must integrate sequentially. E follows functional integration. No production/backend workstream is needed.

## 10. Risks and open technical decisions

| Risk or question | Mitigation / decision | Owner approval needed? |
| --- | --- | --- |
| Bounded backend scan can return zero eligible Mentors with a continuation cursor. | Manual Load more and neutral incomplete state; never auto-drain or claim exhaustion. | No; PRD explicitly decides this. |
| Module reads can be partial, slow, denied, or invalid. | Per-ID settled results, session-local cache, degraded global selector/search, Retry only failed IDs, preserved selected filter. | No; frontend mechanism within approved behavior. |
| Cursor pages can repeat a Mentor or yield a nonadvancing cursor. | Deduplicate repeated `userId` while preserving first position; nonadvancing cursor becomes a recoverable page error rather than an infinite loop. | No backend change proposed; investigate if observed. |
| A selected module's metadata becomes unavailable after selection. | Keep ID membership filter and separate clear action; retain known label if possible. | No; PRD requires this. |
| Existing mock callable helper does not runtime-validate fixtures. | Validate discovery fixtures at fixture boundary without changing shared contracts. | No. |
| The Mission Brief approval-metadata issue was resolved after this TDD was drafted; the remote baseline was not freshly verified. | The Mission Brief now records owner approval dated 2026-10-14, confirmed in the approved Requirements-to-Tests document. Recheck the branch integration base before implementation. | No further Mission Brief approval is needed; a branch-base conflict would require a decision. |
| Browser/dialog accessibility differences and narrow layout. | Prefer native controls/dialog, explicit focus return, and manual keyboard/mobile verification. | No new dependency or product decision. |

There are no unresolved product decisions or proposed shared/backend contract changes. TDD and Mission Brief approvals are recorded; separate implementation authorization remains required. If implementation reveals that authorized per-ID module reads are insufficient, stop that work and seek approval for a revised contract rather than silently adding a callable.

## 11. Requirements coverage and handoff

| PRD requirement | Design sections | Acceptance criteria covered |
| --- | --- | --- |
| FR-01 | 1–4, 7 | AC-01, AC-02, AC-15, AC-25 |
| FR-02 | 4–6 | AC-02, AC-03, AC-04, AC-13, AC-21, AC-23 |
| FR-03 | 3, 5–6 | AC-05, AC-06, AC-07, AC-10, AC-20, AC-24 |
| FR-04 | 3–6 | AC-06, AC-08, AC-09, AC-10, AC-11, AC-24 |
| FR-05 | 3, 5, 7 | AC-15, AC-16, AC-17, AC-18, AC-22 |
| FR-06 | 3, 5, 7 | AC-16 |
| FR-07 | 3, 5–6 | AC-04, AC-07, AC-10, AC-12, AC-13, AC-14, AC-21, AC-23, AC-24 |
| FR-08 | 5, 8–9 | AC-17, AC-19, AC-22 |
| NFR-01 | 4, 7 | AC-01, AC-15, AC-16, AC-25 |
| NFR-02 | 3, 6–8 | AC-18, AC-21, AC-22 |
| NFR-03 | 3, 7–9 | AC-18 |
| NFR-04 | 1–4, 8 | AC-02, AC-03, AC-10, AC-19, AC-20, AC-25 |
| NFR-05 | 4, 8–9 | AC-19 |

All AC-01 through AC-25 appear above and have behavior or verification treatment in sections 3–9. The approved interface is limited to the existing typed callable and one module get; implementation requires no shared/backend changes. `docs/features/S1-D2-F02/RequirementsToTests.md` has since been completed and approved, and the Mission Brief approval metadata has been reconciled. This document does not authorize implementation, test execution, commit, or push.
