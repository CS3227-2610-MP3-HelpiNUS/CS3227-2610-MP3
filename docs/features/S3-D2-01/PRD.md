# Product Requirements Document — S3-D2-01 Shared SoCLaaS Gateway and Mentor Conversation Summary

**Status:** Developer 2 approved for TDD planning; complete SDD package approval and Git publication pending  
**Draft date:** 2026-10-20 (Asia/Singapore)  
**Approval date:** 2026-10-20 (Asia/Singapore)  
**Feature owner / workstream:** Developer 2 / Sprint 3 S3-D2-01  
**Sources:** [Approved Mission Brief](../../mission-brief/S3-D2-01-shared-soclaas-mentor-summary.md), [approved Grilling Decisions](GrillingDecisions.md), Sprint 3 MP3 requirements, and the repository's Sprint 1 architecture and shared-contract conventions.  
**Approval scope:** Developer 2 approved the product requirements with the two clarifications in the approval reply: required brief fields may explicitly report no identified unresolved questions or limitations, without fabricated content; the TDD must separate Developer 2's shared quota infrastructure from Developer 1's Student handler integration, with joint budget verification. This approval authorizes TDD drafting only, not Requirements-to-Tests, shared-file edits, SoCLaaS calls, secrets, deployment, code, commits, pushes, or real-user release.
**Counts:** 13 functional requirements, 8 non-functional requirements, 39 acceptance criteria.

## Document authority and decision boundary

The Mission Brief fixes the A → B1 → B2 → B3 → C → D → E sequence and scope. Grilling Decisions GD-01–GD-12 fix the selected policies. Sprint 3 requirements supply the shared-gateway and Mentor deliverables; existing code shows compatibility constraints rather than new product policy. Developer 1 owns shared architecture approval and the Student Study Assistant. Developer 2 owns this gateway proposal and Mentor feature, subject to the shared-file approval process in workflow/agents/README.md.

This PRD states behavior that a Mentor, Developer 1 consumer, test operator, or reviewer can observe. The TDD must choose internal module boundaries, exact data schemas, quota transaction details, timeout configuration constraints, safe error mapping, model-specific token budgeting, and test seams without changing the outcomes below. Unavailable external facts are named as gates in §9. This PRD approval confirms the product behavior; it does not assert that those gates have passed.

## 1. Purpose and success

Provide one reusable server-side connection to the NUS SoCLaaS gateway and let an eligible Mentor explicitly request an AI consultation brief for one accepted Student–Mentor conversation. The Mentor reviews and edits the private draft before any manual use. The Student Study Assistant can consume the same provider connection without depending on Mentor prompts, conversation records, or UI.

Phase 1 success means: A proves restricted real connectivity; B1 exposes a reusable, independently testable gateway; B2 securely assembles and validates a bounded conversation summary request; B3 proves the actual Mentor button-to-editable-brief path with real SoCLaaS and synthetic test data; C proves production-path technical readiness, including shared quotas, audit, safe failures, and baseline security. **C does not authorize real-user production release. Successful D adversarial security verification and separate release approval are required before real users or real conversations enter the feature.**

## 2. Audience, scope, and dependencies

| Actor | Intended outcome |
| --- | --- |
| Eligible Mentor | Opens one accepted conversation, explicitly requests a fresh brief, sees what context was omitted, and edits the four-section AI draft privately. |
| Student | Continues using the existing conversation unchanged; has no access to the Mentor brief or Mentor AI callable. |
| Developer 1 Student handler | Uses the shared provider capability and mock without importing Mentor authorization, retrieval, or prompt behavior. |
| Test operator | Verifies restricted model access and synthetic end-to-end behavior without exposing credentials or real conversations. |
| Release approver | Receives separate A–C readiness evidence, D adversarial security evidence, and real-data handling approval before real-user enablement. |

**Included:** restricted SoCLaaS connectivity proof; shared provider and mock behavior; Mentor callable contract amendment; current Mentor and accepted-pair authorization; bounded, validated server-side message selection; a structured four-section brief; private review/edit UI; B3 test-account and resource gates; C quotas, audit, and failure handling; and evidence/handoff for Developer 1 and D.

**Excluded:** Developer 1's Student prompt/business logic and UI; booking, appointment, help-request, conversation, or message mutation by AI; autonomous tools or background summarisation; saving Mentor edits; arbitrary client-supplied transcript text or Firestore paths; production release; comprehensive semantic scoring or prompt optimisation; and the dedicated D adversarial campaign, which belongs to S3-D2-02.

The existing accepted F01/F02 request and matching conversation are prerequisites. The current AI callables are unavailable placeholders. The Student public contract remains Developer 1-owned unless separately amended. A real-provider test cannot pass with a mock, missing credential, unapproved model, or unverified environment.

## 3. Primary journeys

1. **A — restricted connection.** An authorized operator verifies the intended development target and project-key catalog. Developer 2 approves an exact returned model ID. A server-side harness with no public callable makes at most one bounded, synthetic chat-completion attempt and records redacted evidence.
2. **B1 — shared capability.** Developer 2 obtains Developer 1's response to the exact shared interface/file/test request before edits. The provider adapter and matching mock expose the same success, usage, and safe-failure behavior to Student- and Mentor-shaped test consumers.
3. **B2/B3 — Mentor brief.** An allowlisted, eligible Mentor opens an accepted synthetic conversation and selects Summarise Conversation. The callable verifies current role and the exact accepted Student–Mentor pair before reading messages, selects only bounded valid messages from that conversation, and asks SoCLaaS for a four-field brief. It rechecks access before returning. The Mentor sees an AI draft with any partial-history notice and can edit it in the current page session.
4. **C — technical readiness.** The same path handles missing config, malformed output, timeout, quota, and transient provider errors safely. Shared Student/Mentor budgets and concurrency limits work across Function instances; minimal audit records support review. Tests establish readiness without opening the feature to real users.
5. **D and later release.** S3-D2-02 tests stored prompt injection, leakage, unauthorized action attempts, mitigations, and regressions. Real-conversation transmission additionally needs approved provider handling terms and participant notice/consent policy. Release approval is a separate decision.

## 4. Functional requirements

### FR-01 — Restricted real-provider proof (A)

The initial connectivity proof MUST use a project key from a server-side Firebase-managed secret in an approved isolated development target. It MUST first obtain the key-visible model catalog, use only an exact model ID approved by Developer 2, and make at most one small synthetic inference attempt from the intended Functions runtime before an explicit reset. The harness MUST expose no public callable or general-user path. Missing, rejected, or invalid configuration MUST fail safely without a provider inference. **Acceptance:** AC-01–AC-03. **Source:** MB §§3, 8–10; GD-02/03.

### FR-02 — Shared gateway capability (B1)

One server-side SoCLaaS gateway MUST be usable by separate Student and Mentor handlers. It MUST accept only bounded trusted handler input/options, return provider text plus available usage through a consistent success shape, and present normalized safe failures. A mock MUST reproduce the observable success and error contract for independent tests. The gateway MUST contain no Mentor conversation lookup or role-specific prompt. The Student public callable MUST remain compatible unless Developer 1 separately approves a change. **Acceptance:** AC-04–AC-06. **Source:** MB §§3, 5, 9; GD-04.

### FR-03 — Shared-owner checkpoint

Before B1 shared-file edits, Developer 2 MUST give Developer 1 the exact proposed files, interface, compatibility impact, failure shape, and required tests; Developer 1's approval or rejection MUST be recorded. A rejection MUST trigger revision rather than silent shared-file takeover. Final proof that both production AI features use the same gateway is a joint S3-D1-01/S3-D2-01 integration obligation, not a claim established by a Mentor-only test. **Acceptance:** AC-05–AC-06, AC-35. **Source:** MB §5; GD-04.

### FR-04 — Explicit Mentor request and public input (B2/B3)

The Mentor MUST deliberately request a new summary for the open accepted conversation; opening a page or receiving messages MUST NOT invoke AI. The public Mentor request contains only the help-request/conversation selector, helpRequestId. It MUST NOT accept client notes, transcript bodies, prompt instructions, arbitrary paths, or provider credentials as authority. A pending UI request disables duplicate clicks. No B-phase operation-ID idempotency promise is made. **Acceptance:** AC-07–AC-08. **Source:** MB §§3, 5; GD-05.

### FR-05 — Current authorization and conversation identity (B2)

Before any message retrieval or provider call, trusted code MUST authenticate the caller as a currently eligible Mentor, re-read the accepted help request and same-ID conversation, and verify that the caller is its addressed Mentor and that the Student/Mentor pair matches exactly. Missing, pending, rejected, foreign, inconsistent, or revoked relationships MUST fail without reading message bodies or invoking SoCLaaS. Current eligibility and accepted-pair authorization MUST be rechecked before a generated result is returned; a result produced after revocation MUST be withheld. **Acceptance:** AC-09–AC-12. **Source:** MB §§3, 6, 9; GD-09.

### FR-06 — Validated bounded message selection (B2)

Only messages under the one authorized conversation may enter model context. The server MUST validate each selected record's body, sender, relationship, and expected stored shape. A corrupt selected record or a sender outside the accepted pair MUST stop the summary before a provider call and yield safe support guidance. When all messages fit, the request covers the whole conversation. Otherwise it uses the most recent complete messages, ordered chronologically, and the Mentor sees that earlier history was omitted. The provisional upper ceiling is 30 messages and 12,000 total message characters; it MUST be reduced if the approved model requires a smaller safe budget. Empty history MUST produce a clear empty state without a provider call. **Acceptance:** AC-13–AC-16. **Source:** MB §§3, 6–7; GD-08/09.

### FR-07 — Trusted task instructions and structured result (B2)

The server's initial trusted instructions MUST request a factual consultation brief grounded in selected messages and treat stored messages as untrusted data. The model MUST receive no privileged application-action tools. The returned result MUST parse as JSON with four plain-text fields: summary, unresolvedQuestions, teachingApproaches, and limitations. Each field MUST be present and usable; the combined validated content MUST be no more than 8,000 characters. The unresolvedQuestions and limitations fields MAY explicitly state that none were identified from the selected context; required fields MUST NOT be filled with fabricated content. Where the selected messages do not establish an answer, the brief MUST say so rather than invent facts, commitments, or Student intent. Invalid or oversized provider output MUST fail safely without being displayed as a successful brief. **Acceptance:** AC-17–AC-19. **Source:** MB §§3, 7, 9; GD-10.

### FR-08 — Private Mentor review and editing (B3)

The authorized Mentor UI MUST label the result as an AI draft, show the four sections as editable plain text, and show a partial-history notice when applicable. Editing remains in the current page session; it MUST clear when the account or selected conversation changes. The draft MUST NOT be auto-sent, saved as a message, placed into a help request, or used to change appointments/bookings or other business state. The existing chat continues to display its own authorized messages independently. **Acceptance:** AC-20–AC-22. **Source:** MB §§3, 6–7; GD-10.

### FR-09 — Controlled B3 audience and budget

Before the real-provider button test, the development project MUST be verified as isolated and synthetic-only, and exact approved Firebase test UIDs MUST be configured. The backend MUST deny every other UID even if the callable is invoked directly. The deployed B3 test scope MUST allow no more than 10 attempted provider calls in total and one provider call in flight, with limits that hold across instances/redeploys and require explicit operator reset. The test uses synthetic accepted conversations only. **Acceptance:** AC-23–AC-26. **Source:** MB §§3, 6, 8–9; GD-06.

### FR-10 — Safe failure and recovery (B3/C)

The Mentor UI MUST distinguish loading, empty history, partial history, success, permission or eligibility loss, exhausted test/production quota, timeout, malformed output, missing configuration, and other safe provider failure. It MUST preserve the conversation view when generation fails and MUST NOT claim that an uncertain request was free or that a result was produced. Raw provider bodies, credentials, hidden instructions, and private prompt material MUST NOT appear in browser errors. At C, the gateway MAY make at most one automatic retry after a clearly rejected/rate-limited attempt when the overall deadline and quota allow; an ambiguously sent request MUST NOT be retried automatically. **Acceptance:** AC-16, AC-27–AC-30. **Source:** MB §§3, 9; GD-12.

### FR-11 — Shared C resource controls

Before C is declared technically ready, Student and Mentor AI requests MUST share one application-wide aggregate daily budget and each user MUST have a daily limit. At most one AI request per user may be in flight; a separately approved aggregate in-flight ceiling MUST hold across instances. Admission MUST be enforced by trusted backend state before invoking SoCLaaS and reject excess requests without a provider call. Exact daily thresholds, UTC/reset policy, and the aggregate concurrency ceiling MUST be approved from the project key's verified request/token budget before C passes. **Acceptance:** AC-31–AC-33. **Source:** MB §§3, 8–10; GD-11.

### FR-12 — Minimal audit and operational evidence (C)

AI outcomes MUST create backend-only audit records containing actor ID, feature, time, outcome/error class, model ID, and available usage/attempt counts, retained for 30 days. Routine audit and logs MUST exclude prompts, conversation bodies, outputs, secrets, and prompt hashes. Denials, quota events, transient failures, and success MUST be distinguishable without revealing private content. The existing promptHash scaffold is not authority to store prompt-derived data. **Acceptance:** AC-34–AC-36. **Source:** MB §§3, 9; GD-12.

### FR-13 — Readiness and release separation

Milestone C MUST produce evidence for functional flow, shared quotas/races, bounded input and output, denial before retrieval/inference, privacy-safe logging, safe errors, baseline security, and regression compatibility. C completion MUST be reported as production-path technical readiness only. No general-user access or real-conversation transmission is permitted by A–C completion. Successful D adversarial verification, approved real-data handling and participant policy, and separate release approval are required before release to real users. **Acceptance:** AC-37–AC-39. **Source:** MB §§1, 8–12; GD-01/07.

## 5. Non-functional requirements

| ID | Requirement | Acceptance |
| --- | --- | --- |
| NFR-01 | Keep bearer credentials on the server in separate dev/prod Firebase-managed secrets; restrict outbound requests to the approved HTTPS SoCLaaS origin and reject unsafe redirects. | AC-01, AC-03, AC-34 |
| NFR-02 | Bound request size, selected context, provider deadline, response size, and concurrent work from the first real-provider call; fail closed if approved configuration is unavailable. | AC-02, AC-15, AC-18, AC-26, AC-28 |
| NFR-03 | Render model output as inert text, distinguish trusted instructions from stored message data, and avoid privileged model tools or automatic business-state changes. | AC-17–AC-22 |
| NFR-04 | Use current authoritative identity/relationship checks for Admin SDK reads; prevent cross-user data from reaching prompts, browser responses, or logs. | AC-09–AC-14, AC-34 |
| NFR-05 | Keep the Mentor button and editable brief usable by keyboard and on the existing responsive conversation view; expose loading, notice, and failure status accessibly. | AC-20, AC-27 |
| NFR-06 | Preserve existing Auth, F01/F02 conversation behavior, Student callable compatibility, and service-adapter boundaries. | AC-04–AC-06, AC-22, AC-35 |
| NFR-07 | Support deterministic mock, unit, emulator/integration, and UI checks plus controlled real-provider evidence; a mock-only result cannot satisfy A or B3. | AC-02, AC-04, AC-23–AC-26, AC-37 |
| NFR-08 | Initial quality verification checks required sections, bounds, parseability, and a few synthetic briefs for obvious inventions or omissions. Extensive semantic scoring and prompt tuning are deferred until after D. | AC-17–AC-19, AC-38 |

## 6. Acceptance criteria by milestone

| ID | Observable criterion |
| --- | --- |
| AC-01 | The project key is absent from Git/client assets and unavailable to the browser; missing server secret or unapproved endpoint/model fails safely. |
| AC-02 | A restricted server-side test lists key-visible models, then produces redacted evidence for at most one approved-model synthetic inference attempt; no public callable exists for A. |
| AC-03 | The A harness refuses an unapproved model, non-HTTPS/foreign origin, excess attempt, or absent approved environment without inference; it does not follow an unsafe redirect or make a second request through one. |
| AC-04 | Real and mock gateway consumers observe matching success, usage-when-available, timeout, quota, malformed-response, and other safe-failure categories. |
| AC-05 | A Student-shaped consumer and the Mentor handler can use the gateway without importing each other's feature modules; the current Student public request/response still validates. |
| AC-06 | Developer 1's exact shared-contract response is recorded before shared edits; rejected changes are not silently applied. |
| AC-07 | Opening a conversation or receiving a message causes no AI call; one deliberate Mentor action targets its open accepted conversation. |
| AC-08 | The public Mentor request rejects appointmentId, notes, transcript bodies, prompt instructions, and arbitrary paths; only helpRequestId selects scope. |
| AC-09 | Unauthenticated, Student, inactive, unverified, or otherwise ineligible callers receive safe denial before any message read or provider call. |
| AC-10 | A foreign Mentor, wrong parent, pending/rejected request, missing conversation, or mismatched accepted pair is denied before any message read or provider call. |
| AC-11 | Only the addressed Mentor and exact accepted Student–Mentor pair can reach selected message data. |
| AC-12 | Loss of Mentor eligibility or accepted-pair authorization during inference prevents the generated brief from being returned. |
| AC-13 | Provider input contains only valid selected messages from the one authorized conversation, ordered deterministically, with no client-supplied message text. |
| AC-14 | A selected malformed message or unexpected sender yields safe support guidance and no provider call. |
| AC-15 | Up to 30 complete messages and 12,000 message characters are selected, further reduced to fit the approved model; earlier omissions cause a visible partial-history notice. |
| AC-16 | An accepted conversation with no valid messages shows an empty state and incurs no provider call. |
| AC-17 | Valid output has the four required fields and stays within 8,000 combined characters; unresolvedQuestions and limitations may explicitly say none were identified, and sparse context is identified without fabricated facts. |
| AC-18 | Missing fields, wrong types, oversized or unparseable output yield a safe failure, with no raw provider response shown as a brief. |
| AC-19 | A few synthetic conversation examples receive human sanity review for required sections and obvious factual omissions/inventions; no elaborate quality rubric is imposed. |
| AC-20 | A designated Mentor can click Summarise Conversation, see loading, receive a real-provider four-section draft, edit each section, and see truncation notice when applicable. |
| AC-21 | Navigating to another conversation or account clears the prior private AI draft and discards late prior-context results. |
| AC-22 | Generation and editing cause no message, help-request, booking, appointment, or other business-state mutation. |
| AC-23 | B3 runs only after the development target is verified synthetic-only and exact test UIDs are approved. |
| AC-24 | Direct callable invocation by a nondesignated UID is denied despite any frontend visibility flag. |
| AC-25 | The 11th attempted provider call is denied across instance/redeploy boundaries until an explicit reset; denied requests never reach SoCLaaS. |
| AC-26 | Only one B3 provider call can be in flight across the deployed test scope; limits and deadlines still hold on failure. |
| AC-27 | Loading, empty, partial, success, authorization loss, quota, timeout, malformed output, and other failures have distinguishable accessible feedback. |
| AC-28 | Timeout, 429, 5xx, missing configuration, and invalid provider data expose no credentials, raw private prompt, or provider body to the browser. |
| AC-29 | At most one clearly safe retry occurs within deadline/quota; ambiguous sent requests are not automatically resent. |
| AC-30 | Failed generation leaves the authorized conversation usable and does not claim a successful brief or a free attempt. |
| AC-31 | Student and Mentor calls consume the same aggregate C budget and per-user daily budgets; an excess call is denied before provider invocation. |
| AC-32 | Concurrent calls across instances cannot exceed the approved aggregate budget/in-flight ceiling; a user cannot hold two in-flight AI requests. |
| AC-33 | Approved numeric C limits, window/reset policy, and key-budget evidence are recorded before C is declared technically ready. |
| AC-34 | Audit and routine logs contain only approved metadata, with no prompt hash, transcript text, generated output, or key. |
| AC-35 | Shared-contract tests and Developer 1 coordination show the Student seam remains compatible; joint use by both production features is reported separately when integrated. |
| AC-36 | Audit access is backend-only and records expire after 30 days. |
| AC-37 | A–C evidence includes focused mock/unit, emulator/integration, UI, regression, baseline-security, and controlled real-provider results with environment and limitations recorded. |
| AC-38 | C readiness is reported as technical readiness, with no claim of completed D adversarial verification or broad semantic quality. |
| AC-39 | General-user release remains blocked until successful D adversarial verification, approved real-data handling/participant policy, and separate release approval. |

## 7. Failure and boundary behavior

| Situation | Required product outcome |
| --- | --- |
| No approved key/model/environment | A or later real-provider operation stops safely; mock evidence is labeled mock and cannot satisfy the real-provider milestone. |
| Ineligible or foreign caller; bad accepted pair | Safe denial before message retrieval or SoCLaaS; no existence-sensitive details returned. |
| Empty selected conversation | No inference; show an empty-history state. |
| Corrupt selected record | No inference; safe support-needed state, without silently omitting the record. |
| Earlier messages omitted by bound | Brief may proceed from the recent valid slice with a visible partial-history notice. |
| Access revoked during inference | Discard generated result and show access loss; do not reveal the draft. |
| Malformed or unsafe provider result | No successful brief; safe retry guidance subject to quota. |
| Provider timeout, rejection, or lost reply | Do not assert that provider cost was avoided; automatic retry follows FR-10 only. |
| Test cap or C quota exhausted | No provider invocation; explain temporary unavailability without exposing private operational details. |
| Account or conversation changed while pending | Clear private draft and ignore late result from the previous context. |

## 8. Requirement traceability and deferred ownership

| Approved decision | PRD coverage |
| --- | --- |
| GD-01 readiness versus release | FR-13; AC-37–AC-39 |
| GD-02/03 credential, model, smoke | FR-01; NFR-01/02; AC-01–AC-03 |
| GD-04 shared seam and owner | FR-02/03; NFR-06; AC-04–AC-06, AC-35 |
| GD-05 Mentor request | FR-04; AC-07–AC-08 |
| GD-06 B3 controls | FR-09; AC-23–AC-26 |
| GD-07 real-data deferral | FR-13; AC-39 |
| GD-08 selection and context | FR-06; AC-13–AC-16 |
| GD-09 corruption and revocation | FR-05/06; AC-09–AC-14 |
| GD-10 structure, editing, quality | FR-07/08; NFR-08; AC-17–AC-22 |
| GD-11 C quotas | FR-11; AC-31–AC-33 |
| GD-12 audit and retry | FR-10/12; AC-27–AC-30, AC-34/36 |

S3-D2-02 owns dedicated stored prompt-injection, leakage, unauthorized-action, mitigation/retest, and residual-risk evidence. S3-D1-01 owns Student Study Assistant behavior. S3-D1-03/S3-D2-03 and the release approver own later deployment/release work. These deferrals do not waive Phase 1 authorization, bounded context, safe output, or basic synthetic-summary checks.

## 9. Open evidence gates and review request

| Gate | Required evidence or decision | Milestone blocked |
| --- | --- | --- |
| Model/access | Project key provisioned without disclosure; key-visible exact model ID, context/output limits, and Developer 2 approval; verified isolated helpinus-dev target | A real inference and model-specific context budget |
| Shared-owner handoff | Developer 1 response to exact shared interface, files, errors, and tests | B1 shared edits |
| B3 test scope | Verified synthetic-only project and exact approved Firebase UIDs | B3 live button test |
| C resource values | Verified project-key request/token budget; approved per-user/aggregate daily limits, reset policy, and aggregate in-flight ceiling | C readiness claim |
| Release privacy/security | Provider handling and retention terms, minimization and participant notice/consent, successful D adversarial verification, separate release approval | Real conversations and real-user production release |

Developer 2 explicitly marked the external facts pending during grilling and approved this PRD with the clarifications recorded above. No value is inferred from example model names, Firebase aliases, or the mock. This approval confirms the behavior and gates above without marking missing evidence as satisfied. TDD drafting is authorized; Requirements-to-Tests and implementation remain separate gates.
