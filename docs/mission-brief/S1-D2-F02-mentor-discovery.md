# Mission Brief — S1-D2-F02 Student Mentor Discovery and Module Filtering

**Status:** Approved  
**Approver:** Repository owner  
**Approval date:** 2026-10-14  
**Approval scope:** Mission Brief scope and constraints; detailed behavior is governed by the approved PRD and TDD. Implementation authorization is not granted by this approval.

**Branch:** `royden/feat-mentor-discovery`

**Baseline:** `4613e617d366813d90bb6a1da11ba1be48f668c5` (locally cached `origin/dev-staging`; a fresh remote check was unavailable on 14 October 2026)

## 1. Feature overview and objectives

Give an authenticated Student a usable way to browse eligible Mentors, search the discovery list, narrow it by academic module, inspect a Mentor's public profile and supported modules, and begin the path toward asking that Mentor for help. The feature should replace the existing `/student/mentors` scaffold with the smallest coherent discovery experience while remaining usable against deterministic mock data without live Firebase.

This brief frames the work; it does not approve detailed interaction rules or authorize implementation. Product choices listed in section 9 belong in the next Grill-Me session and PRD.

## 2. Existing implementation and reusable infrastructure

- The Student dashboard and `AppShell` already link to `/student/mentors`; `appRoutes.tsx` protects that route through `ProtectedRoute` and currently renders the `WorkspacePage` preview.
- `ServiceProvider`/`useServices` expose typed frontend adapters. `contracts.ts` defines `HelpiNUSServices`; `mockServices.ts` supplies sample Student, Mentor, and module data and a typed callable fixture client. `firebaseServices.ts` invokes callables and validates responses against shared schemas. Its dashboard method still returns sample data.
- `src/shared/src/domain.ts` defines `MentorProfile` and `Module`; `callables.ts` defines the public `discoverMentors` input/output (`cursor?`, `limit?`, public `userId`, `displayName`, `biography`, `moduleIds`, and `nextCursor`). The backend `discoverMentorsHandler` already checks each active profile against an authoritative active Mentor account and paginates results.
- Firestore Rules allow an active user to read modules and directly get an eligible Mentor profile, but deny Mentor profile collection listing. The discovery callable is the approved list path. The existing `createHelpRequest` callable has a shared contract but currently returns `unavailable` after authorization; request creation is not implemented.
- Frontend Vitest/Testing Library tests use `ServiceProvider` overrides, a memory router, and callable fixtures. Backend integration tests cover discovery pagination and eligibility. Existing layout and navigation cover laptop and mobile patterns.

See [Sprint 1 requirements](../../workflow/specs/sprint-1/requirements.md), [architecture decisions](../../workflow/specs/sprint-1/architecture.md), [shared contracts](../../workflow/specs/sprint-1/contracts.md), [Developer Guide](../DeveloperGuide.md), and [frontend handoff](../../workflow/handoffs/frontend-foundation.md) for established project decisions. There is no prior Mission Brief under `docs/mission-brief/`; the repository's `workflow/agents/README.md` and handoffs provide the current documentation convention.

## 3. In-scope requirements

- Present a Student-facing Mentor discovery list sourced through the approved service boundary, with only eligible public Mentor data exposed by `discoverMentors`.
- Let the Student search Mentors and select an academic module to narrow the visible list. Exact search fields, matching rules, filter semantics, and pagination behavior await product decisions.
- Let the Student inspect a Mentor's public details and supported modules, resolving module IDs to readable module information where available. Do not expose sign-in email, account status, or other private user fields.
- Provide an honest help-request initiation placeholder from the relevant Mentor context. It must make clear that submitting a request is not yet available and must not create a request or imply one was created.
- Handle initial loading, further-page loading if used, no Mentors, no matches, unavailable module information, and recoverable data errors with clear Student-facing states.
- Keep discovery usable with mock-backed adapters/fixtures and test its meaningful behavior without a live Firebase project. Preserve the existing role guard, responsive layout, and WCAG 2.1 AA target.

## 4. Out-of-scope functionality

- Creating, sending, tracking, accepting, or closing help requests; conversations; availability; booking; AI assistance; Mentor onboarding or profile editing.
- New recommendation or ranking logic, matching scores, notifications, or administrative module management.
- Production Firebase changes, Firebase MCP configuration, new backend search/filter contracts, or unrelated infrastructure refactoring. Any newly required backend capability must be identified and approved before implementation.

## 5. Architectural boundaries and constraints

- Preserve Developer 1's Sprint 1 foundation and make additive, minimally invasive changes. React pages use frontend services, not direct Firebase SDK calls. Shared domain and callable schemas remain the source of contract truth.
- Use `discoverMentors` for collection discovery; do not query `mentorProfiles` as a client-side collection. Respect cursor pagination and the callable's public-field boundary.
- Resolve academic module data through an authorized service path consistent with existing Firestore Rules and shared `Module` schema. The exact service shape and source of the selectable catalogue remain to be settled; do not manufacture module titles from IDs.
- Keep the help-request action a placeholder until the existing callable is implemented in a later feature. Do not route users into a fake successful request flow.
- Maintain Student-only route access, accessible controls and feedback, and laptop/mobile support. Avoid duplicate auth, routing, schema, or service frameworks.

## 6. Dependencies and integration contracts

| Dependency | Current contract/state | Implication for this feature |
| --- | --- | --- |
| Student session and route | `ProtectedRoute` and `ServiceProvider` already gate `/student/mentors` | Reuse the established Student shell and session handling. |
| Mentor list | `discoverMentors({ cursor?, limit? })` returns public records plus `nextCursor` | Available backend foundation; search/module filtering are **not** callable inputs. The PRD must define behavior across pages before implementation. |
| Academic modules | `modules/{moduleId}` uses the shared `Module` schema; active users may read modules | No dedicated frontend catalogue service exists yet. Catalogue availability, active-module handling, and ID-to-label resolution are integration questions. |
| Mentor details | Public discovery payload contains name, biography, and module IDs; direct get of eligible active profile is allowed | Design details within approved public fields. Any additional profile field needs a separate approved contract. |
| Help request | Shared `createHelpRequest` input/output exists; deployed handler returns `unavailable` | Only a clearly labelled initiation placeholder can be delivered now. |
| Offline development | `mockServices`, `createMockCallableClient`, service overrides, Vitest/Testing Library | Add representative mock scenarios and tests during implementation; no live Firebase dependency for feature verification. |

The emulator seed currently creates a demo Mentor with an empty `moduleIds` array and does not seed a module catalogue. A populated module-filter demonstration therefore needs fixture data or a separately approved emulator-data change. Remote `dev-staging` freshness could not be verified because GitHub access failed; compare the branch with the remote before later integration.

## 7. Expected deliverables

- A Student Mentor discovery experience at the existing route, including search, academic module selection/filtering, public Mentor details, supported-module display, and help-request initiation placeholder.
- Minimal extensions to the existing frontend service and mock adapters needed to supply discovery and module data through approved contracts.
- Clear loading, empty, no-match, unavailable-data, and error/retry behavior.
- Focused frontend tests for core interactions, service behavior, role protection, and representative failure/empty states, runnable without live Firebase; update documentation only where the final feature requires it.

## 8. High-level acceptance and completion criteria

- An authorized Student can reach discovery from existing navigation and view eligible Mentors, inspect their public details, and understand supported modules when module metadata is available.
- Search and module selection narrow results according to the rules approved in the PRD, including a clear no-match state. The experience does not silently misrepresent an incomplete page as the complete result set.
- Loading and errors are understandable and recoverable; empty catalogue and missing module metadata have deliberate display behavior.
- The help-request placeholder accurately communicates current capability and performs no backend mutation.
- The feature works with deterministic mocks, passes relevant frontend checks and meaningful tests, and meets the existing accessibility and responsive targets. Backend and shared contracts remain intact unless a later approved design identifies a necessary change.

## 9. Unresolved decisions for the subsequent Grill-Me session

1. What should search match (name, biography, module code/title), and how should case, partial matches, clearing, and combined search/filter behave?
2. Should filtering/searching cover every eligible Mentor or only loaded pages? If all, what pagination or backend capability is acceptable given that `discoverMentors` accepts neither search nor module filters?
3. Which modules appear in the selector: all catalogue modules, only active modules, or only modules supported by discovered Mentors? How should inactive, missing, or unknown module IDs appear?
4. Where should Mentor details open (inline expansion, panel, or route), and which approved public fields are sufficient?
5. What precisely should the help-request initiation placeholder do and say until `createHelpRequest` is implemented? Should it preserve Mentor/module context for a later flow?
6. What should users see when no Mentors exist, a query has no matches, module data fails while Mentors load, or a later discovery page fails?
7. What is the intended ordering and page-size behavior for the list, and should the search/filter state persist through navigation?
8. Which fixture and emulator-data expectations must be met for demo and review, given the current single mock Mentor and empty-module emulator seed?
