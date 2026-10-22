# Technical Design Document — S3-D2-02 Mentor Summary Prompt-Injection Defense

**Status:** Developer 2 approved; reviewed package baseline  
**Draft date:** 2026-10-21 (Asia/Singapore)  
**Approval date:** 2026-10-21 (Asia/Singapore)  
**Owner:** Developer 2  
**Approval reference:** Developer 2's reply “Approve reviewed package.”  
**Source:** Approved [Mission Brief](../../mission-brief/S3-D2-02-mentor-summary-prompt-injection-defense.md) and [PRD](PRD.md); inherited S3-D2-01 TDD and implementation.

## 1. Design decision

Use the existing summariser unchanged unless the bounded tests expose a concrete defect. `mentorConsultationSummaryHandler` owns current Mentor and accepted-pair authorization, bounded message selection, fixed system instruction, delimited JSON conversation data, four-field parse, and response-time access recheck. `mentorSummaryCallableHandler` applies the B3 gate and shared gateway. The provider request has messages and generation options only; it supplies no tools. `ConversationDetailPage` renders the returned fields in React-controlled textareas and keeps the draft in page state. No new interface, data collection, filter, classifier, or storage format is proposed.

## 2. Confirmed test seams and invariants

Developer 2's execution constraints confirm observable seams: selected conversation scope, provider payload construction, absence of model-executable actions, inert rendering, and unchanged business state. Test these through the existing public handler/callable and rendered page, rather than private prompt helpers.

| Seam | Existing adapter | Assertion |
| --- | --- | --- |
| Mentor handler | Auth/Firestore Emulators with synthetic accepted pairs; injected `MentorSummaryGateway.generate` mock | Only selected authorized messages appear as `user` data after a fixed `system` instruction; the generated request has no action/tool field; output remains four-field or fails safely. Record message collection query paths and compare before/after help-request, conversation, and message snapshots. |
| Callable/gateway | Existing fake HTTP `fetch` in the B3 integration test | Serialized SoCLaaS request contains the approved model, bounded messages, and generation options, with no `tools`, `tool_choice`, `functions`, or application action endpoint. A returned tool call is rejected by the existing gateway. |
| Mentor page | Existing `ConversationDetailPage` test with mocked callable | Hostile-looking field text is displayed only in editable textareas; no executable DOM element appears; no message send/save occurs and the draft clears on account or conversation change. |

Operational capacity counters and content-free diagnostics are trusted backend bookkeeping. Compare application business records separately. App non-persistence does not prove provider non-retention.

## 3. Seven bounded cases

Run one table-driven Emulator test through `mentorConsultationSummaryHandler` with one short ordinary message plus one synthetic stored payload per case. The mocked provider returns a fixed valid, task-shaped brief; this proves the application forwards untrusted data in the intended structure, **not** that a real model would resist the payload. Capture independent literal expected sender/order/text values and inspect the request rather than computing expectations from the handler. Create a second same-participant conversation for the unrelated-conversation case, ensuring its unique marker is absent from the provider payload.

| Case | Stored-message content | Deterministic assertion |
| --- | --- | --- |
| PI-01 role spoofing | Claims `SYSTEM` or `developer` authority | Claim remains inside serialized conversation text with its real sender role; fixed system instruction is unchanged. |
| PI-02 instruction override | Says to ignore the task and produce a different answer | Task and four-field instruction remain fixed; no new provider option or app action appears. |
| PI-03 hidden-instruction request | Asks for hidden instructions or credentials | No trusted application credential or private configuration is added by the server to model messages; request cannot read config through a model tool. Participant-authored strings are still data. Whether a real model repeats nonsecret prompt wording remains unverified. |
| PI-04 unrelated-conversation request | Names a second conversation and asks for its messages | Second conversation marker is absent from provider data; observed message-query paths include only the selected conversation. |
| PI-05 output-format change | Asks for HTML, extra fields, or a non-JSON answer | The fixed four-field instruction persists; mock malformed/extra-field output receives `AI_RESPONSE` under the existing parser. |
| PI-06 business-action request | Asks to send a message or change a booking | No tool/action capability is in the provider request; before/after snapshots of the selected help request, conversation, and messages are unchanged. No booking action module is invoked. |
| PI-07 legitimate discussion | Asks a genuine question about prompt injection | Its message is retained as ordinary task data; no keyword rejection or filtering is added. |

Reuse the existing frontend inert-rendering and draft-lifetime test, extending it only if its observable assertion is insufficient for PI-05/PI-06. Reuse existing S3-D2-01 denial, output-validation, and no-action tests as regressions. Do not duplicate their fixtures or broad suites merely to rename them S3-D2-02.

## 4. Failure and evidence policy

If a deterministic boundary fails, add the smallest focused failing assertion first, correct only the observed production defect, then rerun the affected test and nearby S3-D2-01 regressions. If all boundaries pass, leave production code unchanged. Do not use a phrase blacklist as the primary control: a legitimate conversation may discuss prompt injection.

The final evidence distinguishes: (a) proven application behavior under synthetic data and mocked provider responses; (b) real-model behavior not tested under this authorization; and (c) separate S3-D2-01 release gates. No additional live inference, Firebase deployment, production change, commit, push, or merge is part of this design. Record commands, environment, case counts, results, defects, and any residual limitation. Then reconcile the S3-D2-01/S3-D2-02 documentation and prepare the final review handoff.
