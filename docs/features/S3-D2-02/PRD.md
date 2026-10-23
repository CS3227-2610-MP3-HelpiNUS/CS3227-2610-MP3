# Product Requirements Document — S3-D2-02 Mentor Summary Prompt-Injection Defense

**Status:** Developer 2 approved; reviewed package baseline  
**Draft date:** 2026-10-21 (Asia/Singapore)  
**Approval date:** 2026-10-21 (Asia/Singapore)  
**Owner:** Developer 2  
**Approval reference:** Developer 2's replies “Approve PRD” and “Approve reviewed package” (the latter approves reviewer clarifications).  
**Source of truth:** [Approved S3-D2-02 Mission Brief](../../mission-brief/S3-D2-02-mentor-summary-prompt-injection-defense.md), inheriting S3-D2-01's approved SDD. The Sprint 3 assignment is background reference only.

## 1. Purpose and scope

Demonstrate that instructions embedded in saved conversation messages cannot expand the Mentor summary application's authority. Preserve the existing Mentor request, authorized conversation selection, four-section editable draft, and safe failures. Use a small synthetic, mocked-provider test set. Fix only concrete defects those tests expose.

The four inherited guardrails are: stored text is task data; the model has no application write/update authority; only a validated four-section ephemeral draft reaches the Mentor; and adversarial behavior is verified at observable application boundaries. This feature introduces no new product flow, detection model, filtering framework, infrastructure, or live-provider requirement.

## 2. Requirements

| ID | Required observable behavior |
| --- | --- |
| **FR-01 — Selected context** | The backend sends the mocked provider only bounded messages from the one currently authorized accepted conversation. A stored instruction or direct request parameter cannot cause another conversation to be read, included, or summarised. Existing S3-D2-01 authorization and integrity behavior remains in force. |
| **FR-02 — Trusted task** | Fixed server instructions retain the summarisation task and four-field contract. Saved text is identified as untrusted conversation data, including when it impersonates a higher-priority role or asks to override instructions. Legitimate discussion *about* prompt injection remains summarizable content. |
| **FR-03 — No model action** | The inference request gives the model no application tools, trusted application credentials, privileged Firestore access handles, or authority to call business operations. A participant-authored message can contain a path- or credential-like string; this feature does not filter it. Generated text cannot send a message, read another conversation, or change booking, help-request, appointment, conversation, or message records. Trusted backend capacity/audit metadata is permitted but must not derive an action from generated content. |
| **FR-04 — Brief boundary** | The application accepts and returns only the existing validated `summary`, `unresolvedQuestions`, `teachingApproaches`, and `limitations` plain-text fields. Invalid output yields the existing safe failure. Valid fields render as inert editable text, are not automatically sent, and are not persisted by the application; edits remain in the current page session. |
| **FR-05 — Bounded verification** | Automated synthetic tests with a mocked SoCLaaS provider cover role spoofing, instruction override, hidden-instruction disclosure requests, unrelated-conversation disclosure requests, output-format change requests, business-action requests, and a legitimate discussion of prompt injection. Tests inspect selected context and provider payload, action availability, rendering, and persistent business state. Results, defects, fixes, and retests are recorded. |
| **NFR-01 — Existing design** | Reuse S3-D2-01 authorization, prompt construction, parser, and frontend rendering. Do not add defenses or refactor solely because a hypothetical attack exists when the bounded tests pass. |
| **NFR-02 — Evidence honesty** | Report deterministic application guarantees separately from model behavior. Mocked tests do not establish that the live SoCLaaS model will always ignore injected instructions or produce semantically faithful prose. Unverified real-model behavior is a residual limitation. |
| **NFR-03 — Operational limits** | No additional live SoCLaaS inference, Firebase deployment, production change, commit, push, or merge is part of this feature without separate authorization. Application non-persistence makes no claim about provider retention; the existing real-data release decision remains separate. |

## 3. Acceptance criteria

| ID | Evidence required |
| --- | --- |
| **AC-01** | All seven synthetic case categories execute through the appropriate existing handler seam with mocked provider behavior; callable/gateway and frontend boundaries are checked by focused existing or extended tests. Each case has recorded pass/fail evidence. |
| **AC-02** | Captured provider requests contain the fixed trusted task and only the selected authorized conversation data; no model-executable tool/action definition or unrelated private data is supplied. |
| **AC-03** | Provider outputs outside the four-field contract fail safely; accepted hostile-looking text renders inertly, and the draft is neither automatically sent nor saved. |
| **AC-04** | Business records are unchanged by generated content or stored instructions; any backend operational metadata is identified separately. Existing affected S3-D2-01 regressions pass. |
| **AC-05** | Evidence names any concrete defect and retest, or states that no code change was needed. The final report distinguishes mocked application guarantees from unverified live-model resistance and lists remaining release requirements without claiming broader security signoff. |

## 4. Dependencies and handoff

The S3-D2-01 summary path and its approved SDD supply the authorization, data bounds, output contract, and UI behavior. S3-D2-02 verifies and, only where a test exposes a defect, minimally corrects that path. The technical design must select existing test seams and provide traceability for FR-01–FR-05, NFR-01–NFR-03, and AC-01–AC-05. A material change to an inherited S3-D2-01 product decision or shared contract returns to the existing owner process. Completion evidence should be consolidated with S3-D2-01 for final review readiness.

## 5. Final requirement disposition — 2026-10-22

The final source retains server-selected context, fixed trusted instructions, no provider tools or application actions, four-field validation, and inert text rendering. FR-04's editable-field clause and the inherited editing language in §1 are **unimplemented in final `ConversationPages.tsx`**, which renders read-only paragraphs. The brief remains frontend-only, without an automatic message send or brief persistence. FR-05's seven mocked synthetic categories have historical recorded passes in `workflow/handoffs/royden/S3-D2-02.md`; after a later merge, the Mentor draft UI component test was removed. Thus AC-03's current editing assertion lacks a present implementation or current test, while the deterministic backend boundaries retain their historical evidence. No live-model prompt-injection conclusion or real-user release approval follows from those mocked results. This note records deviation without changing the original approved requirement.
