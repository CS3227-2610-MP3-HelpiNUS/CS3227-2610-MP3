# Product Requirements Document — S2-D2-F01 Help Request Management

**Status:** Approved  
**Draft date:** 2026-10-16  
**Feature owner / workstream:** Developer 2 / Sprint 2 F01  
**Approval date:** 2026-10-16  
**Approval reference:** Developer 2's “approved” reply in this PRD conversation, approving the revised Draft containing NFR-07 and AC-45 (pre-approval-metadata SHA-256 `BE43F5115BD0E718029BDA32F816EDDA1399952A090C5F62FB329EF93632A662`).  
**Sources:** [Approved F01 Mission Brief](../../mission-brief/S2-D2-F01-help-request-management.md), [approved Grilling Decisions](GrillingDecisions.md), and the Sprint 2 F01 specification  
**Approval scope:** Product requirements in this PRD only. It does not approve technical design, Requirements-to-Tests, implementation, shared-file edits, publication, or release.

## Document authority and boundary

The approved Mission Brief governs feature scope and lifecycle. Approved GD-01–GD-18 govern the resolved product and security policies, including the later GD-07 clarification that preserves Mentor-only decisions. The Sprint 2 F01 specification supplies original requirements not superseded by those approvals. Existing code and Sprint 1 contracts are evidence of capabilities and compatibility gaps, not authority to replace an approved requirement. The Sprint 2 F02 specification supplies integration context, not permission to design or implement F02 here.

This PRD specifies observable outcomes. The later TDD must settle collection/index design, callable wire shapes, transaction or equivalent consistency mechanism, retry algorithm, listener mechanics, service decomposition, and file allocation. References to Firestore and the named F01 callables identify existing product boundaries rather than prescribing those internals.

## 1. Purpose, actors, and scope

An authenticated Student asks one selected Mentor for help with one academic module and follows the request's outcome. The addressed Mentor reviews and decides a pending request. An accepted request establishes the Student–Mentor help relationship and, in the completed F01/F02 product, exactly one conversation for that request. Acceptance is not an appointment.

| Actor | Journey and outcome |
| --- | --- |
| Student | Start from existing Mentor discovery/profile, select a supported module, submit a question, receive truthful confirmation, and inspect live own history/detail/status. After acceptance, enter the associated F02 conversation when available. |
| Mentor | Open an assigned pending queue, inspect question and Student display name, explicitly accept or reject, and later inspect decided requests. |
| Trusted product boundary | Validate identity, eligibility, content, duplicates, and transitions; persist authoritative outcomes; restrict participant access and direct client writes. |

**In scope:** Student form, history, detail and dashboard request summary; Mentor pending and decided views; authoritative request lifecycle, security and persistence; live request updates; and the F01 acceptance contract with F02. The feature must remain usable on laptop and mobile and target WCAG 2.1 AA.

**Out of scope:** Student withdrawal/cancellation, closure, reassignment, public/unassigned board, Mentor claim, automatic rejection, extra request statuses, rejection reasons or a separate decision audit UI, message storage/chat UI, notifications, AI matching, availability, booking, appointments, and unrelated authentication, profile or dashboard redesign. Existing `CLOSED`/`closeHelpRequest` symbols are dormant compatibility scaffolding; they do not authorize an F01 operation. Unrelated dashboard preview widgets are outside F01.

## 2. User workflows

**WF-01 — Submit.** The Student enters from a chosen Mentor, selects one eligible module, sees the addressed Mentor, enters title and description, and submits. Client feedback helps correct invalid fields, while the trusted backend makes the authoritative decision. Confirmed success shows the one persisted `PENDING` request. A blocked duplicate links to the existing pending request and keeps the attempted draft. A timeout or other uncertain result remains unconfirmed while the same attempt is reconciled.

**WF-02 — Follow.** The Student opens own history and detail. The newest request appears first; an open view updates from authorized persisted changes. The dashboard's request summary agrees with persisted own records. A rejected request remains visible; an accepted request leads to its F02 conversation once integrated.

**WF-03 — Decide.** The Mentor opens the assigned pending queue, oldest first, reads the request and Student display name, then explicitly accepts or rejects. A confirmed decision moves to decided history and updates both participants' open views. A repeated same decision returns the stored result; an opposite decision reports the actual terminal status. If acceptance is uncertain, the UI checks the authoritative integrated outcome before claiming success.

**WF-04 — Recover or lose access.** Loading, no records, validation errors, stale decisions, transient failures, subscription failures, and access denial are distinct. A recoverable failure offers a retry or route back to the relevant record. On detected identity/eligibility loss, private request state is cleared and late results from the prior account are ignored. An unobserved remote account change need not be detected instantly on an idle page; every protected operation remains independently authorized.

## 3. Functional requirements

### FR-01 — Student entry and selection

**Actor/precondition:** Authenticated eligible Student using existing Mentor discovery/profile. **Requirement:** The interface MUST carry the specifically chosen Mentor into Request Help, keep that Mentor visible, and let the Student choose exactly one module supported by that Mentor. A filter label alone MUST NOT count as a durable module selection. The Student MUST NOT address a public board or submit with a missing Mentor. If the selection is unavailable or changes before submission, the form MUST explain the incompatibility and permit correction; it MUST NOT silently choose a different Mentor/module. **Acceptance:** AC-01–AC-03. **Source:** MB §§1–4, 6–7; GD-02–GD-03; F01 §§3–5.

### FR-02 — Question content and validation

**Actor/precondition:** Student preparing a request. **Requirement:** Title and description MUST each be nonblank after trimming outer whitespace; normalized title MUST be at most 120 characters and normalized description at most 2,000 characters. Valid internal plain-text content, including newlines, MUST be preserved and rendered as text without executable markup. Client validation MUST identify the affected field before submission where possible; authoritative backend validation MUST reject bypassed, missing, whitespace-only, malformed, or over-limit inputs without a partial request. **Acceptance:** AC-02–AC-04. **Source:** MB §§3–4, 7; GD-04; F01 §§4–6.

### FR-03 — Authoritative creation and confirmation

**Actor/precondition:** Active, authenticated, authorized Student with valid input. **Requirement:** `createHelpRequest` MUST derive Student identity from the authenticated account, validate the current role/status and applicable verification policy, and validate at submission time that the selected Mentor account and profile are active and the selected existing catalogue module is active and listed in that profile's supported module IDs. Stale discovery results and inactive/missing legacy module references MUST NOT authorize a new request. One successful submission MUST persist exactly one request with a unique request identity, immutable Student/Mentor membership, canonical `moduleId`, normalized question content, `PENDING` status, and server-controlled creation/update times. The UI MUST show confirmed success only for the authorized persisted result. Rejected creation MUST leave no partial request. **Acceptance:** AC-01–AC-06. **Source:** MB §§3–4, 6–7; GD-02–GD-04, GD-17; F01 §§4–6.

### FR-04 — Duplicate pending requests

**Actor/precondition:** Student submitting to a Mentor/module tuple. **Requirement:** At most one `PENDING` request MUST exist for a Student–Mentor–module tuple, including under concurrent distinct attempts. An `ACCEPTED` or `REJECTED` request MUST NOT permanently block a new request for that tuple. This policy is independent of operation idempotency. If a distinct attempt is blocked, the UI MUST say no new request was created, link to the existing pending request, and retain the attempted title/description. It MUST NOT imply that different attempted text was delivered. **Acceptance:** AC-07–AC-08. **Source:** MB §§4, 7, 9; GD-01, GD-08; F01 §§5–6.

### FR-05 — Submission retry and uncertain outcome

**Actor/precondition:** Student's submission response is lost, delayed, or uncertain. **Requirement:** The interface MUST keep the attempted payload and its UUID operation ID, show an unconfirmed/checking state, inspect the authorized persisted outcome, and use the same ID for retry of that unchanged attempt when needed. An authorized repeat of the same intended operation MUST NOT create another request or falsely report a new success. Reuse of an ID with changed input MUST NOT return an unrelated stored success. Current caller authorization MUST be checked before a stored result is replayed; revoked access MUST NOT reveal that result. A newly intended submission uses a new operation ID. **Acceptance:** AC-09–AC-11. **Source:** MB §§2–4, 7; GD-01, GD-17.

### FR-06 — Student history, detail, and dashboard

**Actor/precondition:** Authorized Student viewing own requests. **Requirement:** The Student MUST see own persisted request history in creation-time descending order, with a deterministic order for equal timestamps, and MUST be able to inspect selected Mentor, module, title, description, creation time, current status, and terminal decision time represented by the server-controlled update time. List loading MUST distinguish a complete empty result from partial/unloaded data. User-facing module display MUST use the verified catalogue code when available; if historical metadata cannot resolve the canonical ID, it MUST say “Module information unavailable” without inventing a code, while retaining the ID internally. The dashboard request count/list MUST use current Student-authorized persisted requests and agree with history, not `mockDashboard` request samples. **Acceptance:** AC-12–AC-16. **Source:** MB §§2, 4–6; GD-03, GD-05, GD-12, GD-15, GD-18.

### FR-07 — Mentor pending review and decided history

**Actor/precondition:** Active, authorized addressed Mentor. **Requirement:** The Mentor MUST see only requests addressed to their account, with a pending queue ordered by creation time ascending and deterministic order for equal timestamps. The Mentor MUST be able to open details showing module, title, description, status, relevant request times, and the Student's authorized display name. The Mentor view MUST NOT expose the Student's email or UID. A separate decided view/detail MUST retain own `ACCEPTED` and `REJECTED` records after they leave the queue. Partial loading MUST NOT imply unseen requests are absent. **Acceptance:** AC-17–AC-20. **Source:** MB §§2–4, 7; GD-05, GD-10, GD-12–GD-13.

### FR-08 — Mentor decision and lifecycle

**Actor/precondition:** Addressed active authorized Mentor; request currently `PENDING`. **Requirement:** Only that Mentor may explicitly decide `ACCEPTED` or `REJECTED` through `respondToHelpRequest`. The decision MUST be an indivisible terminal transition with server-controlled update time; first terminal decision wins under concurrent calls. A same-outcome repeat MUST return the stored outcome without altering timestamps or creating another conversation. An opposite-outcome repeat MUST report a conflict with the actual persisted terminal status, without mutation. A rejected request MUST remain rejected and have no conversation. A direct `closeHelpRequest` call MUST NOT change an F01 request. **Acceptance:** AC-21–AC-25. **Source:** MB §§3–4, 7; GD-05, GD-09, GD-11; F01 §§3–7.

### FR-09 — Eligibility changes after valid submission

**Actor/precondition:** A valid request was created before Mentor profile or module eligibility changed. **Requirement:** Later module catalogue or Mentor profile changes MUST NOT retroactively invalidate the request or automatically reject it. An active, currently authorized addressed Mentor MAY decide that pending request despite those changes. If the Mentor account loses decision eligibility, unauthorized action MUST be denied and the request may remain pending; F01 MUST NOT invent a system decision, reassignment, or status to clear it. **Acceptance:** AC-26–AC-27. **Source:** MB §3; GD-07 (later Mentor-only clarification).

### FR-10 — Live request state and session safety

**Actor/precondition:** Student or Mentor has an authorized F01 list/detail open. **Requirement:** Open request lists and details MUST subscribe to authorized persisted request changes and reflect status/list membership without manual refresh or navigation. Subscriptions MUST end on route/session change; data and late responses from a previous identity MUST NOT remain visible to a new identity. Detected eligibility loss or authorization denial MUST clear private state and give access guidance. Subscription failure MUST have visible recovery and MUST NOT be presented as a genuine empty list or current successful status. **Acceptance:** AC-28–AC-31. **Source:** MB §§2, 4, 7; GD-14.

### FR-11 — Acceptance uncertainty and F02 conversation outcome

**Actor/precondition:** Mentor accepts a pending request. **Requirement:** In the completed integrated product, confirmed acceptance MUST durably yield one `ACCEPTED` request and exactly one associated conversation for that specific request, with immutable membership equal to its Student and addressed Mentor. No durable `ACCEPTED` request may be left without its required conversation, and an accepted request MUST NOT be confirmed while that conversation is absent. Pending and rejected requests MUST grant no usable conversation or message access. Retried/concurrent acceptance MUST NOT create duplicate conversations. When the result is uncertain, the Mentor UI MUST preserve the same intended decision for reconciliation and retry, show unresolved/checking feedback, inspect authorized authoritative request and conversation state, and permit retry of that same intended operation where needed; it MUST NOT claim success until the integrated outcome is confirmed. The Student may enter the associated conversation from accepted request detail, and the Mentor may reach it from accepted context, once F02 supplies those surfaces. **Acceptance:** AC-22, AC-24, AC-32–AC-36. **Source:** MB §§1–3, 7; GD-06, GD-09, GD-16; F01 §7; F02 §§2–4.

### FR-12 — Participant security and write restrictions

**Actor/precondition:** Any direct read, list, subscription, callable, or attempted write. **Requirement:** Creation MUST require an authenticated authorized Student; decisions MUST require the active authorized addressed Mentor. Trusted operations MUST use authoritative account identity, role/status and verification policy, with only the existing documented synthetic emulator/test exception. Request IDs, ownership, Student/Mentor identities, canonical module reference and status MUST not be changed by a client after creation. Only the Student and addressed Mentor with current read eligibility MAY read/list/subscribe to their request; unauthorized access MUST reveal no record or cross-account details. Firestore Rules MUST deny direct client request writes and enforce equivalent authorization for direct document reads and list/subscription queries. Backend authorization MUST stand independently of UI guards and Rules. A replay MUST reauthorize before returning stored private data. **Acceptance:** AC-05–AC-06, AC-10–AC-11, AC-29–AC-31, AC-37–AC-40. **Source:** MB §§3–4, 6–7; GD-02, GD-10, GD-14, GD-17; F01 §§4–6.

## 4. Lifecycle and business rules

```text
creation -> PENDING
PENDING -- addressed Mentor accepts --> ACCEPTED
PENDING -- addressed Mentor rejects --> REJECTED
```

`ACCEPTED` and `REJECTED` are terminal in F01. Ownership, addressed Mentor, and module reference are immutable. There is no withdrawal, close, claim, reassignment, automatic rejection, or other status. A later independent request is a new request and is subject to the pending-tuple rule. The server controls request identity and timestamps; the terminal update time is the decision time, without a separate required rejection reason or status-history record. The dormant Sprint 1 closure symbols do not change this lifecycle.

## 5. Security, UX, and quality requirements

| ID | Requirement | Acceptance |
| --- | --- | --- |
| NFR-01 — Privacy and authorization | All read/list/subscription and mutation paths MUST enforce FR-12, including replays, direct Firestore attempts, and conversation access. Request content and Student identity MUST not leak across accounts or routine error feedback. | AC-29–AC-31, AC-37–AC-41 |
| NFR-02 — Integrity and reliability | Persisted outcomes MUST satisfy FR-03–FR-05, FR-08–FR-11 under retries, races, lost responses and partial failures. The UI MUST distinguish confirmed success from unknown completion. | AC-06–AC-11, AC-23–AC-24, AC-32–AC-36 |
| NFR-03 — Accessibility | Student and Mentor flows MUST target WCAG 2.1 AA, with semantic form fields and lists, keyboard-operable actions, visible focus, perceivable loading/errors/success, and understandable status updates. | AC-42 |
| NFR-04 — Responsive use | Forms, history, inbox, detail, error feedback, and conversation entry MUST remain usable on laptop and mobile widths without losing required information. | AC-42 |
| NFR-05 — Verification independence | Deterministic mock UI evidence MUST be distinguishable from emulator-backed persistence/Rules evidence. Production acceptance of the acceptance flow MUST include real F02 integration evidence. | AC-36, AC-43 |
| NFR-06 — Delivery evidence | A later implementation handoff MUST document the verified Student/Mentor workflow, callable and F01/F02 contract behavior, actual test results and limitations, and requirement-to-test coverage using project guide, log and handoff conventions. It MUST distinguish planned, mock and executed emulator/integration evidence. | AC-44 |
| NFR-07 — Visual consistency and interface quality | New Student and Mentor help-request interfaces MUST follow the established HelpiNUS design system, using the existing Student Dashboard, Mentor Dashboard, Mentor Profile and AppShell as visual references. They MUST reuse existing components, theme tokens, typography, spacing, buttons, inputs, cards, navigation, status badges and responsive conventions where appropriate. They MUST have clear visual hierarchy, deliberate layout and spacing, readable information grouping, and polished loading, empty, error and success states. Functional correctness alone is insufficient for UI acceptance. Generic unstyled pages, oversized empty cards, inconsistent colors, and text-only actions without clear affordances MUST NOT be introduced. | AC-45 |

All forms and views MUST distinguish loading, confirmed empty, invalid input, unauthorized access, recoverable service failure, stale status, and unresolved completion. Retry must preserve the relevant draft or operation identity. Error messages must not disclose another participant's request. No exact copy beyond the approved missing-module label is mandated here.

## 6. F01/F02 responsibility and release contract

| Boundary | Required outcome |
| --- | --- |
| F01 | Owns request creation, eligibility/duplicate checks, immutable request relationship, Mentor-only terminal decision, status persistence, Student/Mentor request views, and truthful acceptance confirmation. |
| F02 | Owns trusted conversation provisioning/persistence, immutable membership and parent link, conversation/message access enforcement, lists, messages and chat UI. |
| Shared | One conversation belongs to one accepted request, with participants from immutable request IDs. Pending/rejected requests grant no conversation access. The final integrated operation cannot confirm acceptance without its conversation; repeats/races cannot add another. |
| Release gate | A labelled mock/adapter may support independent F01 development. Production acceptance remains blocked until actual F02 persistence, immutable linkage, access enforcement, and end-to-end exactly-one evidence pass. Mock-only evidence is incomplete for this gate. |

Developer 1 shared-contract coordination is needed before later edits to `src/shared/src/domain.ts`, `src/shared/src/callables.ts`, `firestore.rules`, or other Developer 1-owned boundaries. The required outcomes include a selected non-null Mentor and canonical `moduleId`, three active F01 lifecycle states with dormant closure scaffolding, participant-only request access, and an immutable required F02 parent link and correct participant access. The current nullable Mentor/parent relationships and participant-only conversation Rules are compatibility gaps, not approved final behavior. The TDD and Developer 1 request must define exact interfaces, files, rationale and verification before any shared edit.

## 7. Scenarios and extensions

| Scenario | Main success | Important extension |
| --- | --- | --- |
| SC-01 — Student creates | Chosen eligible Mentor/module and valid question persist once as `PENDING`. | Invalid, stale, missing, inactive, or unsupported selection creates nothing; duplicate links to existing pending request and keeps draft. |
| SC-02 — Student recovers | Authorized persisted result resolves an uncertain send; same attempt can retry safely. | Changed-payload replay, access revocation, or unresolved network state never becomes false success. |
| SC-03 — Student follows | Own newest-first history, details, dashboard summary and live status agree. | Missing historical module metadata uses the approved label; failed/partial list is not empty success. |
| SC-04 — Mentor decides | Addressed Mentor sees oldest pending first and accepts/rejects; result appears in decided history and Student view. | Other actor denied; opposite repeat reports actual status; simultaneous decisions have one winner. |
| SC-05 — Eligibility changes | Active addressed Mentor decides a previously valid request despite later module/profile changes. | Ineligible Mentor account cannot act; request can remain pending for future support policy. |
| SC-06 — Acceptance integration | Accepted request and one correctly linked, participant-only F02 conversation become available together. | Lost reply, provisioning failure, repeat acceptance or concurrent calls leave no confirmed accepted-without-conversation result or duplicate conversation. |
| SC-07 — Session/subscription change | Open authorized views update; listener ends and private data clears on route/session change. | Subscription failure is visible and recoverable; old-account late results do not appear for new account. |

## 8. Numbered acceptance criteria

| ID | Given / when | Then |
| --- | --- | --- |
| AC-01 | Eligible Student opens Request Help from existing selected Mentor discovery/profile | The addressed Mentor is visible; one actual supported module can be chosen; a filter label alone does not silently become the selection. |
| AC-02 | Student submits valid title/description with outer whitespace and internal newlines | Stored content is outer-trimmed, keeps valid internal plain text/newlines, and is displayed without executing markup. |
| AC-03 | Title/description is blank after trim, over 120/2,000 characters, missing, or malformed | Field feedback appears; authoritative backend also rejects bypassed input; no request is created. |
| AC-04 | Selection is missing, Mentor is absent/inactive, Mentor profile inactive, module missing/inactive, or module absent from Mentor's supported IDs at submit | Authoritative submission rejects it with actionable feedback and no partial request, even if discovery previously showed it. |
| AC-05 | Unauthenticated, wrong-role, unverified under production policy, or inactive Student attempts creation; or client forges Student ID | Operation denies it without creating a request or disclosing another account's outcome; only documented synthetic emulator exception applies. |
| AC-06 | Authorized valid creation succeeds | Exactly one fresh read returns `PENDING`, selected Mentor, canonical `moduleId`, normalized question, server-derived Student, unique ID and server-controlled timestamps; UI confirms only that result. |
| AC-07 | Distinct attempts race for one Student–Mentor–module while pending | At most one `PENDING` request exists, independently of operation IDs or question text. |
| AC-08 | Distinct attempt is blocked by existing pending request, or earlier tuple request is terminal | Blocked attempt keeps text, says no new request, links existing pending record; terminal predecessor permits a new valid attempt. |
| AC-09 | Submission reply is lost or uncertain | UI retains draft and UUID, shows unconfirmed/checking, and reconciles authorized persisted outcome before claiming success. |
| AC-10 | Same Student retries unchanged operation ID/input, or reuses ID with changed input | Unchanged retry cannot add another request; changed input cannot retrieve unrelated stored success. |
| AC-11 | Account authorization is revoked before replay | Replay is denied before stored private outcome is returned; no prior account data leaks. |
| AC-12 | Student opens own history/detail | Only own persisted requests appear, newest creation first with deterministic ties, and detail shows persisted Mentor, question, module, status and relevant times. |
| AC-13 | Student history is empty, loading, partial, or failed | Each state is distinguishable; incomplete/error data is not presented as a complete empty history and recoverable failure offers retry. |
| AC-14 | Valid catalogue metadata exists, or historical module metadata is missing | Valid code is displayed; missing metadata shows exactly “Module information unavailable” and canonical ID remains internal. |
| AC-15 | Student dashboard request summary loads | Counts/list come from authorized persisted requests and agree with own history; F01 request samples are not shown as live data. |
| AC-16 | Request is accepted or rejected | Student detail/history shows the persisted terminal status and decision time from server-controlled update time; no rejection reason or separate audit history is required. |
| AC-17 | Addressed Mentor opens pending inbox | Only own addressed `PENDING` requests appear, oldest creation first with deterministic ties. |
| AC-18 | Mentor opens own request detail | Module, title, description, status, relevant times and Student display name appear; Student email and UID do not. |
| AC-19 | Mentor reviews decided requests | Own accepted/rejected records remain available in a separate decided view/detail after leaving pending queue. |
| AC-20 | Mentor list is loading, empty, partial, or failed | Each state is distinct; unseen records are not implied absent and recoverable failure offers retry. |
| AC-21 | Active addressed Mentor rejects pending request | It becomes `REJECTED` once, with server-controlled update time, no conversation and no later reactivation. |
| AC-22 | Active addressed Mentor accepts pending request in completed F01/F02 product | It is confirmed `ACCEPTED` only with exactly one associated F02 conversation containing that request's Student and Mentor. |
| AC-23 | Same outcome is repeated or accept/reject calls race | First terminal decision wins; same-outcome repeat returns stored result without timestamp change or extra conversation; opposite attempt reports a conflict with actual terminal status and does not mutate it. |
| AC-24 | Acceptance response is lost, provisioning fails, or outcome is uncertain | UI preserves the same intended decision, shows unresolved/checking, reconciles authorized request and conversation state, permits same-operation retry as needed, and never confirms accepted without required conversation. No durable accepted request is left without its conversation. |
| AC-25 | A direct close operation or UI search for close control is attempted | No F01 close control or effective close transition exists; F01 requests remain within the three approved states. |
| AC-26 | Catalogue module or Mentor profile changes after a valid pending submission | Request remains pending; active authorized addressed Mentor can still decide it; no automatic rejection occurs. |
| AC-27 | Addressed Mentor account loses eligibility while a request is pending | Decision is denied; request is not reassigned, auto-rejected or moved to a new status. |
| AC-28 | Student/Mentor holds authorized F01 list/detail open while a request changes | Persisted status and applicable queue/history membership update without manual refresh/navigation. |
| AC-29 | Route/session changes or old asynchronous result arrives | Prior listener ends; prior account's private data clears and cannot populate the new account's view. |
| AC-30 | Subscription fails, protected read denies access, or eligibility loss is detected | UI distinguishes failure/denial from empty success, offers recovery or access guidance, and clears stale private data where access is lost. |
| AC-31 | Another Student/Mentor reads, lists, subscribes or guesses a request ID | Access is denied without request content or existence-sensitive leakage; authorized list queries obey direct-read authorization. |
| AC-32 | Request is pending or rejected | Neither participant nor another account can access a usable conversation/messages for it. |
| AC-33 | Request is accepted and F02 integrated | One immutable parent link identifies the request; conversation membership equals request Student/Mentor and cannot be chosen or changed by a chat client. |
| AC-34 | Acceptance is retried concurrently or after reply loss | No second conversation is created for the same request, and no confirmed accepted request lacks its conversation. |
| AC-35 | Student or Mentor follows accepted-request context once F02 is integrated | Each reaches the same authorized conversation; F01 does not supply message storage or chat UI. |
| AC-36 | Production acceptance is considered | Real F02 provisioning, persistent link, access enforcement and end-to-end exactly-one evidence are present; a mock-only adapter cannot pass this gate. |
| AC-37 | Student, non-addressed Mentor, inactive/unverified actor, or signed-out user attempts a decision | Trusted operation denies it without changing the request or disclosing private content. |
| AC-38 | Browser attempts direct Firestore create/update/delete of a request or identity/status mutation | Rules deny the write; only trusted authorized creation/decision can change the approved fields. |
| AC-39 | Backend operation is invoked outside the UI guard | It independently verifies authoritative actor identity, role/status/verification, ownership and preconditions. |
| AC-40 | Request read/list/subscription and trusted replay are attempted after access changes | Current authorization controls result; old account data and replayed private responses do not leak. |
| AC-41 | Conversation/message access is attempted with forged membership or without accepted parent | Final integrated authorization denies it even if a participant array alone would have allowed it. |
| AC-42 | Both role journeys are exercised at laptop/mobile widths with keyboard/assistive technology | Form, lists, details, decisions, status, feedback and retry are operable and perceivable against WCAG 2.1 AA target; later manual observations record actual results. |
| AC-43 | Deterministic mock and Firebase Emulator checks are compared | Mock behavior is labeled as such; emulator-backed cases verify persistence, Rules, role/ownership, duplicate race, idempotent replay, terminal race and integrated consistency separately. |
| AC-44 | Later implementation handoff is prepared | User-facing workflow instructions, developer/shared contract documentation, actual test results and limitations, interaction summary, and requirement-to-test coverage are recorded in the project's established guides/logs/handoff; unrun checks are not reported as passing. |
| AC-45 | Student request form, history/detail, Mentor pending queue and decided views are inspected alongside the existing HelpiNUS application | Styling, layout, components and interaction patterns are consistent with the established app theme at laptop and 320 px mobile widths. Empty, populated, loading and error states are inspected; material visual inconsistencies are corrected before final delivery. |

## 9. Requirements and decision traceability

| PRD requirement | Governing source | Acceptance |
| --- | --- | --- |
| FR-01–FR-03 | MB §§1–4, 6–7; GD-02–GD-04; F01 §§3–6 | AC-01–AC-06 |
| FR-04–FR-05 | MB §§2, 4, 7, 9; GD-01, GD-08, GD-17 | AC-07–AC-11 |
| FR-06 | MB §§2, 4–6; GD-03, GD-05, GD-12, GD-15, GD-18 | AC-12–AC-16 |
| FR-07–FR-08 | MB §§2–4, 7; GD-05, GD-09–GD-13 | AC-17–AC-25 |
| FR-09–FR-10 | MB §§2–4, 7; GD-07, GD-14 | AC-26–AC-31 |
| FR-11 | MB §§1–3, 7; GD-06, GD-09, GD-16; F01 §7; F02 §§2–4 | AC-22, AC-24, AC-32–AC-36, AC-41 |
| FR-12; NFR-01–NFR-06 | MB §§2–7; GD-02, GD-10, GD-14, GD-16–GD-17; F01 §§5, 10; Sprint 1 quality/security baseline | AC-05–AC-06, AC-09–AC-11, AC-29–AC-44 |
| NFR-07 — Visual consistency and interface quality | Developer 2 UI consistency amendment to this draft; MB §2 laptop/mobile and WCAG target | AC-45 |

| Approved decision | PRD location | Approved decision | PRD location |
| --- | --- | --- | --- |
| GD-01 | FR-04–FR-05; AC-07–AC-10 | GD-10 | FR-07, FR-12; AC-18 |
| GD-02 | FR-01, FR-03; AC-04 | GD-11 | Scope, FR-08, lifecycle; AC-25 |
| GD-03 | FR-03, FR-06; AC-06, AC-14 | GD-12 | FR-06–FR-07; AC-12, AC-17 |
| GD-04 | FR-02; AC-02–AC-03 | GD-13 | FR-07; AC-19 |
| GD-05 | FR-06–FR-08; AC-16, AC-18, AC-21 | GD-14 | FR-10, FR-12; AC-28–AC-31 |
| GD-06 | FR-11; AC-24, AC-34 | GD-15 | FR-06; AC-15 |
| GD-07 | FR-09; AC-26–AC-27 | GD-16 | FR-11, §6; AC-36 |
| GD-08 | FR-04; AC-08 | GD-17 | FR-05; AC-09–AC-11 |
| GD-09 | FR-08, FR-11; AC-23–AC-24 | GD-18 | FR-06; AC-14 |

## 10. Dependencies, assumptions, risks, and next gate

- Existing discovery/profile, guarded role routing, Mentor module catalogue, and Student dashboard are entry/integration dependencies. Current discovery's placeholder action, Student request scaffold, dashboard mock requests, and absent Mentor request views are gaps, not evidence of delivered F01 behavior.
- Existing shared request schemas allow null Mentor and `CLOSED`; current F01 callables are unavailable stubs. These must be reconciled through the later Developer 1 shared-contract review without weakening this PRD. A canonical `moduleId` is approved product policy; exact schema changes belong to TDD.
- Existing conversation parent link is nullable and current Rules rely on participant membership without an accepted-parent check. F02 and Developer 1 must coordinate the final immutable link and read/write/subscription authorization. An F01 mock cannot close that gap.
- Request list/subscription authorization and bounded loading must align with direct-document Rules. The TDD must choose suitable query/order/pagination and listener mechanisms without implying unseen data is absent.
- If an addressed Mentor account loses eligibility, a valid pending request may become stranded. This is an acknowledged support/future-lifecycle risk; no F01 automatic decision, withdrawal or reassignment is approved.
- Catalogue population, F02 availability, shared-file ownership response, and real integrated evidence are later delivery dependencies. This PRD claims no successful emulator run, deployed feature, or resolved implementation parent.
- The later TDD MUST inspect the existing Student Dashboard, Mentor Dashboard, Mentor Profile, AppShell and relevant frontend assets, identify exact reusable components and visual conventions, and prefer their styling/components before proposing new ones. The later Requirements-to-Tests artifact MUST verify appropriate reuse and require manual browser inspection of implemented F01 screens in empty, populated, loading and error states, with screenshots or documented observations at desktop and 320 px mobile widths. Material UI inconsistencies MUST be corrected before final delivery. This requirement does not authorize redesign of existing dashboards, a new design system, or additional F01 functionality.

This PRD is approved. TDD and Requirements-to-Tests are separate later artifacts; no implementation is authorized by this approval.
