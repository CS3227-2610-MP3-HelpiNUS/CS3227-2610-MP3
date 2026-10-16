# Grilling Decisions — S2-D2-F01 Help Request Management

**Artifact status:** Approved — Grilling decisions only  
**Decision status:** GD-01 through GD-18 approved by Developer 2 in the interactive Grilling session  
**Draft date:** 2026-10-16  
**Owner:** Developer 2  
**Decision confirmation:** Developer 2 selected the answers to Q1–Q18, clarified Q7, and then answered “Confirm record” to the consolidated decision summary in this conversation.  
**Approval date:** 2026-10-16  
**Approval reference:** Developer 2's “Approved” reply in this Grilling conversation approving the exact draft with pre-header SHA-256 `9FA3D6B622EAB1EED44E6A29823E8FBD7EDC2DD3A4564BCBAF167DE639ECDC96`. Only approval metadata and the readiness statement were updated afterward.  
**Source:** [Approved F01 Mission Brief](../../mission-brief/S2-D2-F01-help-request-management.md)  
**Approval scope:** Product and security decisions in this record. No PRD, TDD, Requirements-to-Tests artifact, shared-contract edit, implementation, publication, or release is approved.  
**Implementation authorization:** Not granted.

## Authority and evidence

The approved Mission Brief fixes the selected-Mentor request, one supported module, `PENDING → ACCEPTED | REJECTED` lifecycle, Mentor-only decisions, immutable Student/Mentor identities, and exactly one conversation per accepted request in the completed F01/F02 integration. It excludes withdrawal, closure, reassignment, a public board, and F02 messaging. The Grilling session resolved the open policies without amending those boundaries. Q7's initial automatic-rejection selection was explicitly replaced by the subsequent “Keep Mentor-only” clarification; automatic rejection is **not** approved.

Evidence references below use these sources, inspected during the session:

- **MB:** `Dev2-local-SDD/docs/mission-brief/S2-D2-F01-help-request-management.md`, especially §§3–4, 6, 8–9.
- **F01:** `CS3227-2610-MP3-mentor-dashboard/workflow/specs/sprint-2/S2-D2-F01-help-request-management-spec.md`, especially §§3–7, 9.
- **F02:** the adjacent `S2-D2-F02-conversation-management-spec.md`, especially §§2–4, 6, 8.
- **Shared/backend:** `src/shared/src/{domain,callables}.ts`, `src/functions/src/{auth,index}.ts`, `firestore.rules`, and `src/functions/src/mentorDiscovery.ts` in the Mentor dashboard worktree.
- **Frontend:** `src/frontend/src` in that worktree, including Mentor discovery, Student dashboard/services, and routes.

The Mentor dashboard worktree was at `770586a` during the Mission Brief inspection, with unrelated local changes and untracked Sprint 2 specs. It is evidence of current behavior, not an approved F01 implementation parent. Existing implementation defaults are not product approval unless a decision below adopts them.

## Confirmed decisions

### GD-01 — Duplicate pending requests

- **Issue and evidence:** MB §9.1 and F01 §9 require an approved duplicate policy. `createHelpRequest` already accepts a UUID `requestId`, which identifies a submission attempt but does not by itself prevent distinct attempts with the same Student, Mentor, and module.
- **Alternatives considered:** Block every second pending request for the same Student–Mentor–module; compare normalized title/description for an exact match; or prevent only reuse of an operation ID. Text comparison is easy to bypass with small edits, while operation-ID-only protection does not enforce the specified duplicate-active rule.
- **Recommended option:** One pending request per Student–Mentor–module, with independent idempotency for retries.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** The tuple is objective and can be enforced under races. It temporarily prevents a different question to that Mentor in the same module while one request is pending; an `ACCEPTED` or `REJECTED` request does not permanently block a new question.
- **Resulting requirement:** At most one `PENDING` request may exist for a given Student–Mentor–module. A retried intended submission uses its original operation ID and cannot create another request.
- **Status:** `APPROVED`.

### GD-02 — Eligibility at submission

- **Issue and evidence:** MB §§6, 9.6 require authoritative compatibility checks. Mentor discovery joins active Mentor users and profiles but exposes saved `moduleIds`; F04 may retain valid references to inactive or missing catalogue modules. A loaded discovery selection can become stale.
- **Alternatives considered:** Require active Mentor account, active profile, active catalogue module, and the module ID in the profile; permit inactive legacy module IDs; or check only the Mentor account and saved ID.
- **Recommended option:** Require all active and compatible at submission.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** A stale or legacy profile reference cannot justify a new request for unavailable module support. A changed selection must be rejected with actionable feedback rather than silently accepted.
- **Resulting requirement:** The trusted backend checks the authenticated Student, selected Mentor's active account/profile, module existence and active state, and membership in that Mentor's saved `moduleIds` at submission time. Invalid or stale selections create no request.
- **Status:** `APPROVED`.

### GD-03 — Canonical module representation

- **Issue and evidence:** F01 describes a supported module code, while `HelpRequest.moduleId`, `createHelpRequest.moduleId`, and Mentor profile `moduleIds` use identifiers; the module catalogue supplies a human-readable code (MB §§6, 9.7).
- **Alternatives considered:** Persist canonical `moduleId` and resolve the code for display; persist the code and map it back to profile IDs; or store both ID and a code snapshot.
- **Recommended option:** Persist `moduleId` and resolve the code.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** It aligns validation and persistence with existing profile/catalogue relationships. Display depends on catalogue metadata, with the missing-record fallback specified in GD-18.
- **Resulting requirement:** `moduleId` is the authoritative persisted module reference. User-facing request views show the verified catalogue code when available; no client-supplied code is trusted as compatibility evidence.
- **Status:** `APPROVED`.

### GD-04 — Question text validation

- **Issue and evidence:** MB §9.2 leaves lengths open. Current shared schemas trim nonblank titles/descriptions and cap them at 120/2,000 characters (`callables.ts:62–67`, `domain.ts:55–65`), but those bounds were not previously approved policy.
- **Alternatives considered:** Keep 120/2,000; keep the title cap and raise description to 4,000; or shorten both to 100/1,000.
- **Recommended option:** Keep 120/2,000, trimming outer whitespace and allowing plain-text internal newlines.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** The existing bounds permit a detailed academic question without a shared-schema expansion. Whitespace-only content must fail; saved text must be rendered as text, not executable markup.
- **Resulting requirement:** Client and trusted backend reject blank or over-limit title/description after outer trimming. Preserve valid internal plain-text content, including newlines, and escape it in display.
- **Status:** `APPROVED`.

### GD-05 — Decision record and rejection details

- **Issue and evidence:** MB §9.4 asks whether current status/timestamps suffice. `HelpRequest` already has `status`, `createdAt`, and `updatedAt`; the approved F01 lifecycle has no later edit or close transition.
- **Alternatives considered:** Status and timestamps only; separate internal `decidedAt`/`decidedBy`; or a required Mentor-written rejection reason.
- **Recommended option:** Status and timestamps only.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** The terminal transition's server-controlled `updatedAt` supplies its decision time without extra fields or a new text-moderation surface. There is no user-visible decision history or mandatory rejection reason in this MVP.
- **Resulting requirement:** Show the current persisted status and relevant creation/decision time. Keep timestamps server-controlled; do not require or display a rejection reason or separate status-history list.
- **Status:** `APPROVED`.

### GD-06 — Uncertain acceptance response

- **Issue and evidence:** MB §§3, 9.5 and F02 §8 require exactly one conversation per accepted request and no confirmed accepted-without-conversation result. A timeout can hide an operation that succeeded on the server.
- **Alternatives considered:** Reconcile authoritative state, then retry the same operation; show a generic error and leave all retry to the Mentor; or block until reconnection and automatic recovery.
- **Recommended option:** Reconcile, then allow a same-operation retry if still uncertain.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** The UI remains truthful without making a network interruption appear to be a definite rejection or acceptance. It needs explicit unresolved-state feedback and reliable retry identity.
- **Resulting requirement:** On uncertain acceptance, show an unresolved/checking state, inspect authorized authoritative request and conversation outcome, and retry the same intended operation if needed. Never show successful acceptance until the durable integrated outcome is confirmed.
- **Status:** `APPROVED`.

### GD-07 — Eligibility changes after submission

- **Issue and evidence:** MB §3 freezes Mentor-only `PENDING → ACCEPTED | REJECTED` transitions and excludes withdrawal/reassignment. A module or Mentor profile can become inactive after a valid submission.
- **Alternatives considered:** Honor the valid submitted request for an active addressed Mentor; recheck all current module/profile eligibility before acceptance, possibly stranding it; or reject automatically when eligibility changes. Automatic rejection would contradict the approved Mentor-only decision rule and require a new trigger/race policy.
- **Recommended option:** Honor the submitted request without a system decision.
- **Developer 2's approved decision:** After initially selecting automatic rejection, Developer 2 explicitly chose “Keep Mentor-only” when the Mission Brief contradiction was explained. The later clarification supersedes the initial selection.
- **Rationale and trade-off:** Later catalogue/profile changes block new submissions but do not retroactively invalidate a valid pending request. An addressed Mentor whose account loses access cannot act; the request may remain pending because F01 has no withdrawal, reassignment, or administrative transition.
- **Resulting requirement:** An active, authorized addressed Mentor may decide a previously valid request despite later module/profile eligibility changes. No automatic rejection occurs. Keep the inactive-account stranded-request case as a support/future-lifecycle risk, without inventing a new status or actor.
- **Status:** `APPROVED`.

### GD-08 — Duplicate-submission feedback

- **Issue and evidence:** GD-01 can block a new question whose text differs from the existing pending question. MB §2 requires truthful failure feedback and no false success.
- **Alternatives considered:** Explain the duplicate with a link and preserve the draft; return the existing request as apparent submission success; or show a generic validation error.
- **Recommended option:** Explain and link.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** The Student can inspect the pending request without being told the new question was delivered. Preserving the draft avoids losing work.
- **Resulting requirement:** A duplicate-blocked submission shows the existing pending request link, retains the attempted title/description, and makes clear that no new request was created.
- **Status:** `APPROVED`.

### GD-09 — Repeated and racing Mentor decisions

- **Issue and evidence:** MB §7.4 and F01 acceptance criterion F01-AC-11 require deterministic outcomes under concurrent accept/reject actions. The existing response callable accepts only `ACCEPTED` or `REJECTED` (`callables.ts:70–74`).
- **Alternatives considered:** Return stored success for a repeated same outcome and conflict for an opposite outcome; conflict on every repeat; or let a later decision replace the first.
- **Recommended option:** Return the stored result for the same outcome and report a conflict with actual status for an opposite outcome.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** Safe retries remain understandable while the first terminal decision wins. Changing a terminal decision would violate the approved lifecycle and could invalidate conversation access.
- **Resulting requirement:** One atomic terminal transition wins. Repeated same-outcome calls do not create another conversation or alter timestamps; an opposite action reports the persisted terminal status and does not mutate it.
- **Status:** `APPROVED`.

### GD-10 — Student identity shown to the Mentor

- **Issue and evidence:** MB §2 calls for relevant Student/request metadata but does not authorize disclosing contact details. The authoritative user record contains display name and email (`src/functions/src/auth.ts`).
- **Alternatives considered:** Show display name only; show name and email; or hide Student identity entirely.
- **Recommended option:** Show display name only.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** The Mentor can understand the personal request without an unnecessary off-platform contact disclosure. Internal UID remains available only for authorization and persistence.
- **Resulting requirement:** Mentor request surfaces display the Student's authorized display name and request content, not their email or UID. Backend authorization still uses immutable IDs rather than display names.
- **Status:** `APPROVED`.

### GD-11 — Dormant closure contract

- **Issue and evidence:** Shared `HelpRequestStatus` includes `CLOSED`, the callables registry includes `closeHelpRequest`, and the Developer Guide/Sprint 1 contract mentions closure. Its function is currently an unavailable stub (`src/functions/src/index.ts:45`). MB §3 and F01 §8 exclude F01 closure.
- **Alternatives considered:** Retain shared closure symbols as dormant compatibility scaffolding; or ask Developer 1 to remove them from shared contracts now.
- **Recommended option:** Retain dormant scaffolding.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** It avoids unnecessary shared-contract breakage while preserving the approved three-state F01 behavior. Dormant symbols must not silently become a working operation or UI action.
- **Resulting requirement:** No F01 close control or functional close transition. F01-created requests use only `PENDING`, `ACCEPTED`, and `REJECTED`; documentation must distinguish the current MVP from Sprint 1 scaffolding. A direct close call must not change a request.
- **Status:** `APPROVED`.

### GD-12 — Request list ordering

- **Issue and evidence:** MB §4 requires Student history and Mentor assigned requests but does not specify order. The current Student request route is a scaffold, with no existing F01 ordering behavior.
- **Alternatives considered:** Student newest first and Mentor pending oldest first; newest first in both; or oldest first in both.
- **Recommended option:** Student newest, Mentor pending oldest.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** Students find recent activity readily while the Mentor queue makes older unanswered requests visible. Technical design must choose a stable tie-breaker and bounded loading.
- **Resulting requirement:** Student history sorts by creation time descending; Mentor pending queue sorts by creation time ascending. Equal timestamps have deterministic order, and list loading must not imply unseen records are absent.
- **Status:** `APPROVED`.

### GD-13 — Mentor access to decided requests

- **Issue and evidence:** MB §2 requires the persisted decision to remain visible to the Mentor; a pending-only inbox would remove the item immediately after action.
- **Alternatives considered:** Pending queue plus decided history/detail; pending-only list with transient confirmation; or one combined list with filters.
- **Recommended option:** Pending queue plus decided history/detail.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** Pending work stays distinct, while past actions remain reviewable. It requires a second authorized list state rather than only a success toast.
- **Resulting requirement:** The addressed Mentor has a pending queue and a decided-request view/detail for their own `ACCEPTED` and `REJECTED` records.
- **Status:** `APPROVED`.

### GD-14 — Request status freshness

- **Issue and evidence:** MB §4 permits persisted reads or subscriptions, and asks that both participants see synchronized status. Existing request Rules permit active participant reads but safe owner-scoped list queries and subscription cleanup still require design (`firestore.rules:29–32`).
- **Alternatives considered:** Refresh on route entry/actions with manual refresh; live subscriptions on open request views; or manual refresh only.
- **Recommended option:** Refresh at key moments, limiting listener complexity.
- **Developer 2's approved decision:** **Live subscriptions** on open request lists/details, choosing faster cross-device updates over the simpler recommended option.
- **Rationale and trade-off:** Student and Mentor see persisted status changes without navigation or manual refresh. The extra listener/query complexity must not expose another user's data or retain prior-account data.
- **Resulting requirement:** Open F01 lists and details subscribe to authorized request changes, show persisted outcomes, clean up listeners on route/session changes, and clear stale private data on identity or eligibility loss. Subscription failure has a visible recovery path; no unobserved remote account-status change is promised to be instantaneously detected.
- **Status:** `APPROVED`.

### GD-15 — Student dashboard request summary

- **Issue and evidence:** MB §§5–6 notes that `StudentDashboard` uses `mockDashboard` even in Firebase mode, so request counts/list are sample data. F01 must not present those samples as live requests.
- **Alternatives considered:** Replace only the dashboard request summary with authorized F01 data; hide it until a later dashboard feature; or retain it as visibly labeled sample data.
- **Recommended option:** Replace the request summary.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** The dashboard and real request history then agree without expanding F01 into unrelated dashboard widgets.
- **Resulting requirement:** Dashboard request counts/list derive from persisted requests authorized for the current Student. Unrelated preview widgets remain outside F01 and must not be described as live F01 data.
- **Status:** `APPROVED`.

### GD-16 — F01 production release gate

- **Issue and evidence:** MB §3 permits an explicit F02 mock/adapter for independent F01 development, but F01/F02 integration requires a real, unique conversation for each accepted request. Current `Conversation.helpRequestId` is nullable and current Rules authorize participant access without checking an accepted parent (`domain.ts:68–75`; `firestore.rules:33–46`).
- **Alternatives considered:** Hold production acceptance until real F02 integration is tested; or ship submission/rejection first with acceptance disabled as an explicit partial journey.
- **Recommended option:** Hold the production release of the acceptance workflow.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** Development can proceed against a clearly labelled adapter, but a mock cannot satisfy the user-facing acceptance promise or security invariant.
- **Resulting requirement:** Do not release production F01 acceptance until trusted F02 provisioning, immutable per-request linkage, access enforcement, and end-to-end exactly-one evidence pass. Mock-only verification is labelled incomplete for that gate.
- **Status:** `APPROVED`.

### GD-17 — Uncertain Student submission

- **Issue and evidence:** MB §§2, 4, 7 require truthful confirmation and no unintended duplicate after a network failure. A new operation ID on retry could conflict with GD-01 or create another request after the earlier request leaves pending.
- **Alternatives considered:** Retain the draft and operation ID, reconcile, then retry the same attempt; or show an error and start a new attempt.
- **Recommended option:** Reconcile the same attempt.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** The Student does not lose their question or accidentally submit it twice. Reconciliation adds client state, but no false success is shown.
- **Resulting requirement:** Keep the attempted payload and UUID across uncertain submission retries; check authorized persisted outcome and retry with the same UUID if necessary. Reauthorize the caller before replaying any stored result; reuse of an ID with changed input must not return an unrelated success.
- **Status:** `APPROVED`.

### GD-18 — Missing historical module metadata

- **Issue and evidence:** GD-03 stores only the canonical module ID. A catalogue record can later disappear, while an existing request remains a valid historical record under GD-07.
- **Alternatives considered:** Show a generic unavailable label while retaining the ID internally; or persist a separate code snapshot for historical display.
- **Recommended option:** Generic unavailable label.
- **Developer 2's approved decision:** The recommended option.
- **Rationale and trade-off:** No stale or invented code is presented as current catalogue truth. The label is less descriptive than a snapshot but does not add denormalized request data.
- **Resulting requirement:** When catalogue metadata cannot resolve a historical `moduleId`, show “Module information unavailable” in user-facing request views and retain the canonical ID for internal identity and diagnostics.
- **Status:** `APPROVED`.

## Governing decisions retained, not newly opened

- Only the addressed Mentor may accept or reject a pending request. F01 has no Student withdrawal, system rejection, public claim, reassignment, closure, or status after `ACCEPTED`/`REJECTED`. Identity fields cannot change after submission. The earlier automatic-rejection suggestion is superseded by GD-07.
- An accepted request must have exactly one conversation associated with that request, with immutable Student/Mentor membership. Pending or rejected requests have no usable conversation. F01 owns the request transition; F02 owns conversation persistence, messaging, and chat UI.
- Actor identity, role, status, verification, and request ownership come from authenticated authoritative records. Admin SDK mutations need backend authorization; Firestore Rules must deny direct client request writes and unauthorized reads/lists. Replayed idempotent outcomes must not bypass current caller authorization.
- Laptop/mobile usability, WCAG 2.1 AA, accurate loading/empty/error/denied states, deterministic mocks, and emulator-backed security evidence remain governing project requirements. No F01 decision authorizes appointments, availability, notifications, or unrelated dashboard redesign.

## Developer 1 shared-contract coordination request

The later implementation handoff must ask Developer 1 to review exact shared-file changes before editing Developer 1-owned contracts or Rules. This record defines the needed behavior, not the final wire shape or an approval to change those files.

| File or boundary | Required contract outcome | Reason and required evidence |
| --- | --- | --- |
| `src/shared/src/domain.ts` and `src/shared/src/callables.ts` | New F01 submissions require a non-null selected Mentor and canonical `moduleId`; F01 supports its three lifecycle states while `CLOSED`/`closeHelpRequest` stay dormant. Final F02 conversation has a required immutable parent request link. | Align shared validation with GD-02, GD-03, GD-11 and the MB/F02 invariant; verify runtime schemas, compatibility, and no functional close path. |
| `firestore.rules` and associated Rules tests | Keep participant-only request reads and deny direct request writes; final conversation/message access must also require an accepted parent request and correct immutable participants. List queries/subscriptions must satisfy the same authorization as direct reads. | Current participant-array-only conversation Rules allow access without checking parent request state. Test unrelated users, pending/rejected parents, forged membership, stale account access, and authorized live queries. |
| F01 acceptance ↔ F02 provisioning interface | One trusted, idempotent operation must durably establish the terminal request state and exactly one conversation, or leave acceptance unconfirmed. | Verify retry, concurrent accept/reject, partial failure, and per-request uniqueness against real F02 persistence before production release. |

Exact callable payloads, transaction layout, query/index design, listener implementation, and the code-worktree parent checkpoint belong to TDD and workflow coordination. The current Mentor dashboard worktree contains untracked Sprint 2 specs and unrelated local changes; do not infer an approved F01 branch from it.

## Verification handoff and readiness

Later Requirements-to-Tests must cover tuple-duplicate races, same-ID retry and changed-payload replay, forged Student identity, inactive or unsupported Mentor/module selection, stale discovery data, unauthorized reads/lists/status changes, direct Firestore-write denial, concurrent Mentor decisions, same/opposite repeat responses, historical module fallback, live listener cleanup across account/route changes, truthful dashboard data, and actual F01/F02 accepted-request/conversation consistency. Mock tests alone cannot satisfy the production integration gate.

**Approved versus deferred:** GD-01–GD-18 are confirmed product decisions. No material F01 product question is deferred. Exact technical mechanisms, shared-file approvals, production catalogue population, and a future remedy for requests stranded by an inactive Mentor account are dependencies or later-stage work, not implicit F01 scope.

**PRD readiness:** Developer 2 has approved this decision record, and no material F01 product decision blocks subsequent PRD drafting. PRD generation remains a separate stage; this approval does not authorize or generate a PRD, TDD, Requirements-to-Tests artifact, implementation, commit, push, or pull request.
