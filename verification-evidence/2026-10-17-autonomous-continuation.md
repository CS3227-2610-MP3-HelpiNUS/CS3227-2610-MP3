# Sprint 2 F01/F02 autonomous continuation: independent checkpoint

Local worktree: `CS3227-2610-MP3-conversation-management`, committed HEAD `647639849e778cb6b9e2a6083d50d5d4cf40b9bd` plus uncommitted in-scope changes. All Emulator projects below are synthetic; no production data was read or changed. The earlier 20 PASS / 71 PARTIAL evidence remains preserved in `2026-10-17-independent-baseline.md` and the older logs.

## Independent rerun on the 27 PASS / 64 PARTIAL checkpoint

| Command | Outcome |
| --- | --- |
| `npm run check` | Frontend 249/249, Functions unit 39/39, shared 13/13 passed (301 total); lint and typecheck passed; frontend build passed. The sandboxed Functions esbuild step alone failed with directory traversal access denied. |
| `npm run build --workspace src/functions` with narrow sandbox escalation | PASS; Node 22 Functions bundle and local deploy package prepared. No deployment. |
| `npm run test:rules --workspace src/functions` with narrow sandbox escalation | PASS, 17/17 actual Firestore Rules Emulator tests under `helpinus-rules-test`. |
| `npm run test:integration --workspace src/functions` with narrow sandbox escalation | PASS, 22 files and 77/77 production-wired Auth/Firestore/Functions Emulator tests under `helpinus-integration-test`. |
| `npm run test:deploy-package --workspace src/functions` | PASS: valid, stale bundle, out-of-bound dependency and stale lockfile cases. |
| `git diff --check` | PASS; Git emitted line-ending conversion warnings only. |

The first `npm run check` exposed one newly added F01-TC-005 synthetic-flag unit fixture that lacked Firestore's nested `collection()` mock. The mock was corrected, its focused test passed, then the full 301-test check passed through frontend build. The Functions bundle was separately rerun outside the sandbox. The Rules emulator shutdown left one orphaned Java process on port 8080; its command line confirmed the same worktree, rules file and `helpinus-rules-test` project with a dead parent. Only that exact process was stopped, then the integration suite passed. These intermediate failures remain recorded and are not product assertion failures.

## Case-level independent promotions

- F01-TC-002: per-field M validation, draft correction and literal rendered text.
- F01-TC-009/010: production duplicate/terminal and same-operation lost-reply/replay snapshots with existing M draft/retry checks.
- F01-TC-035: actual F02 `subscribeList` adapter under Rules, both-role mixed own/pending/foreign/support fixture and broad/foreign denial.
- F02-TC-001: the approved shared F01-TC-029 atomic acceptance and pair evidence supplies this row's I/E/R assertions.
- F02-TC-020: separate production equal-time page/live insertion and offline reconnect tests, plus deferred M gap-bridge/role continuity regression.
- F02-TC-035: storage fault/collision, byte-preserved earlier retry records, 128-record no-eviction, paused dispatch and guidance M evidence.

The independent Verification Agent read the exact approved RTT assertions and supports all seven promotions. F01-TC-005 and F02-TC-032 corrections were still in progress after this checkpoint and remain PARTIAL pending a later integrated rerun. F01-TC-001's read-only Mentor selection contract was separately approved by the user and is being implemented; no PASS is claimed for it yet.

### Subsequent evidence-only row audit

The independent verifier compared the exact approved F01 RTT and existing passing source/tests and found two historical gaps had demanded assertions from other rows. F01-TC-022's PENDING+unexpected-pair and REJECTED+pair same-outcome replay, integrity/support result, Admin no-write and Rules no-chat evidence satisfies its I row. F01-TC-033's same-ID accepted links from both roles, strict persisted pair, participant reads and client mutation denial satisfies its I/M row. These were promoted without repeating the passing 301/17/77 suites. The current ledger is 29 PASS / 62 PARTIAL at this evidence-only checkpoint.

The [91-case matrix](Sprint2CaseMatrix.md) and [64-case incomplete disposition](RemainingCaseDisposition.md) record the current status and exact remaining assertion for each approved case. Required H observation, real-data audit and exact-revision C CI evidence are never inferred from a local green suite.
