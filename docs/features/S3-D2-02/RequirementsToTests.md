# Requirements-to-Tests — S3-D2-02 Mentor Summary Prompt-Injection Defense

**Status:** Developer 2 approved; planned tests pending execution  
**Final-status pointer:** The status above describes this pre-execution plan; see §4 for recorded historical execution and current-source gaps.
**Draft date:** 2026-10-21 (Asia/Singapore)  
**Approval date:** 2026-10-21 (Asia/Singapore)  
**Approval reference:** Developer 2's reply “Approve reviewed package.”  
**Sources:** Approved [PRD](PRD.md) and [TDD](TDD.md); inherited S3-D2-01 tests.  
**Evidence classes:** **E** synthetic Auth/Firestore Emulator with mocked gateway; **G** fake-HTTP gateway/callable contract; **F** rendered frontend test with mocked callable; **R** reused S3-D2-01 regression; **H** review of results and limitations. No class denotes live-model inference.

## 1. Bounded adversarial cases

The seven cases below are planned as one table-driven test through the existing Mentor handler seam. Each uses a literal synthetic stored payload and a fixed mock brief. For every case, assert the trusted `system` instruction and actual sender-labelled, delimited `user` data; no request-supplied tool/action field; four-field accepted result; and unchanged before/after snapshots of the selected help request, conversation, and messages. Observe message-query paths through the existing Firestore test wrapper. PI-04 additionally compares against a second conversation's unique marker and asserts that its message path was never queried. The fixed mock brief is not evidence that SoCLaaS would write a safe summary.

| Test ID | Payload category and distinguishing assertion | Covers | Status |
| --- | --- | --- | --- |
| **PI-01** | Role spoofing: forged `SYSTEM`/`developer` text remains sender-labelled data. | FR-01, FR-02, FR-03; AC-01, AC-02, AC-04 | Planned **E** |
| **PI-02** | Instruction override: fixed task/format survives in captured request; no action field appears. | FR-02, FR-03; AC-01, AC-02, AC-04 | Planned **E** |
| **PI-03** | Hidden-instruction/credential request: no trusted application credential/config value or read tool is added by the server to the model request. Participant-authored strings are unfiltered data. Prompt-wording disclosure by a real model is unverified. | FR-02, FR-03, NFR-02; AC-01, AC-02, AC-05 | Planned **E** |
| **PI-04** | Unrelated-conversation request: only selected conversation messages reach the mock; second marker is absent. | FR-01, FR-03; AC-01, AC-02, AC-04 | Planned **E** |
| **PI-05** | Output-format change: fixed four-field instruction persists; malformed/extra-field mock result fails safely. | FR-02, FR-04; AC-01, AC-03 | Planned **E,R** |
| **PI-06** | Business-action request: no tool/action capability; business-state snapshots unchanged; code-path review records that no booking action is imported or invoked. | FR-03, FR-04; AC-01, AC-04 | Planned **E,G,H** |
| **PI-07** | Legitimate prompt-injection discussion: ordinary message remains selected data and receives a valid mock brief. | FR-01, FR-02, NFR-01; AC-01, AC-02 | Planned **E** |

## 2. Reused boundary evidence

| Evidence ID | Existing assertion to rerun or extend only if needed | Covers | Status |
| --- | --- | --- | --- |
| **B-01** | B3 fake-HTTP provider request has no tool/function fields; provider `tool_calls` result is rejected. | FR-03, FR-04; AC-02, AC-03 | Planned **G**; reuse existing gateway tests, add a focused assertion only if absent. |
| **B-02** | Mentor draft fields render as inert textareas, are editable but unsaved, and clear on account/conversation change. No send callable is invoked. | FR-04; AC-03, AC-04 | Planned **F,R**; reuse/extend existing frontend test. |
| **B-03** | Existing S3-D2-01 denial, selected-context bounds, malformed-output and no-action regressions remain passing. | FR-01, FR-04, NFR-01; AC-04 | Planned **R**; cite exact tests and run results. |
| **B-04** | Evidence note lists case results, concrete defects/fixes or no-code-change finding, model-dependent residual limitation, and remaining release gates. | FR-05, NFR-02, NFR-03; AC-05 | Planned **H**. |

## 3. Completion gate

PI-01–PI-07 and applicable B-01–B-03 must have actual passing results and environment/command evidence. Record any failure and retest without weakening assertions. B-04 must distinguish deterministic application boundaries from unverified live-model behavior. No mocked result is labeled real-model security signoff; no live SoCLaaS inference or deployment is planned. The reviewed package approval is recorded above; Developer 2's earlier execution message authorizes only the bounded local tests and documentation work. This matrix itself reports no test as run.

## 4. Final evidence disposition — 2026-10-22

The `Planned` labels above preserve the approved pre-execution plan. `workflow/handoffs/royden/S3-D2-02.md` records historical PI-01–PI-07 synthetic mocked execution, focused backend/frontend and gateway results, and independent reviews. It also records a later merge, a removed Mentor draft UI component test, and a successful action-only browser rerun without invoking the provider. Consequently B-02's editable-textarea claim is **not satisfied by final source** and its prior pass is not current UI evidence. B-01 and PI-01–PI-07 remain historical evidence for deterministic application boundaries; no new suite was run here. B-04 remains limited to mocked application behavior. The final Mentor UI uses read-only text; live-model resistance, real-data policy, and release approval remain unverified/open.
