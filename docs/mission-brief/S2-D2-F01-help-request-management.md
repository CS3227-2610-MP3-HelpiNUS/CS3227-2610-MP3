# Mission Brief — S2-D2-F01 Help Request Management

**Status:** Approved  
**Draft date:** 2026-10-16  
**Owner:** Developer 2  
**Approval date:** 2026-10-16  
**Approval reference:** Developer 2's reply in this Mission Brief conversation, “approved mission brief.”  
**Approval scope:** Mission Brief scope and boundaries only. Open product decisions remain for the separate Grilling/Decision stage; this approval does not authorize a PRD, technical design, implementation, or publication.

**Evidence baseline:** Developer 2's approved workflow in the current task and `CS3227-2610-MP3-mentor-dashboard/workflow/specs/sprint-2/{S2-D2-F01-help-request-management-spec,S2-D2-F02-conversation-management-spec}.md` govern this brief. The two Sprint 2 files are currently untracked in that worktree; their content was supplied by Developer 2, and no Git publication is implied. Local code was inspected at `CS3227-2610-MP3` `master` (`4613e61`) and the newer `royden/feat-mentor-dashboard` worktree (`770586a`), which contains Mentor discovery, profile management, and dashboard work. The latter worktree has unrelated local changes, so its checkout is evidence of current behavior rather than an approved F01 parent. Sprint 1 contracts and architecture remain infrastructure evidence, but do not override the approved F01 workflow.

## 1. Mission and objective

Let a Student ask one chosen Mentor for help with one academic module and track the outcome. Let that Mentor review requests addressed to them and accept or reject a pending request. An acceptance establishes the approved Student–Mentor help relationship and must ultimately have exactly one conversation associated with that particular request. F01 delivers the request lifecycle and a clear handoff to S2-D2-F02; F02 owns conversation persistence, messaging, and its interface. Acceptance is not an appointment; availability and booking remain separate downstream workflows.

## 2. Actors and journeys

| Actor | Intended journey |
| --- | --- |
| Student | Discover Mentors in the existing Student interface, filter by academic module, choose a specific Mentor, enter a module supported by that Mentor plus question title and detailed description, submit, then see their own request history, detail, and current status. After acceptance, the associated conversation becomes the communication path supplied by F02. A rejected request remains terminal; a new request to a different Mentor is a separate submission subject to the approved duplicate policy. |
| Mentor | See pending requests addressed specifically to their account, open a request's details (module, title, description, and relevant Student/request metadata), then explicitly accept or reject it. The persisted decision is visible to the involved Student and Mentor. |

Both journeys must remain usable on laptop and mobile and meet the project's WCAG 2.1 AA target. Loading, empty, invalid, denied, and recoverable failure states need truthful user-facing feedback; a failed or uncertain submission must not be shown as a confirmed request.

## 3. Approved product decisions and lifecycle invariants

- A request is submitted by one authenticated Student for exactly one specifically selected Mentor and one academic module supported by that Mentor, with a nonblank question title and detailed description. It starts as `PENDING`. Request identity, Student identity, and creation/update timestamps are server-controlled.
- The F01 lifecycle is `PENDING → ACCEPTED | REJECTED`. Only the addressed Mentor may make either transition, and only while the request is pending. A rejected request remains rejected; it is not silently reactivated.
- The Student and Mentor identities are fixed after submission. F01 has no public request board, Mentor claim action, or reassignment to another Mentor.
- Acceptance establishes the approved Student–Mentor help relationship. A successfully accepted request must have exactly one associated conversation in the completed F01/F02 integration. No conversation is accessible while the request is pending; rejection creates none and grants no chat access. Each conversation belongs to one accepted request, not to a generic Student–Mentor pair.
- The completed acceptance operation must avoid an accepted request without its required conversation, be atomic or equivalently consistent, and be idempotent under retries/concurrency. During independent F01 development, an explicitly documented mock or adapter may stand in for F02; it cannot be treated as proof that production conversation creation works.
- Request closure, withdrawal/cancellation, and further statuses are not part of the approved F01 lifecycle. The Sprint 2 F01 and F02 specifications explicitly defer closure; any expansion requires a separately approved lifecycle change.

## 4. Functional scope

**Student-facing:** connect the selected Mentor and supported module from existing discovery to a real request form; validate required input and show actionable errors; submit through `createHelpRequest`; show the Student's own request history, details, and current statuses using persisted records or authorized subscriptions. A confirmed success reflects persisted state, and a retry must not create an unintended duplicate. An accepted request may link to its conversation once F02 is integrated.

**Mentor-facing:** show requests addressed to the current Mentor, including an assigned pending list and request details; allow explicit acceptance and rejection of a pending request through `respondToHelpRequest`; show the persisted result and synchronize status for both participants. Empty, stale, already-resolved, and failure states must be understandable.

**Trusted data boundary:** persist and retrieve requests in Firestore through a request repository/service; derive actor identity and role from authenticated authoritative account data; verify that the chosen Mentor and module are eligible and compatible; authorize creation and transitions; prevent duplicate requests according to an approved policy; enforce Firestore Security Rules and safe query access. Shared callable contracts, frontend service adapters, deterministic mocks, and unit, integration, authorization, Rules, and emulator-backed evidence are part of the eventual vertical slice.

## 5. Non-goals

F01 does not implement message storage, real-time chat, conversation lists or chat UI, Mentor availability, appointment booking or consultation scheduling, AI matching, a public request marketplace, notifications absent another approved requirement, or unrelated authentication/dashboard redesign. F01 must not present mock Student dashboard requests or conversations as live data.

## 6. Existing components and integration boundaries

| Boundary | Reuse and observed gap |
| --- | --- |
| Identity and access | `ProtectedRoute`, `ServiceProvider`, and `src/functions/src/auth.ts` already use the authenticated session and authoritative `users/{uid}` role/status; production verification is required, with a documented synthetic emulator exception. F01 must reuse these checks. A frontend guard alone cannot authorize a Firestore mutation because Admin SDK code bypasses Rules. |
| Mentor discovery and module selection | `/student/mentors` has paginated eligible Mentor discovery, a loaded-list module filter, public Mentor details, and an “Ask for help” dialog. The dialog currently says requests cannot be sent and captures only Mentor identity plus a displayed filter label; it has no submit flow or durable module context. F01 must connect a selected Mentor and an eligible module to actual submission without treating the placeholder as a working request action. |
| Mentor profile and modules | `mentorProfiles/{uid}` supplies supported `moduleIds`; `modules/{id}` supplies module metadata and `active`. F04's Mentor profile work and catalogue path are useful compatibility context. Exact treatment of inactive/missing legacy references at F01 submission remains undecided. Backend validation must not trust only a previously loaded discovery result. |
| Student and Mentor workspaces | `/student/requests` is still a `WorkspacePage` scaffold. The Mentor shell has dashboard/profile links but no request route or list. `StudentDashboard` uses `mockDashboard` even in Firebase mode, so its request counts/list are preview data, not a request repository. F01 must supply real participant data for its own surfaces. |
| Shared request contracts | `src/shared/src/domain.ts` has `HelpRequest` and `HelpRequestStatus`; `callables.ts` has `createHelpRequest`, `respondToHelpRequest`, and `closeHelpRequest` schemas with UUID `requestId`. The create input currently permits `mentorId: null`; the domain status includes `CLOSED`. These Sprint 1 scaffolds conflict with F01's mandatory selected Mentor and current terminal states. The F01 specification describes a supported **module code**, while the current schema stores a **moduleId**; the mapping and canonical persisted representation need an explicit later contract decision. Required shared-contract changes need Developer 1 coordination. The current title/description bounds of 120/2000 characters are implementation evidence, not an approved F01 content policy. |
| Backend and Rules | `createHelpRequest` and `respondToHelpRequest` currently return `unavailable` after role checks. Rules allow an active participant to read their request and deny client writes. There is no F01 repository/service or accepted transition. Rules tests exercise participant reads and denied writes, but no full F01 behavior. `firestore.indexes.json` has no request history/assignment index; query shapes and needed indexes belong to technical design. |
| Conversation handoff | The shared `Conversation` has two participants and nullable `helpRequestId`, and Rules restrict conversation reads to participants. No conversation creation operation is implemented. F02 requires a nonoptional immutable parent request relationship and server-controlled membership in its final model; current nullability and participant-only access are therefore compatibility gaps. F01 should define the acceptance outcome contract and an explicit F02 adapter seam; F02 supplies trusted provisioning, persistence, and messaging. The final integrated acceptance path must prove exactly one link, no chat access before acceptance, and no accepted-without-conversation state. The precise failure/retry contract remains a decision for the next stage. |
| Test and delivery conventions | Frontend uses Vitest/Testing Library and service/mocks; Functions use Vitest unit and callable emulator integration tests; Rules have emulator tests. Sprint 1 expects typed shared schemas, callable-owned transitions, UUID idempotency inputs, synthetic emulator data, accessibility checks, and independent/human review before merge. `workflow/agents/README.md` puts draft SDD in `Dev2-local-SDD`, with approved snapshots imported into a later feature worktree only after approval. Shared/Developer 1-owned edits require exact-file coordination. |

## 7. Initial acceptance criteria

1. An eligible Student can start from a specific discovered Mentor, select a module supported by that Mentor, enter a valid title and description, submit once through `createHelpRequest`, and later retrieve that persisted request as `PENDING` with the same server-derived Student, selected Mentor, module, question details, and server-controlled timestamps.
2. Invalid or incompatible input, unavailable Mentor/module data, and unauthorized creation are rejected without a partial request; the Student sees actionable feedback and no false success. Duplicate attempts follow the subsequently approved policy, with idempotent retry of the same intended operation.
3. The Student can view only their own history and details, including `PENDING`, `ACCEPTED`, and `REJECTED` statuses. Another Student cannot read or mutate those requests.
4. The addressed eligible Mentor can see their assigned pending requests, review details, and accept or reject one pending request through `respondToHelpRequest`. Other Mentors and Students cannot access or decide it. Concurrent or repeated responses cannot produce divergent outcomes.
5. Acceptance produces an approved relationship and, in the completed F01/F02 integration, exactly one associated conversation for that request with the correct two participants and immutable request link. Pending/rejected requests have no usable conversation. A retry/failure cannot leave a confirmed accepted request without the required conversation.
6. Request ownership and identities remain unchanged after submission; no public board, claim, reassignment, silent rejected-request reactivation, or F01 closure appears.
7. Firestore Rules continue to deny client request writes and protect participant reads/lists. Backend and emulator tests exercise role, ownership, inactive/unverified identity, compatibility, duplicate, transition, concurrency, and consistency cases. Frontend tests cover form, history/detail, Mentor review, errors, and status presentation. Mock-only evidence is labelled as such.
8. The request surfaces are accessible and usable in laptop/mobile layouts, with recorded manual observations at the later verification stage. Existing Mentor discovery/profile and authentication behavior remain intact.

## 8. Risks and constraints

- Current shared schemas permit null Mentor IDs and `CLOSED`, while the approved F01 specification requires one selected Mentor and ends at `ACCEPTED` or `REJECTED`. The Sprint 1 `closeHelpRequest` scaffold and Developer Guide state diagram also describe closure. The Sprint 2 specs explicitly defer it. Resolve the contract/documentation relationship before implementation; do not silently enable closure or change the approved F01 lifecycle.
- The F01 specification names a supported module **code**, while the current schema and Mentor profile use module **IDs**. A later contract must establish how the selected module is validated and represented without weakening compatibility checks.
- F02 discovery filters only currently loaded Mentors and may show inactive or missing module references in details. A stale selection, Mentor eligibility change, or catalogue change between discovery and submit requires trusted validation and a clear error. The current placeholder does not retain a module ID for submission.
- F01/F02 may be developed separately, but the final release cannot rely on a mock conversation adapter. A transaction or equivalently safe protocol, deterministic linking, and retry behavior must be agreed across the workstreams.
- Rules and backend authorization must agree for participant reads and list queries. Query/index design, Admin SDK authorization, concurrent Mentor actions, and idempotency are material security and integrity risks.
- Existing Student dashboard request/conversation summaries are sample data; integrating them without replacement would misrepresent status. Current Mentor dashboard has no request activity source.
- The Sprint 2 F01/F02 specifications are new untracked files in the Mentor dashboard worktree. Their approved workflow is reflected here, but their repository publication and the exact implementation parent remain to be established in the later handoff.

## 9. Open decisions for Developer 2 approval in the next stage

These are unresolved; the existing implementation is not being promoted into product policy.

1. **Duplicate active requests:** What exactly counts as a duplicate (same Student–Mentor–module, same question, time window, or another key), which statuses count as active, and what should the Student see when an attempt is blocked?
2. **Question validation:** What title/description length limits and content rules should apply? The current shared schema's 120/2000-character bounds are a candidate constraint requiring confirmation, not an approved decision.
3. **Withdrawal:** Should a Student be able to cancel or withdraw a `PENDING` request? If yes, the approved lifecycle needs an explicit amendment before design.
4. **History/audit:** Is the latest status and timestamps enough, or is a visible or retained decision history/audit record required? What detail, if any, should a rejection expose beyond its status?
5. **Acceptance recovery:** What should users see during uncertain acceptance and retry, and when may acceptance be shown as confirmed? The invariant of exactly one conversation and no accepted-without-conversation result is already approved; the precise failure/retry behavior and F02 handoff need agreement.
6. **Eligibility edge cases:** Must a module be active at submission as well as listed on the chosen Mentor's profile? How should inactive/missing legacy module references, or a Mentor who becomes inactive after discovery, be presented and handled? The requirement that the module be supported by the addressed Mentor is already approved.
7. **Module representation:** The Sprint 2 F01 specification says “module code” while current shared records use `moduleId`. Which canonical identifier should be stored and displayed, and what compatibility mapping is required? This does not reopen the requirement to select a real supported module.

## 10. Deliverables and verification expectations

After this Mission Brief is reviewed and approved, a separate Grilling/Decision stage may resolve section 9, followed by separately approved PRD, technical design, and requirements-to-tests artifacts. Later implementation is expected to include the Student and Mentor request surfaces, typed service/callable boundary, trusted Firestore repository and authorized transitions, Rules/index changes as needed, deterministic mocks, F02 integration adapter/contract, and the focused and emulator-backed evidence in section 7. The final integrated verification must use real conversation persistence rather than a mock. This draft creates none of those artifacts and performs no implementation.
