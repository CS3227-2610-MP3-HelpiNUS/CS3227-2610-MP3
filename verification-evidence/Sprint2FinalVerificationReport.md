# Sprint 2 final F01/F02 verification report

**Date:** 2026-10-17 (Asia/Singapore)
**Status:** FUNCTIONALLY COMPLETE FOR DEVELOPMENT — FORMAL VERIFICATION AND RELEASE GATES OPEN.
**Scope:** S2-D2-F01 Help Request Management and S2-D2-F02 Conversation Management.
**Integrated worktree:** `CS3227-2610-MP3-conversation-management`, branch `royden/feat-conversation-management`.
**Committed baseline before finalization:** `647639849e778cb6b9e2a6083d50d5d4cf40b9bd`; F01 implementation commit `bb2e7c2ae1c4a8556716be62cfafd052d8789045` is an ancestor. The final local commit is the Git checkpoint for this report; use `git log -1` for its SHA. No push, PR, merge, deployment, or real-data access was performed.

## Final development checkpoint

The 2026-10-17 closing pass stopped broad RTT expansion and tested the current Sprint 2 implementation. `npm run check` passed lint, typecheck, 295 frontend, 42 Functions and 14 shared unit/component tests (355 total), and the frontend build. Its Functions bundle step hit the previously recorded Windows sandbox directory-access error; the same `npm run build --workspace src/functions` passed under narrow local escalation. No source correction was needed. The repository's full `npm run test:integration --workspace src/functions` passed **30 files / 96 tests** on synthetic Auth/Firestore/Functions Emulators. The first full integration attempt was 95/96 because a new empty-page fixture stored a mixed-case email while Firebase Auth normalized it; after correcting that test-only fixture, its focused rerun passed 2/2 and the final full suite passed 96/96. `npm run test:rules --workspace src/functions` passed **2 files / 23 tests** after an unverified TC-039 reconnect fixture was removed; that assertion remains PARTIAL. The intermediate failures are described here; [final integration](2026-10-17-sprint2-final-integration.log), [focused correction](2026-10-17-sprint2-pagination-rerun.log) and [Rules](2026-10-17-sprint2-final-rules.log) logs preserve green command outcomes. There is no known new critical product defect from this pass.

The **40 PASS / 51 PARTIAL** RTT ledger remains conservative. It is a formal evidence count, not a count of failing tests. Outstanding local case-specific matrices are deferred to a later scoped verification pass. Exact-commit Node 22 CI, read-only audit of the relevant real data, and a human screen-reader/responsive observation remain required before production release.

## Baseline and authority

The conversation worktree contains both features and their production F01 acceptance/F02 conversation binding. The approved F01/F02 Mission Briefs, Grilling Decisions, PRDs, TDDs and RTTs in this worktree are the requirement baseline. F01 local and repository SDD text is identical after normalizing CRLF/LF; F02 repository hashes match its recorded approved package. The pre-existing dirty changes in `.agents/skills/mp3-feature-delivery/SKILL.md`, `.codex/agents/code_test_verifier.toml`, `src/functions/deploy/package.json`, `workflow/agents/README.md` and `workflow/templates/dev2-feature-ledger.md` were preserved.

The 2026-10-17 read-only `git fetch origin` succeeded. `origin/master` is `9c1745fab22e52b1147344f5dff880bead5ae4f7`; the local integrated branch is 73 commits ahead of that merge base and neither F01 nor F02 local revision is on a remote-tracking branch. Testing uses the local integrated worktree, without merging into `master` or `dev-staging`.

## Case-level traceability

The [current incomplete-case disposition](RemainingCaseDisposition.md) lists every PARTIAL row with its exact missing assertion and Local/Correction/Manual/External work class. The original [71-case disposition](PartialCaseDisposition.md) is preserved as a historical checkpoint.

The [case matrix](Sprint2CaseMatrix.md) places all 46 approved F01 and 45 approved F02 RTT cases beside each case's requirement/AC trace, required action/assertions/evidence class, executed evidence and missing work. The [reverse PRD-to-RTT index](TraceabilityInventory.md) maps all 12 F01 FR, 7 F01 NFR and 45 F01 AC IDs, and all 23 F02 FR, 9 F02 NFR and 44 F02 AC IDs, to case IDs. F02 NFR-01–07 mappings are in the RTT's separate non-functional-requirements paragraph rather than the individual case-row traces. This is an ID inventory, not semantic coverage or a PASS claim. Every incomplete case requires its full stated assertion set and evidence classes before closure.

| Feature | PASS | FAIL | PARTIAL | BLOCKED | NOT RUN | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| F01 | 24 | 0 | 22 | 0 | 0 | 46 |
| F02 | 16 | 0 | 29 | 0 | 0 | 45 |
| **Combined** | **40** | **0** | **51** | **0** | **0** | **91** |

These are the conservative persisted ledger counts at the latest reconciliation checkpoint; newer focused tests are being independently retested before promotion. The original 20 PASS / 71 PARTIAL checkpoint and its evidence are preserved. F01-TC-001/005/021/023/032/036/037/038 and F02-TC-032/036/039 gained complete local evidence after the earlier independent rerun. The 13 F01 cases previously blocked on F02 and nine F02 cases previously NOT RUN now have partial production-wired evidence. Each PARTIAL row retains its exact missing assertions and evidence classes in the case matrix. The historical handoff counts were F01 1/32/13 (PASS/PARTIAL/BLOCKED) and F02 0/36/9 (PASS/PARTIAL/NOT RUN).

## Executed commands and outcomes to date

| Command / environment | Outcome and scope |
| --- | --- |
| Node 22.23.3, npm 10.9.9, local JDK 25.0.4; worktree-local `TEMP`/`TMP` | Test environment established. Firebase Emulator launch required a narrow unsandboxed loopback run; no production project was targeted. |
| `npm run check` at committed baseline `6476398` | PASS: lint, typecheck, frontend 194/194, Functions unit 36/36, shared 12/12 (242 tests), and production builds. This is unit/component/build evidence only. |
| Original `npm run test:rules --workspace src/functions` | FAIL before tests: the package script's single-quoted Firebase subcommand was parsed as too many arguments on Windows. The script was corrected. |
| Direct Firestore Rules Emulator run of `src/functions/rules-tests/access.test.ts` after initial Rules fix | 9/16; seven fixture failures caused by previously valid-looking seed parents without their required stored `id`. Valid fixtures were corrected while retaining malformed-ID denial variants. |
| Latest independent `npm run test:rules --workspace src/functions` | PASS: 17/17 actual Firestore Rules Emulator tests. The Rules emulator left an orphaned Java process after shutdown; its command line identified this worktree's synthetic rules-test project, and it was stopped before integration testing. |
| Latest independent `npm run test:integration --workspace src/functions` | PASS: 22 Auth/Firestore/Functions integration files, 77/77 tests on the recorded dirty tree. Historical 75/75 and earlier runs remain recorded. |
| Latest independent `npm run check` plus narrow Functions build rerun | PASS: frontend 249/249, Functions unit 39/39, shared 13/13 (301 total), lint, typecheck and frontend build on Node 22.23.3. Functions esbuild failed only under sandbox directory traversal and passed in the narrowly escalated local build. The first run exposed an unfinished synthetic-flag mock path; that test fixture was corrected and rerun green before the full gate. |
| `npm run test:deploy-package --workspace src/functions` | Independent verifier PASS; valid and stale/out-of-bound package cases. |
| `git diff --check` | Independent verifier PASS on the frozen later tracked diff; only Git line-ending warnings. |
| Local browser on Auth/Firestore/Functions emulators and Vite | First run: Student request → Mentor accept → same-ID conversation → persisted two-way messages across account switch/reload. Second run: Mentor rejection → no chat list/link → rejected direct chat URL gave support guidance. Desktop 1280 px and both roles' request views at 320 px had no document overflow; two dialog keyboard focus loops were checked. See [manual browser evidence](2026-10-17-manual-browser.md). This remains partial RTT evidence, without simultaneous two-browser or screen-reader observations. |
| Read-only `npm run audit:help-requests --workspace src/functions` against populated local emulators | PASS invocation in two synthetic datasets: accepted run had one request/one conversation; rejected run had one request/zero conversations. Both had one summary/receipt, no pending key, `anomalies: {}`, `clean: true`. No real-data audit. |

The [independent baseline](2026-10-17-independent-baseline.md) preserves prior commands, intermediate fixture failures and limits. The continuation independently reran an earlier tree at 301/17/77 after a test-only mock correction. The closing 355/23/96 pass above supersedes those suite counts. No exact-revision CI has run.

## Findings and remediation

1. **Rules identity parity:** direct chat reads accepted a parent request with a mismatched stored `id`, and direct protected reads accepted a user record with a mismatched stored `id`, while callables rejected those records. The Implementation Agent added fail-closed Rules checks and actual Rules regression fixtures. Affects F01-TC-032/039 and F02-TC-009/038/040.
2. **Chat denial privacy:** a denied `acknowledgeMessage` call was retried as transient and left private chat content visible after detected revocation. Subsequent review also found that denied send, detail and message-listener callbacks could leave a live detail subscription capable of repopulating content. The Implementation Agent added denial-path component tests and now increments the callback epoch, unsubscribes and clears private chat/retry state on detected denial. Affects F02-TC-017/038/039.
3. **Windows test runner:** repository Rules/integration scripts used shell quoting incompatible with PowerShell/cmd. The Implementation Agent changed the scripts to use cross-platform double-quoted subcommands. Both stock scripts then passed in independent Windows runs.
4. **Direct request route context:** a direct request URL without trusted display context enabled new submission. The implemented discovery-click context is now kept in memory per Student, while forged route/session names are ignored. The user approved the [narrow read-only Mentor selection callable contract](F01-TC-001-contract-request.md). Its implementation and independent frontend/shared/production callable reruns now pass: refresh and direct entry show the current trusted Mentor name, and unavailable or forged context cannot submit. F01-TC-001 is PASS.
5. **Existing Mentor dashboard test timing:** the first independent root rerun passed 216 frontend assertions but Vitest flagged an unhandled rejection in the S1-F03 deferred-read test. The test rejected its promise after checking loading text, before proving the effect had invoked the read and attached its rejection handler. The Implementation Agent added a read-invocation wait without changing product behavior or UI assertions. Focused 44/44 and independent root 264/264 later passed.
6. **Message replay conflict classification:** a saved message with the same ID but a different body or sender was presented as an uncertain send with Retry, contrary to F02-TC-033. Focused component tests reproduced both mismatches red. The Implementation Agent marked these server-read and callable-result mismatches as definitive `already-exists` conflicts. The focused green suite and independent full rerun passed; the UI now shows Failed and does not offer an uncertain duplicate retry.
7. **Chat offline and transient-state feedback:** the production message adapter ignored Firestore's cached snapshot metadata, so a disconnected client could continue to appear live; a transient detail error also erased already authorized saved history. Focused adapter and component tests reproduced both behaviors red. The Implementation Agent enabled metadata updates, reports cached/pending-write snapshots as stale or unavailable instead of confirmed saved messages, and preserves the authorized transcript on transient detail failure. Real two-client offline/reconnect integration and independent regressions passed; permission-denied cleanup still clears private content.
8. **Live page shift and retry storage:** focused deferred tests reproduced a lost saved row during live first-page shift and a failed retry-store readback leaving a newly written key. The corrections retain the saved row with a stale gap until bounded bridge completion, roll back the new key after readback failure, preserve earlier records and pause new sends. Independent 301/17/77 rerun and case-level audit closed F02-TC-020/035.
9. **Documentation accuracy:** the User and Developer Guide navigation tables still called Conversations a scaffold despite the implemented request-linked chat. Those two lines were corrected; [the F02-TC-045 local audit](F02-TC-045-local-regression-audit.md) records the dormant close/booking route and shared-consumer source inspection. TC-045 still requires exact-revision CI after a separately authorized commit.

An independent full integration run then passed 49/50, with one existing Mentor profile test exceeding Vitest's default five seconds while making three emulator callable requests, two Admin reads and sign-in cleanup. The immediate full rerun passed 50/50. The timeout was investigated as an emulator timing assumption; no product assertion failure was established and no timeout was raised. Both outcomes remain in the independent evidence.

The separate security reviewer inspected the initial corrected Rules and UI diff and found no apparent new bypass. That review was static; its own sandboxed Vitest attempt collected no tests because of a temp-file `EPERM`. The independent Verification Agent later inspected the final privacy-denial diff and found no concrete residual defect; independent test execution is separately recorded.

## Outstanding mandatory evidence

- Complete case-level adversarial, boundary, concurrency, failure-recovery and persisted-state matrices for all incomplete F01/F02 RTT cases. A generic green suite cannot close them.
- The approved [targeted read-only Mentor selection contract](F01-TC-001-contract-request.md) passed local independent verification. Later focused corrections and case-specific matrices are still being retested and reconciled.
- The final added tests were independently rerun. The exact query/index shape was checked against the production frontend adapter and Firestore indexes, and bounded request/message tie fixtures now run under Rules. Other RTT cursor, error and reconnect variants remain identified case by case in the matrix.
- Complete rendered desktop and 320 px Student/Mentor state matrix, keyboard/focus and one real screen-reader observation. The executed desktop and Student mobile flow is recorded separately; AX/DOM inspection is not a substitute for the required screen-reader pass.
- Node 22 CI run linked to the final local commit. No push or PR is authorized, so CI has not executed that revision.
- Read-only integrity audit of the relevant real dataset before enablement; an empty or synthetic Emulator audit cannot satisfy that release gate.

## Readiness verdict

| Gate | Verdict and basis |
| --- | --- |
| Implementation completeness | Both feature paths and the shared acceptance/conversation binding are present. Sprint 2 is functionally complete for development; 51 formal RTT rows remain PARTIAL. |
| Standalone verification readiness | Lint, typecheck, all 355 unit/component tests, frontend build and separately escalated Functions build passed. The standalone RTT assertion/evidence matrix is incomplete. |
| Integration verification readiness | Full production-wired Auth/Firestore/Functions Emulator suite passed 96/96, Firestore Rules passed 23/23, and synthetic browser acceptance/rejection journeys passed. Controlled precommit/transport faults, complete two-client rendered/accessibility work and other case-level matrices remain partial. |
| Production release readiness | **NOT READY.** Exact-revision Node 22 CI, required real-data audit and complete manual accessibility evidence are unavailable, and 51 approved cases remain partial at this reconciliation checkpoint. |

**Sprint 2 is functionally complete for development, but neither feature is formally VERIFIED or RELEASE READY.** The 91-case ledger retains each remaining assertion and evidence class. The next sprint can build on this local checkpoint; production integration must revisit exact-commit CI, real-data integrity and accessibility gates and the remaining risk-bearing RTT rows.
