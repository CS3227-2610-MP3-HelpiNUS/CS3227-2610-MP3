# Grilling Decisions — S3-D2-01 Shared SoCLaaS Gateway and Mentor Conversation Summary

**Artifact status:** Developer 2 owner-approved for PRD drafting; exact-byte Git publication and complete SDD package approval remain pending.  
**Decision status:** Developer 2 selected the policies below in the interactive grilling round on 2026-10-20 (Asia/Singapore) and approved this consolidated record in the subsequent “approve grilling decisions” reply. External facts and shared-owner responses listed under Open gates remain unresolved.  
**Owner:** Developer 2  
**Source:** [S3-D2-01 Mission Brief](../../mission-brief/S3-D2-01-shared-soclaas-mentor-summary.md), approved as the planning baseline with the C/D clarification on 2026-10-20.  
**Approval reference:** Developer 2's “approve grilling decisions” reply in this conversation approved the exact pre-header draft with SHA-256 `09F0A0C7B82282B65197FBDBBFCF4983D16FFC4E9F0C758C262CD2860E090B65`. The approved bytes are preserved in `Dev2-local-SDD-backups/2026-10-20-S3-D2-01-grilling-owner-approved-preheader/`. Only approval metadata, the now-confirmed GD-06 mechanism, and gate wording were updated afterward. No durable reply identifier is claimed.  
**Approval scope:** The selected policies in this record, including the GD-06 Firestore reservation default. This approval permits PRD drafting; it does not approve that PRD, a TDD, Requirements-to-Tests artifact, shared-file edit, SoCLaaS call, deployment, commit, push, or release.  
**Implementation authorization:** Not granted.

## Authority and inspected evidence

- The Mission Brief fixes the **A → B1 → B2 → B3 → C → D → E** sequence. **C establishes production-path technical readiness; production release to real users requires successful D adversarial security verification.** A and B use synthetic data; B3 is restricted to designated test identities in an isolated development/staging Firebase project.
- The workspace-parent SoC DocHub access, API, and quickstart PDFs document bearer-key access at `https://soclaas-api.comp.nus.edu.sg/v1`, `GET /models`, and plain `POST /chat/completions`. Example model names are not project approval. No key entitlement, model ID, provider budget, or permission to transmit real conversations was verified. No SoCLaaS call was made.
- `.firebaserc` names `helpinus-dev` and `helpinus-prod`; it does not prove that the dev project is isolated or identify approved Firebase UIDs. `firebase.json` uses Node 22 Functions. No SoCLaaS adapter or secret binding exists in the inspected baseline.
- `src/shared/src/callables.ts` has placeholder Student `{requestId, prompt} → {response}` and Mentor `{requestId, appointmentId, notes} → {summary}` contracts. `src/functions/src/index.ts` returns `unavailable` for both AI callables. Accepted F01/F02 conversations use the help-request ID as the conversation ID; their messages live at `conversations/{id}/messages` and existing message operations fail on malformed records.
- `workflow/agents/README.md` assigns shared architecture and shared-file approval to Developer 1. Developer 2 must present the exact interface, files, reason, and tests before changing that seam. This record is a local SDD draft; an approved snapshot requires the workflow's separate review, hash, ledger, and publication steps.

## Selected decisions

### GD-01 — Phase 1 readiness and release gate

- **Issue:** Earlier brief wording could imply that completing C permits real-user access. That would bypass D's stored prompt-injection and leakage verification.
- **Decision:** Keep A → B1 → B2 → B3 → C → D → E. C completes S3-D2-01 production-path technical readiness. Release to real users waits for successful D adversarial security verification and separate release approval.
- **Trade-off:** The technically ready path remains restricted while D runs; this preserves the approved security gate.
- **Evidence/status:** Explicit Developer 2 clarification and planning-baseline approval in this conversation; selected.

### GD-02 — Project credential and secret custody

- **Issue:** The guides require a bearer key, while the repository has no SoCLaaS credential mechanism. A personal key is quick but fragile for handoff and rotation.
- **Decision:** Use a project key held in Firebase-managed server-side secrets, with separate dev/prod values and no client or Git exposure. Any authorized team member may generate the project key; the actual operator must be recorded when setup occurs. No key is to be pasted into this artifact.
- **Trade-off:** Secret binding needs project access and setup; it avoids a separate local-only credential path and developer-key dependency.
- **Evidence/status:** Q1, Q5, and the clarified ownership answer; selected. Actual key issuance and access remain an A gate.

### GD-03 — Model entitlement and first connectivity proof

- **Issue:** Example model IDs do not establish what the project key may use. An uncontrolled first call risks cost and credential exposure.
- **Decision:** First inspect the key-visible `/models` catalog, obtain explicit Developer 2 approval of one exact returned model ID, and verify `helpinus-dev` is an approved isolated target. Then use a restricted server-side harness from the intended Functions runtime, with no public callable, synthetic input, basic bounds and timeout, and **one** chat-completion attempt before an explicit reset. Any authorized team member may run it; record who did so and the redacted result.
- **Trade-off:** Explicit approval slows the first inference but makes model limits and test provenance reviewable.
- **Evidence/status:** Q2, Q3, Q26; policy selected. Model ID, key entitlement, project verification, and runner evidence are open; no call is authorized by this record.

### GD-04 — Shared gateway seam and Developer 1 coordination

- **Issue:** Student and Mentor features need one provider connection without sharing prompts or authorization logic. Shared files are Developer 1-owned architecture.
- **Decision:** Use one mockable, task-neutral Functions gateway that accepts bounded trusted chat input/options and returns provider text, usage, and normalized errors. Student and Mentor handlers own their prompts, authorization, and domain output parsing. Preserve the Student public callable unless Developer 1 separately approves a change. Developer 2 may implement the gateway only after an exact shared-contract handoff and Developer 1 approval **before B1**.
- **Trade-off:** The gateway exposes a small generic provider shape rather than role-specific types; each handler must validate its own output. Early owner coordination adds a checkpoint but protects Student integration.
- **Evidence/status:** Q6, Q7, Q9 and repository ownership convention; selected. Developer 1's response is open.

### GD-05 — Mentor public request

- **Issue:** The placeholder `appointmentId` and client `notes` allow a client-supplied content path that does not represent the authorized conversation workflow. A client operation UUID would require durable retry semantics to justify an idempotency claim.
- **Decision:** Change only the Mentor callable request to `{helpRequestId}`. The server uses that identifier to re-read the accepted request, exact conversation, and bounded messages. The client sends no message bodies, prompt instructions, arbitrary paths, or operation UUID. Disable duplicate clicks while one request is pending; no idempotency promise is made for B.
- **Trade-off:** A lost reply may require a new attempt and quota charge; the API and B3 path remain small. Revisit retry reconciliation only if later evidence requires it.
- **Evidence/status:** Q8; selected. Exact shared schema edit awaits Developer 1 approval.

### GD-06 — B3 test audience and resource boundary

- **Issue:** A deployed callable is directly invocable even if the button is hidden. A per-process counter cannot enforce a test-wide cap across instances or redeploys.
- **Decision:** B3 uses only synthetic accepted conversations in a verified isolated `helpinus-dev` project. The backend checks exact designated Firebase UIDs in addition to current Mentor role and conversation authorization; all other callers are denied. Limit the deployed test scope to **10 attempted provider calls total** and **one in-flight provider call**, with explicit operator reset. The practical compliant default is a small backend-only Firestore transaction counter/reservation, consistent with existing authoritative transaction use.
- **Trade-off:** Exact UIDs and durable state require setup; they prevent accidental general-user calls and cap test exposure. Developer 2 answered “whichever is easier to implement” for the counter mechanism; approval of this record confirms the Firestore reservation default as the practical compliant choice.
- **Evidence/status:** Q10, Q11, Q21 and consolidated-record approval; approved. Project isolation and the UID list remain open before B3.

### GD-07 — Real-conversation transmission

- **Issue:** The API guides do not establish retention, participant notice/consent, or permission to send actual Student–Mentor messages to SoCLaaS.
- **Decision:** A–C verification uses synthetic data. Defer real-conversation transmission to a separate release-gate decision covering provider terms, minimization, participant notice/consent, and successful D verification. C completion alone does not enable real users.
- **Trade-off:** Real-user validation and launch wait; technical readiness can be proven without exposing private conversations.
- **Evidence/status:** Q12 and the explicit C/D clarification; deferral selected. The release decision remains open.

### GD-08 — Selection, history, and context bound

- **Issue:** The selected conversation may be empty or longer than the model context. An interval picker adds scope and UI decisions; silently dropping early messages could mislead the Mentor.
- **Decision:** One click targets the whole selected accepted conversation when it fits. If it exceeds the bound, use the most recent complete messages in chronological order and show a visible partial-history notice. The provisional ceiling is **30 messages and 12,000 total message characters**, lowered if the approved model's verified context requires it. An empty conversation produces a safe empty state without a provider call.
- **Trade-off:** A recent slice may omit earlier decisions, but the notice makes that limitation visible and keeps the feature usable.
- **Evidence/status:** Q13–Q15, Q22; selected. The model-specific safe limit remains open until the model is approved.

### GD-09 — Message integrity and in-flight revocation

- **Issue:** Admin SDK reads bypass Firestore Rules. A malformed legacy/imported/admin-written message or a role change during inference could make the result unsafe to return.
- **Decision:** Validate retrieved records and sender membership against the accepted Student–Mentor pair. If any selected record is corrupt or claims another sender, stop before SoCLaaS and show a safe support-needed state. Recheck current Mentor eligibility and accepted-pair authorization immediately before returning a generated brief; discard the result if access was revoked.
- **Trade-off:** Integrity failure or late revocation can discard a paid result; it prevents a misleading brief or disclosure after access loss.
- **Evidence/status:** Q16 clarification, Q17; selected.

### GD-10 — Structured brief, editing, and initial quality check

- **Issue:** The Mentor needs a useful, reviewable consultation draft, while free-form output is difficult to validate and persistent edits would add a new data product.
- **Decision:** Require JSON with four plain-text fields: `summary`, `unresolvedQuestions`, `teachingApproaches`, and `limitations`. Validate required fields, type, and a combined **8,000-character** maximum before the callable returns safe text. Missing context must be stated rather than invented. The Mentor edits the four fields in the current page session; clear the draft on account or conversation change. No automatic message or business-state write occurs.
- **Trade-off:** JSON can fail parsing and session edits disappear on navigation; the error is explicit and no new persistence/access policy is needed.
- **Evidence/status:** Q18–Q20; selected. Phase 1 checks structure, bounds, and a few synthetic summaries for obvious inventions/omissions; no elaborate scoring system is a gate.

### GD-11 — C quotas and concurrency

- **Issue:** SoCLaaS key-level limits do not protect individual users or coordinate Student and Mentor features across Function instances. Exact numeric thresholds cannot be justified until key/model limits are known.
- **Decision:** Use one durable shared aggregate request budget across both AI handlers, plus per-user daily limits. Allow at most one in-flight AI request per user; approve an aggregate in-flight ceiling and numeric daily thresholds from the verified provider budget before C can pass. Use backend reservations so concurrent instances cannot oversubscribe.
- **Trade-off:** A shared pool is simpler and protects the common key, though one feature can consume capacity needed by the other. Exact allocation can be reconsidered with usage evidence.
- **Evidence/status:** Q23, Q27; policy selected. Numeric limits and aggregate concurrency remain open.

### GD-12 — Audit and bounded retry

- **Issue:** The scaffold AI audit schema requires `promptHash`, which could correlate private conversation content, and ambiguous network failures can make an automatic retry duplicate cost.
- **Decision:** Record backend-only actor ID, feature, time, outcome/error class, model ID, and usage/attempt counts; retain for **30 days**. Do not record prompts, message bodies, outputs, secrets, or prompt hashes; amend the scaffold through shared-file approval. Permit at most one automatic retry only after a clearly rejected/rate-limited request when `Retry-After`, total deadline, and remaining quota allow. Count the attempt; do not auto-retry an ambiguously sent request.
- **Trade-off:** Minimal metadata limits forensic detail, and conservative retries may expose more transient failures to users. It avoids routine private-content retention and uncertain duplicate generation.
- **Evidence/status:** Q24, Q25; selected. Exact error mapping and TTL implementation belong in the later technical design after approval.

## Open gates and dependency order

| Gate | Missing evidence or approval | Blocks | Priority |
| --- | --- | --- | --- |
| A access | Actual project key provisioned in Firebase secret; exact key-visible model ID, context/output limits, and Developer 2 approval; verified isolated `helpinus-dev` target | First inference smoke test and model-specific limits | Immediate |
| Shared B1 | Exact shared-file/interface/test request and Developer 1 response | Shared gateway or public contract edits | Immediate before B1 |
| B3 control | Verified synthetic-only project and exact test UIDs | Deployed real-provider Mentor button test | Before B3 |
| C budgets | Key request/token budget, approved per-user and aggregate daily thresholds, aggregate in-flight ceiling | C production-path technical-readiness claim | Before C |
| Release | Provider retention/handling terms, minimization and participant notice/consent decision, successful D adversarial security evidence, separate release approval | Real-conversation transmission and real-user production release | Deferred release gate |

Developer 2 answered that the external facts are **pending**. Do not infer a model ID, UIDs, budget, or project isolation from `.firebaserc` or the guide examples. The decision frontier reopens when those facts arrive. Developer 2 subsequently authorized a PRD draft for approval with these gates visible; that request does not approve the PRD or resolve the gates. No TDD, Requirements-to-Tests, code, SoCLaaS call, secret setup, deployment, commit, or push is authorized by this record.
