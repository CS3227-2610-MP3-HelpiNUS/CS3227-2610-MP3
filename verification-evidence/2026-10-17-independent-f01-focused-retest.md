# Independent F01 focused retest — 2026-10-17

Verifier: separate read-only verification agent. Local worktree `royden/feat-conversation-management` at committed HEAD `647639849e778cb6b9e2a6083d50d5d4cf40b9bd` plus uncommitted in-scope files. Windows PowerShell, Node 22.23.3, Java 25.0.4, workspace-local `.verify-temp` for `TEMP`/`TMP`. Firebase tests used only synthetic `helpinus-rules-test` and `helpinus-integration-test` projects. No commit, push, PR, merge, deployment, or real-data access occurred.

| Exact command from repository root | Actual result |
| --- | --- |
| `npm run build --workspace src/shared` | PASS, shared TypeScript build. |
| `npm run test --workspace src/shared -- src/contracts.test.ts` | PASS, 1 file / 12 tests. |
| `npm run test --workspace src/frontend -- src/test/helpRequests.test.tsx` | PASS, 1 file / 52 tests, before later TC-034 frontend assertions. |
| `npm run test --workspace src/functions -- src/mentorRequestSelection.test.ts` | PASS, package script included all `src`: 11 files / 42 tests. |
| `npm run typecheck --workspace src/functions` | PASS, including new F01 decision integration test types. |
| `npm run build --workspace src/functions` under normal sandbox | Failed at esbuild before bundle, `Cannot read directory "../../../../../../../..": Access is denied`; shared build and TypeScript had passed. Environment-only limitation, not an assertion failure. |
| Same Functions build with narrow sandbox escalation | PASS; `lib/index.js` 794.7 kB and deploy package prepared. No deployment. |
| `firebase emulators:exec --only firestore --project helpinus-rules-test "npm exec --prefix src/functions -- vitest run rules-tests/f01ParentGateMatrix.test.ts --no-file-parallelism"` | First attempt: emulator could not start because port 8080 held by an orphaned synthetic integration Firestore Java process. Its exact worktree/project command line was checked and the orphan alone terminated. |
| Same focused Rules command | First executed run: 2 passed / 1 failed. New test fixture's `snapshot()` returned `undefined` from `withSecurityRulesDisabled`, so two no-write checks compared undefined and the third dereference failed. Implementation agent corrected the fixture to capture nonempty Admin rows. The failed attempt remains a test-infrastructure defect record. |
| `firebase emulators:exec --only auth,firestore,functions --project helpinus-integration-test "npm exec --prefix src/functions -- vitest run integration-tests/f01AuthorizationMatrix.test.ts integration-tests/mentorRequestSelection.test.ts integration-tests/f01F02Final.test.ts --no-file-parallelism --testTimeout 30000"` | PASS, 3 files / 17 production-wired tests. Exported `getMentorRequestSelection` loaded; F01 authorization, selected Mentor lookup, rejected decision and terminal replay assertions passed. |
| Corrected focused Rules command above | PASS, 1 file / 3 tests. The corrected fixture asserts nonempty Admin baseline and exact unchanged request, pair and message collections. |
| `npm run test --workspace src/frontend -- src/test/helpRequests.test.tsx src/test/conversations.test.tsx src/test/conversationOfflineRetryProof.test.tsx src/test/conversationContextSwitch.test.tsx src/test/conversationStaleContext.test.tsx` | PASS, 5 files / 85 tests after new F01-TC-034/F02-TC-008 frontend assertions. This also independently retests F02-TC-032/036/039 M cases. |
| `git diff --check` | Exit 0. Git emitted line-ending conversion warnings only. |

Each Firebase CLI shutdown left a Java process listening on port 8080 despite reporting emulator exit. Before subsequent runs, the verifier read the exact process command line, confirmed this worktree, rules file and synthetic project, then terminated only that orphan. The emulator slot was released after the corrected Rules pass.

## Requirement-level recommendations

- **F01-TC-001 PASS:** approved RTL/router M assertions are covered by exact-ID discovery, refresh and direct-route selection, trusted current name, forged route/draft rejection, pending/error/unavailable fail-closed behavior, supported module choice and no premature create. Shared schema and production callable checks passed as additional contract evidence.
- **F01-TC-005 PASS:** the focused current-auth matrix and prior passing extra-field/production-flag suites cover signed-out, wrong-role, inactive, disabled, refreshed-unverified and stale-email callers; strict extra-field denial; Auth-derived persisted Student ID; and exact no-write snapshots.
- **F01-TC-021 PASS:** production rejection advances a native server decision timestamp strictly, releases the key, updates the summary once, leaves receipt and pair unchanged on same/new-ID replay and opposite conflict. The passing RTL covers Mentor confirmation; source does not write a reason/audit record.
- **F01-TC-023 PASS:** accepted and rejected terminal branches return stored same-outcome results for same/new IDs, report actual status on opposite action, and preserve exact request/key/summary/pair snapshots. Passing RTL displays actual conflict status without false accepted success.
- **F01-TC-032 PASS:** corrected Rules matrix covers participant/foreign direct pair/message get, message bounded list/create denial across PENDING, REJECTED and ACCEPTED parents; broad conversation list and direct pair creation denial; stale role/status/token/email denial; and exact nonempty Admin no-write snapshots.
- **F02-TC-032 PASS recommendation:** the previously recorded 1/1 emulator and 1/1 RTL offline-retry proof, today's fresh Functions build, Rules access evidence and affected frontend 85/85 establish E/R/M. Cached absence did not authorize retry; unavailable server proof preserved uncertain state and the retry record; reconnect checked server absence and accepted parent/pair before one same-ID send and stable replay.
- **F02-TC-036 PASS recommendation:** today's context-switch RTL and focused Rules plus prior access tests cover sign-out, account/role/status/service change, retry key and in-memory cleanup, held callback suppression, and same-account refresh retention.
- **F02-TC-039 PASS recommendation:** today's context-switch and prior stale-context RTL cover held list/detail/message/server/callable outputs across route, account, role, service and reconnect changes, with unsubscriptions and no revived private content or dispatch.

F01-TC-034 and F02-TC-008 await the separately assigned final backend/release-audit assertion and independent rerun; their passing frontend assertions alone do not close them. This note recommends case-level promotions to the Orchestrator and does not declare either feature VERIFIED.
