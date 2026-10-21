# Mission Brief — S3-D2-02 Mentor Summary Prompt-Injection Defense

**Status:** Developer 2 approved; reviewed package baseline  
**Draft date:** 2026-10-21 (Asia/Singapore)  
**Approval date:** 2026-10-21 (Asia/Singapore)  
**Owner:** Developer 2  
**Scope authority:** Developer 2's direction for this feature and the approved S3-D2-01 SDD package. The Sprint 3 assignment is background reference, not the source of truth for this brief.  
**Approval reference:** Developer 2's 2026-10-21 reply headed “S3-D2-02 — Mission Brief Approval and Scope Clarification” approved the original mission; the later reply “Approve reviewed package” approved the reviewer-clarified mission, PRD, TDD, and Requirements-to-Tests. Its execution constraints below supersede any broader testing suggestion in the original draft.  
**Planning boundary:** This brief defines the mission only. PRD, TDD, Requirements-to-Tests, implementation, deployment, and release need their own applicable approvals.

## 1. Mission

Defend the existing Mentor conversation summariser against instructions planted in Student or Mentor messages. A Mentor still deliberately requests a brief for one authorized, accepted conversation. The application requests, accepts, and returns only the existing four plain-text sections: `summary`, `unresolvedQuestions`, `teachingApproaches`, and `limitations`. The Mentor reviews and may edit the draft in the current page session; neither the generated draft nor those edits are saved by the application, sent as a message, or used to update application business state.

This mission hardens the **stored-message-to-summary** boundary. It does not add a general-purpose prompt-injection detector, an AI agent, new product actions, or a new summary format.

## 2. Inherited S3-D2-01 baseline

The S3-D2-01 SDD already requires server-selected messages from the authorized conversation, fixed trusted instructions, bounded context, a four-field validated response, inert text rendering, and Mentor review. It also requires that the model receive no privileged application-action tools. The current implementation places fixed instructions in a system message and serializes selected conversation messages as delimited untrusted data. The generated brief is held in frontend page state. Backend capacity bookkeeping and content-free diagnostic logging are operational records, not storage of the brief.

S3-D2-02 must verify these inherited boundaries at the implementation revision it actually tests. It must not infer security from a prompt's wording or from the four-field JSON shape alone: malicious text could still influence the *content* of a structurally valid brief. [OWASP's prompt-injection guidance](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) treats instruction/data separation as useful but not a complete enforcement boundary.

## 3. Required outcome and minimal guardrails

1. **Untrusted conversation text stays task data.** Fixed server instructions define the summarisation task and four-section format. Stored messages, including text that claims to be a system/developer message or asks the model to ignore instructions, cannot change the server-controlled task configuration, context-selection policy, or output contract. The brief may describe an instruction-like message when it is relevant conversation content. Whether a real model obeys it in the prose remains unverified without an authorized real-model check.
2. **The model has no application authority.** The inference request exposes no tools, privileged Firestore access handles, trusted application credentials, or action endpoints. A participant may still type a path- or credential-like string into a saved message; this mission does not filter such text. Only trusted backend code selects and reads the authorized bounded conversation. Model output cannot cause a message send, booking/request/appointment change, additional conversation read, or any other application write. Existing backend quota and audit metadata may still be written by trusted code; their values must not be controlled by generated text.
3. **Only a private, ephemeral four-section draft is returned.** The backend accepts only the existing validated four plain-text fields within the existing bounds and returns safe errors for invalid output. The frontend renders fields as inert editable text and does not persist the generated content or Mentor edits. No automatic send or save path is introduced. Application non-persistence does not establish the provider's data-retention policy; that remains a separate real-data release decision.
4. **Targeted adversarial verification.** Use a small automated set of synthetic stored messages and a mocked SoCLaaS provider to cover role spoofing, instruction override, hidden-instruction disclosure, unrelated-conversation disclosure, output-format change, and business-action requests, plus an ordinary conversation that discusses prompt injection. Assert authorized context selection, provider payload, absence of model-executable actions, inert rendering, and unchanged application business records through the existing test seams. Record observed failures, the smallest effective mitigation, and retest results. A mock pass establishes deterministic application boundaries only; unverified real-model resistance remains a residual limitation.

## 4. Acceptance boundary

The mission is complete when automated adversarial cases establish the deterministic application boundaries: only the authorized conversation reaches the mocked provider, no model-executable action path exists, invalid output is rejected, valid fields render inertly, the draft is ephemeral, and business records remain unchanged. Mocked responses cannot establish that a real model will ignore every stored instruction or resist semantic contamination. Record that model-dependent uncertainty as a residual limitation rather than claiming comprehensive real-model security signoff.

The tests must assert backend calls and persistent state where relevant, not only that the AI's wording sounds safe. Any change to the shared gateway or public callable contract requires the existing shared-owner process. Real-user release remains subject to the separate release and real-data handling decisions already recorded in S3-D2-01.

## 5. Out of scope

Independent penetration campaigns for direct callable abuse, quota exhaustion, generic malformed output, or unrelated authorization defects are outside this mission; S3-D2-01 already owns their baseline controls and tests. This mission reuses those tests where an injected message could exploit a boundary. There is no keyword blacklist as a required primary defense, separate guardrail model, complex filtering framework, new infrastructure, broad semantic scoring program, persistent AI draft history, or autonomous AI action workflow. If existing protections pass, no code change is required solely to add defenses. No additional live SoCLaaS inference, Firebase deployment, production change, commit, push, or merge is authorized by this brief.

## 6. Next planning handoff

The PRD should turn the four guardrails into observable requirements and the seven bounded cases. The TDD should identify existing prompt, parser, UI, and test seams without repeating completed architecture. Requirements-to-Tests should trace each case and inherited regression to mock and emulator evidence, with unverified real-model behavior identified as a limitation. After verification, reconcile S3-D2-01/S3-D2-02 documentation and consolidate evidence for final review. No S3-D2-01 artifact is changed by this brief.
