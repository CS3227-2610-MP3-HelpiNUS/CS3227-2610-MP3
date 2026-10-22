# Requirements-to-Tests — S3-D2-01 Shared SoCLaaS Gateway and Mentor Conversation Summary

**Status:** Developer 2-approved implementation baseline with the two refinements below; execution tracked in the feature ledger  
**Draft date:** 2026-10-20 (Asia/Singapore)  
**Feature owner / workstream:** Developer 2 / Sprint 3 S3-D2-01  
**Sources:** [approved Mission Brief](../../mission-brief/S3-D2-01-shared-soclaas-mentor-summary.md), [approved Grilling Decisions](GrillingDecisions.md), [approved PRD](PRD.md), [approved TDD](TDD.md), workspace-parent Sprint 3 MP3 requirements, and repository testing conventions in `AGENTS.md` and `workflow/agents/README.md`.  
**Scope:** Planned Phase 1 verification for A, B1, B2, B3, and C. Developer 2 separately authorized local Milestone A implementation. Real SoCLaaS inference, secret setup, deployment, commit, push, PR, and release require separate authorization.

## 1. Evidence contract and public seams

Each `S3-D2-01-TC-nnn` is a planned behavior check. All start **Planned / not run**. Later execution records the command or manual procedure, environment/project, synthetic fixture, actual outcome, redacted evidence path, and `PASS`, `FAIL`, `PARTIAL`, `BLOCKED`, or `NOT RUN` in the feature ledger. `PASS` requires every assertion and evidence class in the row; a deterministic mock never substitutes for a required real-provider or deployed-project check. `BLOCKED` names a concrete unmet gate, not a failed assertion. This table remains a plan; current execution statuses are in the feature ledger.

Evidence classes: **U** unit/contract test at an exported gateway or typed callable seam; **I** handler integration with real repository modules and synthetic records; **E** Firebase Auth/Functions/Firestore Emulator, actual Admin reads and durable transactions; **F** frontend service/page test or browser UI verification; **P** controlled real SoCLaaS call with redacted evidence; **S** baseline security assertion (negative access, data exposure, safe rendering, or no application action); **H** human inspection of controlled synthetic output or delivery evidence. A class can appear with another class on one case. `P` is required only at A and B3; all other provider behavior uses a deterministic adapter. Actual B3 project/UID evidence remains a separate gate even if an Emulator test passes.

Approved seams: typed `mentorConsultationSummary({helpRequestId})` and its safe response/errors; shared metered gateway `generate` with real or deterministic HTTP adapter; durable capacity admission as observed through allowed/denied gateway attempts using Emulator Firestore; the existing `HelpiNUSServices.callables.invoke` and Mentor conversation page. Student integration is checked through Developer 1's real handler at the joint gate. Tests may inspect captured outbound synthetic provider requests, safe logs, Firestore budget/audit records, and before/after business records as **evidence**, but do not call private prompt builders, bypass the gateway to test quota internals, or mock authorization helpers. Use fixed synthetic `mentorA`, `mentorB`, `studentA`, `studentB`, two distinct accepted requests for the same pair, current and revoked Auth/user variants, bounded messages, and a controlled clock only for leases/windows. Use non-`@example.test` identities for unverified-email denial because the existing Functions Emulator explicitly exempts synthetic `@example.test` users; refresh Auth claims where needed. No real conversation or credential enters fixtures or snapshots.

Use the existing Vitest shared/Functions/frontend suites, Functions/Auth/Firestore integration Emulator, Rules Emulator for backend-only path denial, and `npm run verify:app` for the real UI journey when implemented. Focused lint/type/unit checks precede `npm run check` on cross-workspace handoff. Node 22 and the configured project are recorded. Tests use explicit barriers or deferred responses for races and revocation; timing sleeps are not evidence. Implement vertically, one failing behavior test at an approved seam followed by the minimum implementation; this table is a coverage plan, not an instruction to bulk-write tests.

## 2. Planned cases

### A — minimal restricted connectivity

| ID / status | Setup and trigger | Required observable outcome | Evidence |
| --- | --- | --- | --- |
| **S3-D2-01-TC-001** · Planned | Exercise the selected private server-side A path with a fake HTTP adapter: missing/foreign origin, absent secret or approved model, unsafe redirect, unverified target, and a consumed attempt marker. Try a second attempt after an uncertain first result. | Invalid preflight makes **zero** inference requests. The first valid attempt consumes the marker before dispatch; crash/uncertainty cannot authorize a second until an explicit recorded reset. No Firebase callable or general-user invocation path is exposed. The chosen mechanism adds no independent service/framework solely for A. | **U,S,H**; outbound-call count, marker state and private-entry inspection. Gate G-01 supplies the actual project/model/secret decisions. |
| **S3-D2-01-TC-002** · Planned | Authorized operator in the approved isolated target uses the key-visible catalog, obtains Developer 2 approval of its exact model ID, then makes at most one small synthetic inference attempt through the private Node 22 server path. | A compatible completion proves controlled real connectivity. Redacted evidence identifies operator, environment, approved model, timestamp and one-attempt count; a safe rejection/timeout is recorded but leaves A incomplete and requires explicit reset before another attempt. No key, prompt body, or raw provider body appears in evidence, browser, Git, or routine logs. A mock or example model name cannot pass. | **P,S,H**; catalog decision and controlled request record. Gate G-01 required. |

### B1 — reusable gateway and shared contract

| ID / status | Setup and trigger | Required observable outcome | Evidence |
| --- | --- | --- | --- |
| **S3-D2-01-TC-003** · Planned | Student-shaped and Mentor-shaped trusted consumers invoke the public gateway with a deterministic provider adapter: valid text/optional usage, delayed response, 429, timeout, 5xx, malformed/oversized response, unsafe redirect and missing config. Compare the real HTTP adapter's normalized response to the mock's same public result classes. | Both consumers receive the same success/usage shape and safe error categories without importing each other's modules; only the approved HTTPS origin/model is requested, redirects are rejected, input/output/deadline bounds hold, and raw provider body/secret never reaches caller or logs. No role prompt or conversation lookup lives in the gateway. | **U,I,S**; literal response/error assertions and captured synthetic HTTP requests. G-02 is shared-owner approval. |
| **S3-D2-01-TC-004** · Planned | Validate shared callable schemas and exports with exact accepted and hostile inputs. Run existing Student contract tests alongside Mentor `{helpRequestId}` and four-field output contract. Inspect Developer 1's recorded exact shared-file/interface/test response before edits. | Student `{requestId,prompt} → {response}` stays compatible; Mentor rejects `requestId`, `appointmentId`, `notes`, transcript, prompt, credential, arbitrary path and extra keys. The shared edit occurs only after recorded approval; rejection leads to revision. This check does not claim Developer 1's Student handler is implemented. | **U,H,S**; contract suite and owner response. Gate G-02. |

### B2 — authorized, bounded Mentor request

| ID / status | Setup and trigger | Required observable outcome | Evidence |
| --- | --- | --- | --- |
| **S3-D2-01-TC-005** · Planned | Invoke the Mentor callable as signed-out, Student, inactive/wrong-role, disabled, unverified and stale-email actors; include direct callable invocation with a guessed ID. | Each ineligible actor receives safe denial before **any message query or provider call**. No foreign content or existence-sensitive detail appears in response/log; help request, conversation and messages remain unchanged. | **I,E,S**; Auth/user matrix, query/provider call observations and snapshots. |
| **S3-D2-01-TC-006** · Planned | Eligible `mentorA` invokes own accepted request, `mentorB` invokes it, then vary parent missing/pending/rejected, wrong parent ID, missing/mismatched same-ID conversation, swapped pair and two same-participant requests. | Only the addressed Mentor and exact accepted request/conversation pair reach that one request's messages; all foreign/inconsistent cases deny **before message read or provider call** with safe indistinguishable access wording. Two accepted requests remain isolated despite identical participants. | **I,E,S**; bounded path/query observations, safe errors and unchanged records. |
| **S3-D2-01-TC-007** · Planned | Hold a deterministic provider response after initial authorization, then revoke Mentor role/Auth validity or accepted-pair eligibility before releasing it. | Response-time recheck discards generated text and returns access loss; no private brief reaches caller. Initial provider attempt may have been charged and audit/cap state remains truthful. | **I,E,S**; deferred reply, current Auth/parent snapshots and absence of brief. |
| **S3-D2-01-TC-008** · Planned | After valid authorization, seed 0, 1, 30 and 31 messages; just below/at/above 12,000 body characters; equal timestamps with distinct IDs; and a lower verified model context allowance. Use distinct literal message markers. | Zero messages yields `EMPTY_HISTORY` and no provider call. In other cases the captured outbound request contains only most recent **complete** messages from the selected conversation, chronologically with ID tie break, never more than 30/12,000 or the lower model-safe bound. Whole history yields `partialHistory=false`; omitted earlier rows yield `true`. No client body expands scope. | **I,E,U**; literal ordered outbound markers, query limit and response notice. G-01 supplies verified model allowance for the model-specific variant. |
| **S3-D2-01-TC-009** · Planned | Put a malformed selected message, unexpected sender, wrong stored fields/timestamp, or invalid body in the selected walk, with a healthy nearby case. | Each selected bad row yields `SUPPORT_NEEDED` before provider invocation; no silent omission of that row or leakage. Healthy valid rows still produce a bounded request. The unused extra sentinel row only signals truncation. | **I,E,S**; zero provider calls for bad cases and exact captured healthy request. |
| **S3-D2-01-TC-010** · Planned | Capture the trusted request for synthetic ordinary, sparse, and instruction-like stored text; return literal bare JSON, explicit “none identified” fields, fenced/commented text, missing/extra/wrong-type/empty fields, 8,000/8,001 total characters and oversized provider bytes. | Trusted instruction asks for **bare four-field JSON**, grounding and uncertainty; stored messages remain delimited untrusted data and cannot change selected Firestore scope or grant tools. Valid explicit-none JSON returns four strings; malformed/oversized variants yield `AI_RESPONSE` with no raw text shown as a brief. No provider JSON-enforcement option is assumed; enable it only after compatible-model evidence. Semantic truth is reserved for TC-019. | **U,I,S**; captured synthetic request and independent literal output/error assertions. |

### B3 — early real-provider Mentor happy path

| ID / status | Setup and trigger | Required observable outcome | Evidence |
| --- | --- | --- | --- |
| **S3-D2-01-TC-011** · Planned | In Emulator, try exact allowlisted UID and nondesignated UID by direct callable; race two instances at attempt 10, hold one call in flight, reconstruct handler state as after redeploy, and exercise release/crash/lease recovery. Also invoke the actual deployed development/staging callable as a non-allowlisted test identity. | Nondesignated UID is denied before message read/provider call, including on the deployed callable. Across instances/restarts at most 10 attempted provider calls are admitted; attempt 11 and a concurrent second in-flight call are denied before HTTP. Failure/crash cannot reset count; stale lease reclaims only after the configured hard runtime and deadline ordering. | **E,I,S,H**; transactional state and provider-call counts plus deployed-callable denial evidence showing no message retrieval or provider invocation. Emulator-only denial does not satisfy the deployment restriction. G-03 is actual isolated project and exact UID approval. |
| **S3-D2-01-TC-012** · Planned | In the verified isolated synthetic-only project, designated `mentorA` opens a short accepted synthetic conversation and clicks Summarise Conversation; use the deployed Firebase callable and real SoCLaaS once within the approved cap. | Button → Auth/pair check → selected synthetic messages → real approved model → parsed four-field brief → editable Mentor view is observed. The draft renders as text; no provider credential or raw prompt reaches browser. Record redacted model/environment/attempt result. Truncation notice is covered with a deterministic fixture in TC-013; a mock-only path cannot pass this real path. | **P,I,F,S,H**; controlled deployed end-to-end trace and browser observation. G-01/G-03 required. |
| **S3-D2-01-TC-013** · Planned | Use the Mentor page with a deterministic callable fixture: mount/realtime message arrival, click once/twice while pending, edit every returned field, switch request/account before held reply resolves, navigate away, and trigger loading/empty/partial/denied/error states. Include keyboard and narrow viewport. | No automatic AI call on mount/message arrival; one deliberate call targets open `helpRequestId`, pending button prevents duplicate click, and editable AI draft stays in page state. Late old-context reply cannot repopulate state. Loading, empty, partial, success, access loss, capacity and error feedback are distinct and accessible; chat remains usable. No draft storage or message send occurs. | **F,S**; call sequence, DOM/text/focus observations and state cleanup. Browser journey supplements component checks after implementation. |
| **S3-D2-01-TC-014** · Planned | Through the gateway/callable seams, force missing config, timeout, 429 with/without admissible `Retry-After`, 5xx, interrupted sent request, malformed provider result and budget exhaustion; keep a live conversation page. | Client receives only safe mapped categories; no secret, private prompt, raw body or false successful brief. Failed generation leaves conversation and original chat input usable. At C, at most one retry occurs only after an explicit 429, within total deadline and after another charged admission; timeout/5xx/interrupted request is not resent. No UI copy promises a free attempt. | **U,I,E,F,S**; provider-call/attempt count, safe error/log capture and DOM. C retry variant waits for C quota configuration. |

### C — shared resource, audit and baseline readiness

| ID / status | Setup and trigger | Required observable outcome | Evidence |
| --- | --- | --- | --- |
| **S3-D2-01-TC-015** · Planned | Against Emulator Firestore and controlled time, invoke the metered gateway from Student-shaped and Mentor-shaped consumers at below/at/above approved per-user and aggregate window thresholds; race instances; hold one user call and aggregate ceiling; roll a budget window while a call remains active; omit provider usage. | Only admitted attempts reach HTTP. Shared aggregate and per-user counts never oversubscribe, one user cannot hold two in-flight requests, aggregate ceiling holds across instances and rollover, and an allowed retry consumes another attempt. Missing usage conservatively charges the reserved bound. Crash/uncertainty does not refund attempts or allow overlapping leases. | **E,I,S**; transaction state, barrier trace and provider-call counts. G-04 supplies approved numeric/window/token values; this proves infrastructure, not Developer 1 integration. |
| **S3-D2-01-TC-016** · Planned | With Developer 1's **real** Student handler wired to Developer 2's metered gateway and the real Mentor handler, use synthetic eligible actors and a small approved shared budget; invoke both in either order and exhaust the pool. | Both production exports consume the **same** aggregate budget, preserve Student public schema, enforce per-user/cross-instance admission, and deny excess before provider invocation. B1's Student-shaped mock cannot satisfy this check. | **I,E,H**; two-export calls, shared budget snapshots and joint sign-off. G-05 is Developer 1-owned handler integration; joint verification is release-blocking for C. |
| **S3-D2-01-TC-017** · Planned | Exercise authenticated success, denied admission, provider failure, audit-write fault, and expiry of a backdated synthetic record under approved 30-day retention setup; attempt direct client read/write of audit and quota paths. Capture routine logs with synthetic secret/message sentinels. | Backend audit has actor, feature, time, safe outcome/error, model when known, attempt count and available usage; no prompt hash, secret, message, output or provider body. Clients cannot access backend records. Audit failure never opens provider access or claims free success; the approved mechanism actually deletes expired records. If deletion timing cannot satisfy the approved 30-day interpretation, G-04 remains open. Unauthenticated denial has no fabricated actor ID. | **E,S,H**; exact redacted records, Rules denials, logs and retention evidence. G-04 includes retention mechanism approval/verification. |
| **S3-D2-01-TC-018** · Planned | Submit instruction-like stored messages and HTML/script-like provider fields; try to induce another conversation read, `sendMessage`, help-request/appointment mutation, or credential disclosure via model text and direct callable parameters. Compare authorized business records before/after. | Retrieval remains at the authorized bounded conversation; no model tools or privileged application actions are available; hostile text renders inert, is editable only as text, and cannot change conversation/request/booking/appointment records. Client-supplied authority fields are rejected. Safe logs/errors contain no private content. This is the **Phase 1 baseline**, not D's adversarial campaign. | **I,E,F,S**; captured synthetic request, DOM inertness and unchanged snapshots. |
| **S3-D2-01-TC-019** · Planned | Human reviews a few synthetic briefs, including sparse, contradictory and truncated conversations plus a case with no identified unresolved question/limitation. | Each result has four usable fields; reviewer records obvious, materially incorrect or fabricated summary content. Only that level of error blocks initial functional acceptance until corrected. Minor wording, formatting, or detail differences are recorded without extensive prompt tuning. Comprehensive semantic evaluation remains deferred until after S3-D2-02. | **H**; small redacted examples and observation notes. Structure/size already tested in TC-010. |
| **S3-D2-01-TC-020** · Planned | At C handoff, inspect actual focused unit/Emulator/UI/real-provider results, affected Auth/F01/F02/Student-contract regressions, sanitized logs, approved config, Guides/ledger and independent review at the exact implementation revision. | Every required evidence class and AC below has pass/fail/partial/blocked status with command/environment; mock evidence is not labeled real-provider evidence. C is reported **technical readiness only**. Real users and real transcripts stay gated by D adversarial verification, provider handling/participant policy and separate release approval. | **H,S** plus recorded **U,I,E,F,P** results; review checklist, not a substitute for those cases. G-06/G-07 remain separate release gates. |

## 3. Traceability crosswalk

Test IDs below omit the common `S3-D2-01-` prefix. Gate IDs refer to §4 and are not substitutes for passing tests.

| Functional requirement | Planned checks |
| --- | --- |
| FR-01 | TC-001, TC-002 |
| FR-02 | TC-003, TC-004 |
| FR-03 | TC-004, G-02, TC-016 |
| FR-04 | TC-004, TC-013 |
| FR-05 | TC-005, TC-006, TC-007 |
| FR-06 | TC-008, TC-009, TC-010 |
| FR-07 | TC-010, TC-019 |
| FR-08 | TC-012, TC-013, TC-018 |
| FR-09 | TC-011, TC-012, G-03 |
| FR-10 | TC-013, TC-014 |
| FR-11 | TC-015, TC-016, G-04/G-05 |
| FR-12 | TC-017 |
| FR-13 | TC-018, TC-020, G-06/G-07 |

| Non-functional requirement | Planned checks |
| --- | --- |
| NFR-01 | TC-001–TC-003, TC-017 |
| NFR-02 | TC-001, TC-003, TC-008, TC-010–TC-011, TC-014–TC-015 |
| NFR-03 | TC-010, TC-013, TC-018 |
| NFR-04 | TC-005–TC-009, TC-017–TC-018 |
| NFR-05 | TC-012–TC-014 |
| NFR-06 | TC-003–TC-004, TC-013, TC-016, TC-020 |
| NFR-07 | TC-001–TC-003, TC-011–TC-012, TC-020 |
| NFR-08 | TC-010, TC-019–TC-020 |

| Acceptance criterion | Planned checks / required gate | Acceptance criterion | Planned checks / required gate |
| --- | --- | --- | --- |
| AC-01 | TC-001–TC-002 | AC-02 | TC-002, G-01 |
| AC-03 | TC-001 | AC-04 | TC-003 |
| AC-05 | TC-003–TC-004 | AC-06 | TC-004, G-02 |
| AC-07 | TC-013 | AC-08 | TC-004, TC-013 |
| AC-09 | TC-005 | AC-10 | TC-006 |
| AC-11 | TC-006 | AC-12 | TC-007 |
| AC-13 | TC-008, TC-010 | AC-14 | TC-009 |
| AC-15 | TC-008 | AC-16 | TC-008, TC-013 |
| AC-17 | TC-010, TC-019 | AC-18 | TC-010 |
| AC-19 | TC-019 | AC-20 | TC-012–TC-013 |
| AC-21 | TC-013 | AC-22 | TC-013, TC-018 |
| AC-23 | TC-011–TC-012, G-03 | AC-24 | TC-011 |
| AC-25 | TC-011 | AC-26 | TC-011 |
| AC-27 | TC-013–TC-014 | AC-28 | TC-003, TC-014, TC-018 |
| AC-29 | TC-014 | AC-30 | TC-013–TC-014 |
| AC-31 | TC-015–TC-016 | AC-32 | TC-015–TC-016 |
| AC-33 | TC-015, G-04 | AC-34 | TC-017–TC-018 |
| AC-35 | TC-004, TC-016, G-02/G-05 | AC-36 | TC-017 |
| AC-37 | TC-001–TC-020 | AC-38 | TC-019–TC-020 |
| AC-39 | TC-020, G-06/G-07 | — | — |

The PRD journeys and boundary extensions are covered as follows: A restricted preflight/uncertain attempt (TC-001–TC-002); B1 shared-owner rejection and mock parity (TC-003–TC-004, G-02); B2 denied/foreign/corrupt/empty/partial/revoked history (TC-005–TC-010); B3 nondesignated caller, cap, real button path, UI context changes and failures (TC-011–TC-014); C quota races, both-handler integration, audit and safety (TC-015–TC-020). Each negative path asserts the safe outcome and absence of unauthorized provider call or state change where relevant. The separate D and release obligations remain in §4.

## 4. External gates and shared dependencies

These are **evidence/approval gates**, not code-test failures. Record their owner and decision/evidence in the feature ledger. A case waiting on one remains `NOT RUN` or `BLOCKED` with that gate identified; do not mark it `FAIL` or `PASS` from a mock.

| Gate | Owner and missing evidence | Blocks |
| --- | --- | --- |
| **G-01 — A provider configuration** | Authorized project-key/secret operator and Developer 2: verified isolated target, key-visible catalog, exact approved model/context/output limits and HTTPS origin, private server mechanism and one-attempt reset authority. No values inferred from guides or `.firebaserc`. | TC-002 real A proof and model-specific TC-008 variant; no general inference until resolved. |
| **G-02 — shared-owner contract** | Developer 1 responds to exact file/interface/error/test request and approves or rejects shared changes; Developer 2 records decision and revises if rejected. | B1 shared edits and TC-003/TC-004 final contract evidence. |
| **G-03 — B3 test audience** | Developer 2/operator verifies synthetic-only isolated development/staging project and exact approved Firebase UIDs; backend deployment gate must reflect them. | TC-012 real B3 path and AC-23 claim; Emulator denial/cap checks alone are insufficient. |
| **G-04 — C budgets and retention** | Developer 2/shared owner approves key request/token allowance, numeric per-user/aggregate daily thresholds, reset/window rule, aggregate concurrency, deadline/runtime ordering and verified 30-day audit-retention mechanism. | TC-015/TC-017 final parameter/retention evidence and C readiness. No numeric values are assumed. |
| **G-05 — Student handler integration** | Developer 1 owns real Student handler wiring, prompt and UI under S3-D1-01; Developer 1 and Developer 2 jointly verify the same gateway/budget with both production exports. | TC-016 and final AC-31/AC-35 claim. A Student-shaped mock is only B1 evidence. |
| **G-06 — D security mission** | S3-D2-02 owner supplies dedicated stored prompt-injection, leakage, unauthorized-action, mitigation/retest and residual-risk evidence after C. | Real-user release; outside Phase 1 TC suite. |
| **G-07 — real-data and release approval** | Release approver resolves provider handling/retention terms, minimization and participant notice/consent, then gives separate release approval after D. | Real conversation transmission and general-user enablement; outside A–C test execution. |

## 5. Completion and stop gate

Developer 2 authorized local Milestone A implementation only. Further milestones, real SoCLaaS inference, and SDD Git publication each need their own authorization. Run A → B1 → B2 → B3 → C in order, retaining B3's real-provider happy path before C quotas and never treating C as the D security campaign. Record each case's actual evidence and status; rerun affected regression cases after fixes. Before a C readiness claim, every applicable A–C test above must pass in its required evidence class, G-01–G-05 must be resolved, the two real-provider checks must have controlled redacted evidence, and the joint Student/Mentor budget check must pass. Open G-06/G-07 remain explicit release blockers. This plan does not label any test as run.

## 6. Final traceability disposition — 2026-10-22

The matrix above is a **planned-case crosswalk**, not proof that every TC passed. Existing handoffs record focused local/mock checks and one controlled `helpinus-dev` local-preview four-section result. They explicitly leave the hosted UI and direct signed-in foreign-Mentor B3 checks open; they do not establish full TC-012, C readiness, or general release. No tests were run for this documentation reconciliation.

The planned A→B→C→D order was not followed: S3-D2-02's synthetic mocked checks were recorded before C shared quotas and audit existed. G-06's historical wording must not be read as proof of C completion.

| Retained check | Current disposition and evidence limit |
| --- | --- |
| TC-001–TC-010, TC-013–TC-014 | Relevant implementation and historical focused test evidence exist in `workflow/handoffs/royden/S3-D2-01.md`. The final UI is read-only, and the later merge removed the Mentor draft UI component test, so TC-013's edit assertion is not valid for final source. Do not infer a fresh pass from test filenames. |
| TC-011 / AC-25 | The final capacity module enforces one active lease but has no ten-attempt admission limit. The planned total-cap assertion is not satisfied by final source. |
| TC-012 / AC-20 | A historical controlled local-preview real-provider result is recorded, but final source cannot edit the brief; hosted UI and direct foreign-Mentor acceptance remain outstanding. Full planned acceptance is not established. |
| TC-015–TC-017 / AC-31–AC-36 | Common Student/Mentor quotas, aggregate budget, persistent Mentor audit, and retention are unimplemented; planned checks cannot be marked passed. |
| TC-018–TC-019 | S3-D2-02 records seven synthetic mocked boundary cases; these do not prove live-model resistance or broad semantic quality. No new human quality review is inferred here. |
| TC-020 / G-06–G-07 | C readiness, real-data policy, and release approval remain open. |

Preserve the original approvals and historical results in the handoffs; this final disposition does not rewrite them or invent a new execution record.
