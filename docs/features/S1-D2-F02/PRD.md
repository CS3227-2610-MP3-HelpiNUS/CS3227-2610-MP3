# Product Requirements Document — S1-D2-F02 Student Mentor Discovery and Module Filtering

**Status:** Approved  
**Approver:** Repository owner  
**Approval date:** 2026-10-14  
**Implementation authorization:** Not granted  
**Branch:** `royden/feat-mentor-discovery`  
**Implementation status:** Not started for this feature  
**Source:** [Approved Mission Brief](../../mission-brief/S1-D2-F02-mentor-discovery.md)

## Document authority

The owner's approved Grill-Me decisions, subsequent approved edge-case clarifications, and the Mission Brief govern this feature's product scope and behavior. The approved Sprint 1 specifications and shared schemas govern existing architecture, authorization, and contracts. This PRD makes those decisions testable; a TDD may choose implementation mechanisms but may not change their outcomes. A genuine conflict between these sources requires owner review before the affected behavior is designed or changed. The MP2 Desk Officer PRD is a quality reference, not an authority for this feature.

## 1. Purpose and outcome

An authenticated Student can browse eligible Mentors at `/student/mentors`, narrow the mentors already loaded by text and academic module, inspect public Mentor details, and learn how to begin asking for help once request creation becomes available. The page must be honest about pagination, incomplete module information, and the unavailable help-request workflow.

This PRD defines product behavior for a subsequent TDD and implementation conversation. It does not authorize implementation, change shared backend contracts, or define a Requirements-to-Tests document.

## 2. Scope and current capability

| Area | Already implemented in Sprint 1 | Required by this feature | Still a placeholder after this feature |
| --- | --- | --- | --- |
| Access and navigation | Student route, role guard, AppShell link, dashboard link | Replace the `/student/mentors` preview with discovery | Other Student workspace routes remain outside this feature |
| Mentor data | `discoverMentors({ cursor?, limit? })` returns eligible public records and `nextCursor` | Use the callable through frontend services; display and paginate records | Server-side search and filtering |
| Modules | Shared `Module` schema and authorized reads of `modules`; no dedicated frontend catalogue service | Resolve metadata through the established service boundary | Module administration or changes to module contracts |
| Mentor details | Public name, biography, and module IDs in discovery results | Inline public details with readable modules where known | Additional private profile fields, availability, or booking |
| Help requests | Shared `createHelpRequest` contract; handler currently returns `unavailable` | Informational “Ask for help” dialog | Creating, sending, saving, or tracking a request |
| Development data | One mock Mentor and a callable fixture mechanism; emulator seed has one Mentor with no modules and no catalogue | Representative deterministic mock scenarios | A populated emulator catalogue or production data migration |

The approved Sprint 1 [requirements](../../../workflow/specs/sprint-1/requirements.md), [architecture](../../../workflow/specs/sprint-1/architecture.md), and [contracts](../../../workflow/specs/sprint-1/contracts.md) remain authoritative. React components use `HelpiNUSServices`; collection discovery uses `discoverMentors`, never a client collection query on `mentorProfiles`. Module reads use an authorized service path. No sign-in email, account role/status, or other private user fields appear in discovery.

### Out of scope

Creating or tracking help requests; Mentor onboarding or profile editing; conversations; availability; booking; recommendations or ranking; server-side search/filter inputs; new backend capabilities; shared schema or callable changes; production Firebase changes; new dependencies; and infrastructure refactoring.

## 3. User workflows

1. **Browse:** A Student opens “Find a mentor.” The page loads up to 20 eligible public Mentors. If `nextCursor` exists, the Student can load another page. Loaded records remain in backend order; the page does not claim to rank Mentors.
2. **Search and filter:** The Student enters text and/or chooses a module. Both controls narrow only the records already loaded. “Load more” remains available while a cursor exists and can reveal additional matching Mentors or additional filter options. Clearing text keeps the module choice; clearing the module choice keeps text.
3. **Inspect:** The Student expands a Mentor inline to read the public biography and supported modules. Known module codes and titles are shown; known inactive modules are identified. Search and filter state remains intact while details are open.
4. **Ask for help:** The Student activates “Ask for help” for a Mentor. A dialog identifies that Mentor and the selected module, if any, and explicitly says requests cannot yet be sent. Closing the dialog returns to discovery without creating or saving anything.
5. **Recover:** A failed discovery request offers Retry. A failed later page leaves earlier records visible. Failed module metadata leaves discovery visible, explains reduced search/filter capability, and offers Retry.

## 4. Functional requirements

### FR-01 — Access and public data

- The existing Student-only route and navigation remain the entry point. The existing role guard determines access.
- Discovery requests pass through frontend services to `discoverMentors`. Render only the callable's approved public Mentor fields plus authorized module metadata.
- The discovery page must use live callable data when the Firebase adapter is selected and deterministic fixtures when the mock adapter is selected. Mock data must be recognizably fixture content where the existing preview convention requires it.

### FR-02 — Cursor pagination and list order

- Request 20 Mentors per page. Use each returned `nextCursor` for the next request; append the next result without removing previously loaded Mentors.
- Preserve the backend's order, including when search/filter produces a subsequence. Do not describe the order as a ranking or as alphabetical.
- Show “Load more” only while a continuation cursor exists. An empty page with a cursor is incomplete, so it must not be treated as the end of discovery.
- A failed later-page request must leave existing results and control state intact. Retry the failed page without presenting it as loaded.

### FR-03 — Loaded-only text search

- Trim leading/trailing whitespace. A blank resulting query applies no text restriction.
- Match a case-insensitive substring of a Mentor's display name, biography, or the real code/title of any resolved supported module. Never derive a code or title from a module ID.
- Search applies to loaded Mentors only and combines with the selected module using AND. It must not trigger a new backend search contract or claim to cover unloaded Mentors.
- Clearing the text query restores all loaded Mentors that satisfy the current module choice.

### FR-04 — Module selector and metadata

- The selector contains only **active**, resolved modules supported by at least one loaded Mentor. It starts with no module selected. Add qualifying options as more Mentors load; keep a valid current choice selected.
- Selecting a module matches loaded Mentors whose public `moduleIds` contain that module ID. Clearing the choice restores all loaded Mentors matching the text query.
- Details show a known inactive module with its real code/title and an “Inactive” label, but the selector excludes it. An unknown module reference uses “Module information unavailable.” A Mentor with no module IDs uses “No modules listed.”
- If the module catalogue is empty or no loaded Mentor supports an active resolved module, show a clear unavailable/empty selector state while keeping Mentor browsing usable.
- If module metadata loading fails, keep loaded Mentors visible, show a notice and Retry, disable changes to the module selector, and make text search explicitly name-and-biography-only until metadata recovers. Preserve any existing selected module and its filtering while the selector is disabled; a separate clear/reset action must remain available so the Student is not trapped by the selection. Restore module codes/titles, selector choices, and full search fields after a successful retry.
- A failed read for any referenced module follows that degraded metadata state, even if other module reads succeeded. A module record that is confirmed absent follows the unknown-module fallback instead. Already resolved code/title data may remain visible in details during a read failure, but it does not keep module search or selector changes enabled.

### FR-05 — Inline Mentor details

- Selecting a Mentor reveals details inline without navigating away. Show only the approved public name, biography, and supported-module information. An empty biography must not produce invented content.
- Expansion and collapse must be operable by keyboard and announced accessibly. Opening details or the help dialog must not clear the current query, module choice, or loaded pages.
- If a changed search or module filter removes an expanded Mentor from the visible results, collapse those details. Clearing the control does not automatically reopen them.

### FR-06 — Help-request initiation placeholder

- An active “Ask for help” control from the Mentor context opens an informational dialog. It names the selected Mentor and, when the module filter is selected, that module.
- The dialog explicitly states that help requests cannot yet be sent. It has a close action and no submit, save, or success state. It does not invoke `createHelpRequest` or any other mutation, and it does not persist Mentor/module context for a future visit.

### FR-07 — Empty, incomplete, loading, and error states

- Distinguish initial loading from loading an additional page. Keep already loaded content available during additional-page loading.
- If discovery is exhausted with zero Mentors, show “No mentors available.” Do not show this definitive state while a continuation cursor remains.
- If no Mentor has been loaded but a continuation cursor remains, show “No mentors loaded yet. Load more to continue.” and retain the manual “Load more” action.
- If controls produce zero visible matches and a cursor remains, state that there are no matches **among loaded Mentors** and keep “Load more” available. Once exhausted, show a definitive no-match state with a way to clear the relevant controls.
- Initial discovery failure shows an understandable error and Retry. Later-page failure retains loaded content and offers Retry for that page. Module metadata failure follows FR-04 rather than replacing the Mentor list with a full-page error.

### FR-08 — State lifetime and deterministic demo

- Query, selected module, loaded pages, and expanded details are page-local state. They remain through inline interaction and the dialog; leaving and returning to the route resets them. No URL query parameters or shareable filter links are required.
- Mock scenarios must be deterministic and represent multiple Mentors and modules, different search/filter outcomes, pagination, missing/inactive metadata, empty results, and recoverable errors. The current emulator seed is not changed for this feature; documentation must state that it cannot demonstrate module filtering without additional seed data.

## 5. Non-functional requirements and boundaries

- **NFR-01 — Authorization and privacy:** Reuse the existing Student route guard. Never list `mentorProfiles` directly from the client. Do not display private `User` fields or make an unavailable mutation.
- **NFR-02 — Accessibility:** Meet the Sprint 1 WCAG 2.1 AA target. Search, selector, pagination, expansion, Retry, and dialog must have accessible names and keyboard behavior. Loading, no-match, and errors must be perceivable; dialog focus and return focus must be managed.
- **NFR-03 — Responsive behavior:** Preserve usable laptop and mobile browser layouts within the existing `AppShell` and styling system.
- **NFR-04 — Service integrity:** Keep React dependent on frontend adapters, validate data with the established shared schemas, and use existing callable and Firestore authorization boundaries. Add only minimal feature-specific frontend service/mock seams needed for discovery and module resolution.
- **NFR-05 — Verification independence:** Core behavior must be verifiable with deterministic mocks and frontend tests without a live Firebase project. No new dependencies are required.

## 6. Main scenarios and extensions

### SC-01 — Browse and continue discovery

1. An active Student opens “Find a mentor.”
2. The first page loads up to 20 eligible public Mentors in backend order.
3. A continuation cursor makes “Load more” available.
4. The Student loads another page; its Mentors append without removing earlier results.

Extensions:

- An empty page with a cursor remains incomplete. If no Mentor has yet loaded, the neutral continuation message appears.
- A null cursor removes “Load more”; an exhausted empty list shows “No mentors available.”
- A later-page failure follows SC-05 without discarding loaded Mentors.

### SC-02 — Narrow loaded Mentors

1. The Student enters text and selects an active module supported by a loaded Mentor.
2. Only loaded Mentors matching both controls remain visible in backend order.
3. Clearing either control retains the other; loading another page updates matches and module choices under the current controls.

Extensions:

- With a cursor, zero matches are qualified as being among loaded Mentors and “Load more” remains available.
- After exhaustion, zero matches become a definitive no-match state with a clearing action.
- If a control excludes an expanded Mentor, its details collapse and do not reopen automatically when that control is cleared.

### SC-03 — Inspect a Mentor and ask for help

1. The Student expands a Mentor inline and reads the public biography and supported modules.
2. The Student activates “Ask for help.”
3. The dialog names the Mentor and any selected module, explains that sending is unavailable, and closes without a mutation or success claim.

Extensions:

- Known inactive modules are labelled; absent module records use the unavailable fallback; an empty module list says “No modules listed.”
- With no selected module, the dialog names only the Mentor.

### SC-04 — Recover from module-data failure

1. Mentor discovery succeeds but at least one module read fails.
2. Mentors remain visible with a notice and Retry. Selector changes are disabled; text search covers names and biographies only.
3. The Student retries; successful metadata loading restores module choices and full search fields.

Extensions:

- If a module was already selected, its filter remains applied and a separate reset action can clear it while the selector is disabled.
- A confirmed absent module record uses the per-module fallback rather than treating the whole lookup as failed.

### SC-05 — Recover from discovery failure

1. The initial discovery request fails and the page shows an error with Retry, not an empty-success state.
2. The Student retries and receives the normal browse state, including an incomplete empty page when a cursor remains.

Extension:

- If a later page fails, earlier Mentors and control state remain visible; Retry requests that page again.

## 7. Testable acceptance criteria

| ID | Given / when | Then |
| --- | --- | --- |
| AC-01 | An active Student follows the existing “Find a mentor” navigation | `/student/mentors` shows discovery; existing route protection still denies an unauthorized or wrong-role session. |
| AC-02 | The first discovery response contains Mentors and a cursor | Up to 20 public Mentor records appear in backend order, “Load more” is available, and no ranking claim appears. |
| AC-03 | The Student activates “Load more” | The next request carries the previous `nextCursor` and `limit: 20`; returned Mentors append in order without clearing prior results. |
| AC-04 | A discovery response has `nextCursor: null` | “Load more” is absent. An empty response with a non-null cursor remains an incomplete list and still offers continuation. |
| AC-05 | Text differs only in case, appears within a name/biography/resolved module code/title, or has outer whitespace | The expected loaded Mentor matches. Blank trimmed text imposes no search restriction; unknown module IDs contribute no fabricated search text. |
| AC-06 | A module is selected and text is entered | Only loaded Mentors satisfying both conditions appear, in original backend order. Clearing text retains the module filter; clearing the module retains text search. |
| AC-07 | A query/filter has no match among loaded Mentors and another cursor exists | The state says the result is limited to loaded Mentors and “Load more” remains usable. A definitive no-match state appears only when pagination is exhausted. |
| AC-08 | Loaded Mentors support active, inactive, missing, and no modules | Only resolved active supported modules appear as selector choices; details label known inactive modules, mark missing metadata unavailable, and say “No modules listed” for an empty `moduleIds` array. |
| AC-09 | Another page introduces a new active supported module | The selector gains that module without losing the Student's current valid selection. An empty catalogue does not prevent Mentor browsing. |
| AC-10 | Module metadata loading fails while Mentor discovery succeeds | Mentor records remain visible, module selection is disabled with a notice and Retry, and the page says search currently covers names and biographies only. A successful retry restores module search/filter options. |
| AC-11 | Module metadata fails after a module was selected | The current selection remains applied and identifiable; it can be cleared through a separate reset action while the selector is disabled. |
| AC-12 | The first discovery request fails | The page shows an error and Retry, not an empty-success state; Retry requests discovery again. |
| AC-13 | A later-page request fails | Previously loaded Mentors, query, and module choice remain visible; Retry requests that page again without duplicate success claims. |
| AC-14 | Discovery is exhausted with no Mentors | The page shows a distinct “No mentors available” state rather than “No matches.” |
| AC-15 | A Student opens and closes Mentor details | Public biography and supported modules appear inline, no private account fields appear, and loaded/search/filter state remains intact. |
| AC-16 | A Student activates “Ask for help” | The dialog identifies the Mentor and selected module if present, states that sending is unavailable, offers Close, makes no mutation, and shows no submission-success message. |
| AC-17 | A Student leaves discovery and later returns | Query, module selection, loaded pages, and expansion reset to the initial page state. |
| AC-18 | Discovery is viewed on laptop/mobile or operated with keyboard and assistive technology | Controls and feedback meet the existing responsive and WCAG 2.1 AA targets, including dialog focus and loading/error announcements. |
| AC-19 | The feature is run with deterministic mocks | Multiple Mentor/module and error/empty/pagination scenarios are reproducible without live Firebase or new dependencies; the existing emulator seed remains unchanged and its module-filter limitation is documented. |
| AC-20 | The Student changes search text or module selection while a continuation cursor exists | The visible result is recomputed from loaded Mentors without sending a search/filter request or implying unloaded Mentors were checked; a later loaded page is incorporated under the same controls. |
| AC-21 | The first page is pending, or a later page is pending after Mentors have loaded | Initial loading is perceivable; additional-page loading is separately perceivable while earlier Mentors remain available, and the same page is not requested repeatedly by rapid activation. |
| AC-22 | An expanded Mentor is removed from visible results by a changed search or module filter | The details collapse; clearing the control does not automatically reopen them. Other loaded results and control state remain intact. |
| AC-23 | A discovery page returns zero Mentors with a non-null cursor before any Mentor is loaded | The page shows “No mentors loaded yet. Load more to continue.” It offers “Load more” and does not claim discovery is exhausted. |
| AC-24 | One referenced module read fails while other reads succeed, or a module document is confirmed absent | A failed read triggers the degraded metadata state of AC-10 while already resolved details may remain visible; a confirmed absent record uses the per-module fallback of AC-08 without triggering the failure state. |
| AC-25 | Discovery and module data are accessed in either configured frontend adapter | Mentor collection discovery goes through `HelpiNUSServices` and `discoverMentors`, module resolution stays behind an authorized service path, no client `mentorProfiles` collection list occurs, and only approved public Mentor fields plus authorized module metadata are displayed. |

## 8. Requirement-to-acceptance index

| Requirement | Acceptance criteria |
| --- | --- |
| FR-01 — Access and public data | AC-01, AC-02, AC-15, AC-25 |
| FR-02 — Cursor pagination and list order | AC-02–AC-04, AC-13, AC-21, AC-23 |
| FR-03 — Loaded-only text search | AC-05–AC-07, AC-10, AC-20, AC-24 |
| FR-04 — Module selector and metadata | AC-06, AC-08–AC-11, AC-24 |
| FR-05 — Inline Mentor details | AC-15–AC-18, AC-22 |
| FR-06 — Help-request initiation placeholder | AC-16 |
| FR-07 — Empty, incomplete, loading, and error states | AC-04, AC-07, AC-10, AC-12–AC-14, AC-21, AC-23–AC-24 |
| FR-08 — State lifetime and deterministic demo | AC-17, AC-19, AC-22 |
| NFR-01 — Authorization and privacy | AC-01, AC-15–AC-16, AC-25 |
| NFR-02 — Accessibility | AC-18, AC-21–AC-22 |
| NFR-03 — Responsive behavior | AC-18 |
| NFR-04 — Service integrity | AC-02–AC-03, AC-10, AC-19–AC-20, AC-25 |
| NFR-05 — Verification independence | AC-19 |

## 9. Intentional TDD decisions

The TDD may decide the frontend service interface shape, authorized module-resolution request strategy, component and state boundaries, caching and duplicate-request control, UI control composition, mock fixture organization, and test structure. These choices must preserve the observable workflows, failure states, privacy and accessibility boundaries, and acceptance criteria above. In particular, the TDD cannot introduce server-side search/filter behavior, a direct client list of `mentorProfiles`, a help-request mutation, or a shared contract change without separate owner approval.

## 10. Handoff boundary

The next conversation should produce a feature TDD under `docs/features/S1-D2-F02/`, using this PRD and the existing Sprint 1 contracts. It should resolve the smallest frontend service shape for `discoverMentors` and authorized module resolution, component state boundaries, mock fixture design, and error/retry mechanics. The TDD must retain the approved loaded-only semantics and identify any proposed shared backend contract change for separate owner approval. No implementation, test execution, Requirements-to-Tests artifact, commit, or push is part of this PRD step.

## 11. Final cross-feature disposition — 2026-10-22

FR-06's help-request initiation placeholder was accurate for this Sprint 1 scope. In the final worktree, S2-D2-F01 implements Student help-request creation and tracking. Do not interpret the original placeholder requirement as the current application behavior. Discovery and loaded-only filtering remain implemented. This note preserves the approved PRD and records later delivery without asserting new verification.
