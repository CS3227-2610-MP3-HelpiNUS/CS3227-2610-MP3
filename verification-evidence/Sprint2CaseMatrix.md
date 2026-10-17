# Sprint 2 F01/F02 case-by-case evidence matrix

This matrix copies each approved RTT action, assertion, and evidence contract next to its execution ledger. A listed test or generic suite pass does not itself close a case. The feature handoffs retain the historical commands and outcomes; the final verification report records this pass's commands.

## F01: 46 approved cases

### F01-TC-001 — PASS

- **Trace:** **F01-TC-001** · FR-01, FR-03; AC-01, AC-04; GD-02, GD-03 · discovery handoff
- **Action and fixture:** Eligible `studentA`; discovery has selected `mentorA`, supported `moduleA`; separately only a filter label, a stale module ID, or a direct link without trusted display context. Open Request Help and refresh.
- **Required assertions:** Route retains exact Mentor/module IDs; chosen Mentor is visible from trusted metadata; form requires one supported actual module. Label alone never selects. Stale/missing context disables submit with correction/reselection; no silent substitution or request write.
- **Required evidence:** Frontend RTL/router, **M**; DOM, route and service-call assertions. Needs approved discovery/route edits.
- **Executed evidence recorded:** Independent frontend RTL proves exact Mentor/module route IDs and the current trusted display name on discovery, refresh and direct entry; forged route/session names are ignored, pending/error/unavailable lookup blocks submission, and label-only or stale module selection cannot write. Shared strict schema and production callable tests pass with public-only projection and read-only snapshots.
- **Closure:** All approved TC-001 M router, DOM and service-call assertions passed. The separate targeted contract's browser observation remains useful manual follow-up, not an additional approved RTT class.

### F01-TC-002 — PASS

- **Trace:** **F01-TC-002** · FR-02; AC-02, AC-03; GD-04 · field validation and text rendering
- **Action and fixture:** `studentA` form; enter blank/outer-spaced, 120/121-character title and 2,000/2,001-character description; internal newlines and literal markup. Submit each.
- **Required assertions:** Invalid field gets associated accessible error and no callable invocation. Valid normalized content retains newlines; detail renders markup as text, with no executable node. Draft survives correction.
- **Required evidence:** Frontend RTL, **M**; exact input/call/DOM assertions. Needs form and detail.
- **Executed evidence recorded:** Independent frontend RTL rerun covers blank title and description, independently submitted 121-character title and 2001-character description beside valid other fields, associated aria-invalid/describedby errors, zero calls, saved draft correction, and successful normalized 120/2000 calls. Literal markup in title and multiline detail is rendered as text without executable image/script nodes.
- **Closure:** All approved TC-002 M field, call, draft and literal DOM assertions satisfied locally; H manual observation is not an approved evidence class for this row.

### F01-TC-003 — PASS

- **Trace:** **F01-TC-003** · FR-02, FR-03; AC-02, AC-03, AC-06; GD-04 · authoritative content bounds
- **Action and fixture:** Valid actor/selection; call backend directly with missing, null, whitespace-only, malformed, 121/2,001 normalized characters, extra `studentId`, then valid outer-space/multiline input.
- **Required assertions:** Bad input returns field/argument error and no request, key, receipt or summary. Valid input persists trimmed outer whitespace and unchanged internal text, read back as literal content.
- **Required evidence:** Callable unit + Functions/Firestore **E**; contract parse and Admin snapshots. Needs F01 handler/harness.
- **Executed evidence recorded:** Independent callable-unit parseRequest and production Functions/Firestore emulator tests reject missing/null/blank/malformed/121-title/2001-description/forged-studentId inputs with fieldErrors and exact unchanged request/key/receipt/summary snapshots; valid 120/2000 outer-trimmed multiline literal text persists and fresh-reads unchanged internally.
- **Closure:** All approved TC-003 callable-unit and Functions/Firestore E assertions satisfied on the local integrated tree.

### F01-TC-004 — PASS

- **Trace:** **F01-TC-004** · FR-03; AC-04; GD-02, GD-03 · current Mentor/module eligibility
- **Action and fixture:** Seed each missing/inactive Mentor account, missing/inactive Mentor profile, missing/inactive module, unsupported `moduleB`, and valid selection that becomes stale after discovery. Invoke create.
- **Required assertions:** Each invalid selection yields non-sensitive actionable ineligibility; no partial request/key/receipt/summary. Valid active supported catalogue ID alone succeeds; client code/label cannot substitute for canonical ID.
- **Required evidence:** Callable/Firestore **E**; response and before/after snapshots. Needs eligibility fixtures.
- **Executed evidence recorded:** Independent production callable/Firestore tests cover missing and inactive Mentor account, missing/inactive profile, no supported module, unsupported module, and discovery-then-stale module with sanitized errors and exact unchanged request/key/receipt/summary snapshots after each denial. Canonical Mentor/module IDs succeed while code/label substitutes deny; focused UI tests retain the draft and give refresh/reselect guidance. Missing/inactive account deliberately uses generic permission-denied to avoid disclosing account existence, while profile/module failures use SELECTION_INELIGIBLE.
- **Closure:** All approved TC-004 selection and no-write assertions satisfied on the local integrated tree; the generic account denial is non-sensitive and actionable through the UI.

### F01-TC-005 — PASS

- **Trace:** **F01-TC-005** · FR-03, FR-12; NFR-01; AC-05, AC-39; GD-02 · creation authority
- **Action and fixture:** Invoke create signed out, as Mentor, inactive/disabled/unverified Student, stale token email, and with forged `studentId`; also eligible `studentA`.
- **Required assertions:** Unauthorized/extra-field attempts deny without outcome or foreign data; no writes. Valid request derives `studentId=studentA` from Auth, irrespective of UI state. Test documented synthetic emulator exception only under emulator flag and prove it is disabled in production-mode helper test.
- **Required evidence:** Backend unit + Callable **E**; role/auth matrix, snapshots and production-flag assertion. Needs shared auth contract.
- **Executed evidence recorded:** Independent production Auth/Firestore/Functions emulator denies signed-out, wrong-role, suspended, Auth-disabled, refreshed-unverified and stored-email-drift Student creation/replay, plus forged Student identity, status, email and timestamp input fields. Exact request/key/receipt/summary/no-chat snapshots remain unchanged; eligible creation derives Student ID from Auth. Earlier focused unit proves the synthetic verification flag is emulator-only.
- **Closure:** All approved TC-005 E authorization, identity, no-write and synthetic-exception assertions passed locally.

### F01-TC-006 — PASS

- **Trace:** **F01-TC-006** · FR-03, FR-12; NFR-02; AC-06; GD-03, GD-05 · successful persisted creation
- **Action and fixture:** Valid `studentA`/`mentorA`/`moduleA`, `opA`; call create and fresh-read request and coordination docs.
- **Required assertions:** `created` contains server-generated `helpRequest.id`, different in meaning from `opA`; one `PENDING` doc has immutable participants, canonical module, normalized text, equal server-controlled initial times. Receipt points to it; tuple key and summary counts agree. UI confirms only after authorized persisted result.
- **Required evidence:** Callable/Firestore **E** plus focused frontend **M**; Admin snapshot and DOM/call sequence. Needs handler, Rules, UI.
- **Executed evidence recorded:** Independent production Auth/Firestore/Functions emulator test fresh-reads exactly one newly created PENDING request with server-generated ID distinct from operation/actor IDs, canonical module, normalized literal text, immutable participants and equal native Timestamp initial times within the call interval; receipt fingerprint/target, tuple key and summary exact fields/timestamp agree. Authenticated Student SDK reads it, direct participant/module mutation denies with an unchanged Admin record. Focused frontend test withholds success until the callable resolves and the authorized saved detail is published, including wrong-owner detail rejection.
- **Closure:** All approved TC-006 callable/Firestore E, Rules and focused frontend M persisted-confirmation assertions satisfied on the local integrated tree.

### F01-TC-007 — PASS

- **Trace:** **F01-TC-007** · FR-03, FR-05; AC-06, AC-10; GD-17 · explicit wire identity
- **Action and fixture:** Parse proposed create/respond inputs using UUID `operationId` and persistent `helpRequestId`; submit old ambiguous `requestId`, malformed UUID and extra identity fields.
- **Required assertions:** Shared strict schemas and caller adapters accept explicit keys and reject old F01 UUID key; no client may choose persistent ID. Created output `helpRequest.id`, receipt target and F02 `helpRequestId` agree; F04 update and dormant close schemas remain compatible.
- **Required evidence:** Shared Vitest + adapter **M**, callable **E**; schema/call transcript. Consumer inventory and coordinated contract update remain necessary; ownership approval is recorded.
- **Executed evidence recorded:** Independent shared and generic Firebase adapter tests prove exact create/respond operationId versus F04 update/dormant close requestId wire shapes; production callables reject legacy/malformed/extra inputs, and generated output ID agrees with receipt/F02 pair. The consumer and ownership inventory is in verification-evidence/F01-TC-007-consumer-inventory.md.
- **Closure:** All approved TC-007 shared/adapter M, callable E and consumer inventory assertions satisfied on the local integrated tree.

### F01-TC-008 — PARTIAL

- **Trace:** **F01-TC-008** · FR-04; NFR-02; AC-07; GD-01 · distinct concurrent attempts
- **Action and fixture:** Two different UUIDs/payloads for `studentA`–`mentorA`–`moduleA`, barrier-started before tuple commit.
- **Required assertions:** Exactly one `created`, one `duplicate`; Admin scan finds one pending request and one matching key, two immutable receipts with respective outcomes, summary pending count +1 only. Repeat with equal question text; result unchanged.
- **Required evidence:** Firestore transaction **E**; barrier trace and all document snapshots. Needs race harness.
- **Executed evidence recorded:** Concurrent different UUIDs E yielded created + duplicate, one request/key, two receipts and one summary increment.
- **Missing assertion/evidence or blocker:** No controlled barrier hook.

### F01-TC-009 — PASS

- **Trace:** **F01-TC-009** · FR-04; AC-08; GD-01, GD-08 · existing tuple and terminal predecessor
- **Action and fixture:** Seed pending request/key; submit distinct `opB` with different text, then decide predecessor terminal and submit fresh `opC`.
- **Required assertions:** `opB` is duplicate, never delivered; own pending ID/link/status returned and UI retains attempted draft. After terminal commit key is absent and `opC` creates a new ID/key, leaving terminal record intact; counts reconcile.
- **Required evidence:** Callable/Firestore **E** + RTL **M**; response, draft and snapshots. Needs decision handler.
- **Executed evidence recorded:** Independent production Auth/Firestore/Functions integration rerun tests changed-text opB against the pending tuple, returns duplicate without delivering attempted text, retains the Student's draft in RTL, and compares exact request/key/receipt/summary snapshots. After the predecessor is terminal and its key removed, fresh opC creates a distinct ID and key with reconciled counters while the terminal record remains intact.
- **Closure:** All approved TC-009 E and M duplicate/terminal-predecessor assertions satisfied locally.

### F01-TC-010 — PASS

- **Trace:** **F01-TC-010** · FR-05; NFR-02; AC-09, AC-10; GD-17 · identical UUID replay
- **Action and fixture:** Send `opA` with payload P twice sequentially and concurrently; drop first response; replay after referenced request becomes terminal.
- **Required assertions:** One receipt and one created request ever; unchanged replay returns receipt target after authorization, with no new write. UI keeps frozen UUID/payload while unresolved and only confirms authorized result; terminal predecessor does not turn old UUID into a new request.
- **Required evidence:** Callable/Firestore **E** + deferred RTL **M**; receipt/request hashes, call arguments. Needs retry UI.
- **Executed evidence recorded:** Independent production integration rerun commits opA, discards its callable reply, replays sequentially and from barrier-started concurrent calls, and compares exact one request, receipt target, key and summary snapshots. Replay after the request is terminal still returns the original receipt target. Deferred frontend RTL retains the frozen UUID/payload while unresolved and confirms only an authorized result.
- **Closure:** All approved TC-010 E and M same-operation, lost-reply, terminal and UI assertions satisfied locally.

### F01-TC-011 — PASS

- **Trace:** **F01-TC-011** · FR-05; AC-10; GD-17 · changed-payload replay
- **Action and fixture:** After durable `opA` receipt, reuse UUID with changed normalized title, description, Mentor or module; repeat with only outer whitespace changed.
- **Required assertions:** Material changes reject `OPERATION_ID_REUSED` without stored private success or new write; normalization-equivalent payload replays. Editing after uncertain send requires reconciliation or new UUID, never silently reuses `opA`.
- **Required evidence:** Callable/Firestore **E** + RTL **M**; fingerprint/result and captured calls. Needs receipt implementation.
- **Executed evidence recorded:** Independent production callable/Firestore emulator tests persist an operation receipt and prove same-UUID changed normalized title, description, Mentor or module each returns sanitized OPERATION_ID_REUSED without private success or any request/key/receipt/summary mutation; outer-whitespace-equivalent payload replays the original ID and receipt. Focused frontend test captures calls to prove uncertain edited text remains locked to reconciliation or a fresh UUID rather than silently reusing the operation ID.
- **Closure:** All approved TC-011 E and M fingerprint/replay/conflict assertions satisfied on the local integrated tree.

### F01-TC-012 — PASS

- **Trace:** **F01-TC-012** · FR-05, FR-12; NFR-01; AC-11, AC-40; GD-17 · replay revocation
- **Action and fixture:** Persist receipt for `studentA`; revoke role/status/verification or disable Auth before same UUID replay; try `studentB` with same UUID.
- **Required assertions:** Current authorization denies before receipt/private request result; no question, ID or existence-sensitive detail leaks and no write occurs. `studentB` cannot retrieve `studentA` receipt.
- **Required evidence:** Callable/Firestore **E**; error redaction and Admin snapshots. Needs current-auth fixture.
- **Executed evidence recorded:** Independent production emulator denies a persisted-receipt same-UUID replay after sign-out, wrong role, suspended status, Auth disablement and freshly refreshed unverified token before any private result, with sanitized non-sensitive errors and exact unchanged request/key/receipt/summary Admin snapshots; restored authorization replays the original. A foreign Student using the same UUID gets an independent own request and cannot retrieve Student A's receipt or private request, while Student A records remain unchanged.
- **Closure:** All approved TC-012 current-auth, foreign-receipt, redaction and no-write E assertions satisfied on the local integrated tree.

### F01-TC-013 — PARTIAL

- **Trace:** **F01-TC-013** · FR-04, FR-05; NFR-02; AC-07–AC-10, AC-43; GD-01, GD-17 · transaction fault and coordination integrity
- **Action and fixture:** Seed normal keys/receipts; inject contention/abort and corrupt key pointing to missing, terminal or wrong-tuple request. Audit real legacy pending tuples, null-Mentor and `CLOSED` records before create enablement/schema strengthening; use a legacy parse fixture if found.
- **Required assertions:** Abort leaves no partial writes and UI stays uncertain. Corrupt key fails closed, never opportunistically clears or creates a second pending request. Audit reports duplicate/missing keys and null-Mentor/`CLOSED` records, blocks creation until tuple integrity is repaired, and specifies a read compatibility/migration path so authorized history does not crash or silently move legacy records into F01 lifecycle. If collection is empty, record that proof.
- **Required evidence:** Backend unit + Firestore **E**, source/audit **H**; snapshots and migration/parse report. Needs fault hook and real-data audit plan.
- **Executed evidence recorded:** Production emulator rejects representative corrupt pending key and preserves coordination state; synthetic integrity audit detects a nonaccepted conversation. Historical real-data records were not accessed.
- **Missing assertion/evidence or blocker:** Inject contention/abort with exact no-partial-write and uncertain UI evidence; exercise corrupt key pointing to missing, terminal and wrong-tuple requests. Read-only real legacy audit must report duplicate/missing keys, null-Mentor/CLOSED records or empty proof, block creation on defect, and document compatible historical read/migration path.

### F01-TC-014 — PARTIAL

- **Trace:** **F01-TC-014** · FR-06; AC-12, AC-16; GD-05, GD-12 · Student history/detail
- **Action and fixture:** Seed own requests with equal/unequal `createdAt`, both terminal states, plus `studentB` records. Open history and detail, load pages.
- **Required assertions:** Only `studentA` docs; descending time with document-ID tie-break and stable cursor; detail shows persisted Mentor, module, question, status and server `updatedAt` as decision time. No client-invented status/rejection reason.
- **Required evidence:** Frontend RTL **M** + actual query **E**; ordered IDs and DOM. Needs indexes/service.
- **Executed evidence recorded:** Real Student Rules-backed SDK history query returns 22 own rows across 20+2 pages in exact DESC time/ID order with 21 equal timestamps and excludes a fully foreign row; browser showed persisted detail.
- **Missing assertion/evidence or blocker:** Add accepted/rejected history and detail variants with M DOM proof of persisted Mentor/module/question/status/server decision time, no invented rejection reason, and exact cursor/ordered-ID reconciliation under E.

### F01-TC-015 — PARTIAL

- **Trace:** **F01-TC-015** · FR-06; AC-13; GD-12 · partial/empty/error history
- **Action and fixture:** Start pending listener, return zero first page, nonempty full page plus cursor, then fail next page/listener.
- **Required assertions:** Loading differs from confirmed empty; full page does not claim completion; Load more preserves and orders items; failed page is not empty and offers retry. Cursor reset after live membership/order change prevents skipped items.
- **Required evidence:** RTL **M** + query **E**; state and cursor assertions. Needs page service/index.
- **Executed evidence recorded:** Real Student 20+2 owner query proves equal-time cursor without duplicate/skip; RTL covers representative live first-page invalidation, loading/empty/page failure and retry.
- **Missing assertion/evidence or blocker:** Complete E/M zero-first-page, full-page-plus-cursor, later-page/listener failure and Retry sequence; prove loading versus confirmed empty, partial page not complete, retained ordered rows, and cursor reset after live membership change.

### F01-TC-016 — PARTIAL

- **Trace:** **F01-TC-016** · FR-06, FR-07; AC-14, AC-18; GD-03, GD-18 · historical metadata fallback
- **Action and fixture:** Own request has valid, inactive valid, missing, or malformed/unavailable catalogue metadata. Open Student history/detail and addressed Mentor detail.
- **Required assertions:** Verified code shown when available in both roles; missing/unresolvable shows exactly “Module information unavailable”, never guessed code or exposed canonical ID in UI; request itself remains readable.
- **Required evidence:** RTL **M** + adapter/unit; literal DOM assertions for both roles. Needs metadata fixtures.
- **Executed evidence recorded:** RTL tests unavailable and malformed module metadata in historical Student and Mentor details.
- **Missing assertion/evidence or blocker:** Complete valid, inactive valid, missing and malformed/unavailable catalogue module metadata adapter/M matrix in Student history/detail and Mentor detail; show verified code when available and exact unavailable fallback without guessed code or canonical ID.

### F01-TC-017 — PARTIAL

- **Trace:** **F01-TC-017** · FR-06; AC-15; GD-15 · real dashboard summary
- **Action and fixture:** Seed 2 pending, 1 accepted, 1 rejected plus foreign records; load Student dashboard and history, then decide one.
- **Required assertions:** Panel uses authorized persisted summary and recent requests, not `mockDashboard.requests`; `pending=2`, `accepted=1`, `rejected=1`, `open=3` matches own records, then changes exactly once with transition. Preview has View all without claiming all rows loaded. Backfill/empty audit precedes truthful zero.
- **Required evidence:** Frontend **M** + Firestore **E**; DOM, service spy, summary/record reconciliation. Needs summary migration.
- **Executed evidence recorded:** Dashboard and request summary adapters render persisted counts in representative fixtures; synthetic summary transitions are exercised in integration.
- **Missing assertion/evidence or blocker:** Seed 2 PENDING/1 ACCEPTED/1 REJECTED plus foreign records, prove own persisted 2/1/1/open3 dashboard/history versus mock data and once-only decision transition with M/E reconciliation; capture backfill/empty audit before truthful zero and View all without implying all rows loaded.

### F01-TC-018 — PARTIAL

- **Trace:** **F01-TC-018** · FR-07; AC-17; GD-12 · Mentor pending ordering
- **Action and fixture:** Seed addressed and foreign pending plus decided requests, equal timestamps and >20 rows. Run actual owner query and open inbox.
- **Required assertions:** Only `mentorA` pending, oldest first then document-ID ASC; bounded cursor yields each row once; foreign/decided absent.
- **Required evidence:** Actual Firestore query **E** + RTL **M**; ordered IDs and query constraints. Needs index.
- **Executed evidence recorded:** Real Mentor pending Rules-backed SDK query returns 22 own rows across 20+2 pages in exact ASC time/ID order with equal-time tie-break, no duplicate/skip or foreign/decided row; browser showed pending request.
- **Missing assertion/evidence or blocker:** Add M inbox DOM proof for addressed/foreign/decided/equal-time/>20 fixture and its exact ordered IDs/cursor, with E query constraints and no foreign or decided row.

### F01-TC-019 — PARTIAL

- **Trace:** **F01-TC-019** · FR-07; AC-18, AC-19; GD-10, GD-13 · Mentor detail and decided history
- **Action and fixture:** Seed own pending/accepted/rejected plus foreign request; use server Student name snapshot, not client identity data.
- **Required assertions:** Detail shows name, module, question, status/times but no Student email/UID. Accepted/rejected leave pending and remain in separate decided list/detail with deterministic order; foreign request absent.
- **Required evidence:** RTL **M** + query **E**; DOM and ordered IDs. Needs snapshot schema and views.
- **Executed evidence recorded:** RTL separates pending/decided lists and hides Student email; browser showed rejected detail; real SDK rejection moved a visible row pending-to-decided and excluded a foreign row.
- **Missing assertion/evidence or blocker:** Add accepted/rejected deterministic decided-order/tie and pending-removal E/M proof, plus persisted Student name snapshot, module/question/status/time detail DOM with no Student email/UID or foreign request.

### F01-TC-020 — PARTIAL

- **Trace:** **F01-TC-020** · FR-07; AC-20; GD-13 · Mentor list states
- **Action and fixture:** Pending listener, zero result, full first page with more, next-page failure, and denied subscription in separate runs.
- **Required assertions:** Loading, complete empty, partial, error and denied states differ; unseen records are not described as absent; retry resubscribes once without duplicate rows/listeners.
- **Required evidence:** RTL **M** + listener smoke **E**; DOM and subscribe counts. Needs listener harness.
- **Executed evidence recorded:** RTL tests loading, empty, denial/retry, stale callbacks and 20-row continuation failure/retry; real SDK pending 20+2 cursor and rejection listener shift retained ordered rows without duplication.
- **Missing assertion/evidence or blocker:** Real denied listener/page-failure trace and complete rendered loading/empty/error/retry state sequence remain.

### F01-TC-021 — PASS

- **Trace:** **F01-TC-021** · FR-08; NFR-02; AC-21; GD-05, GD-09 · valid rejection
- **Action and fixture:** Pending own request/key/summary and absent deterministic conversation; `mentorA` confirms reject.
- **Required assertions:** `REJECTED` read back, `updatedAt` advances once by server, key removed, summary decremented/incremented atomically; no conversation or reason/audit record; no later reactivation.
- **Required evidence:** Callable/Firestore **E** + RTL **M**; before/after docs and confirmation. Needs decision handler.
- **Executed evidence recorded:** Independent production emulator verifies REJECTED after Mentor confirmation, strictly advanced native server decision time bounded by the call, key release, exact summary delta, unchanged creation receipt and absent pair. Same-ID/new-ID replay and opposite outcome leave exact state unchanged with no reason field or audit write; focused RTL covers confirmation before the decision call and persisted rejected status.
- **Closure:** All approved TC-021 E and M rejection/once-only/timestamp/no-chat assertions passed locally.

### F01-TC-022 — PASS

- **Trace:** **F01-TC-022** · FR-08, FR-11; NFR-02; AC-21, AC-24, AC-32; GD-09 · anomalous pre-existing conversation on reject
- **Action and fixture:** Seed still-`PENDING` request/key/summary but deterministic `conversations/{helpRequestId}` exists. Attempt reject; separately seed `REJECTED` plus conversation and replay reject.
- **Required assertions:** Both calls fail with non-success integrity result and support signal. Pending branch leaves request/key/summary and unexpected conversation unchanged; rejected replay cannot report `already_decided`. No new state or client cleanup; no usable pending/rejected chat under integrated Rules.
- **Required evidence:** Real transaction/Rules **I**; exact before/after snapshots and denial. **F02 helper/schema/Rules required**.
- **Executed evidence recorded:** Independent production integration executes the real responder against PENDING plus unexpected deterministic conversation and then REJECTED plus conversation same-outcome replay; each returns integrity/support error before terminal success. Fresh Admin request/conversation/key/summary snapshots are byte-equivalent before/after, Rules deny Student chat in both branches, and focused UI renders support guidance.
- **Closure:** All approved TC-022 I anomalous reject/replay, support, no-write and no-chat assertions satisfied locally.

### F01-TC-023 — PASS

- **Trace:** **F01-TC-023** · FR-08; AC-23; GD-09 · same/opposite repeats and timestamp stability
- **Action and fixture:** Terminal accepted and rejected fixtures; addressed Mentor repeats same outcome with same/new UUID, then opposite outcome.
- **Required assertions:** Same outcome yields stored result without request time, summary, key or conversation write; opposite yields actual terminal status conflict and no mutation. UI shows actual status, not requested success.
- **Required evidence:** Callable/Firestore **E**, accepted branch **I**, RTL **M**; snapshots and DOM. Needs F02 for accepted path.
- **Executed evidence recorded:** Independent production integration tests both ACCEPTED and REJECTED terminal branches: same and new operation IDs return stored outcomes, opposite outcomes return actual terminal status, and exact request decision time, key, summary, receipt and conversation snapshots do not change. Passing focused RTL reports actual REJECTED conflict after an attempted acceptance without a false success announcement.
- **Closure:** All approved TC-023 E/I/M repeat, conflict, timestamp and DOM assertions passed locally.

### F01-TC-024 — PARTIAL

- **Trace:** **F01-TC-024** · FR-08, FR-11; NFR-02; AC-23, AC-34; GD-09 · concurrent decisions
- **Action and fixture:** Barrier-start accept/reject and accept/accept against one pending request; repeat ordering.
- **Required assertions:** One terminal transition wins; loser retries to same-outcome or conflict. Exactly one updated timestamp, one key release and summary transition. If accepted, one matching conversation; if rejected, none.
- **Required evidence:** Firestore race **I**; barrier trace and Admin snapshots. **Real F02 helper required**.
- **Executed evidence recorded:** Production integration dispatch-barrier races same/opposite decisions in three pairings; asserts one durable terminal, loser type, key release, summary deltas, timestamps and immutable replay.
- **Missing assertion/evidence or blocker:** Add controlled transaction precommit barrier and repeated accept/reject and accept/accept orderings; exact Admin snapshots must show one terminal timestamp, one key release/summary transition, and one matching pair only for accepted winner.

### F01-TC-025 — PARTIAL

- **Trace:** **F01-TC-025** · FR-09; AC-26, AC-27; GD-07 · later eligibility changes
- **Action and fixture:** Create valid pending, then deactivate/remove module or Mentor profile; separately revoke Mentor account eligibility. Decide.
- **Required assertions:** Profile/module change does not auto-reject or block active addressed Mentor's decision. Inactive/disabled Mentor cannot decide; request remains pending with key/summary intact and no reassignment/new status.
- **Required evidence:** Callable/Firestore **E**, accept variant **I**; snapshots. Needs auth and profile fixtures.
- **Executed evidence recorded:** Production integration allows addressed rejection after module/profile changes and denies a revoked Mentor without writes.
- **Missing assertion/evidence or blocker:** Add accepted-branch I/E decision after module/profile deactivation or removal, and inactive/disabled addressed Mentor denial with pending request/key/summary intact, no reassignment or new status.

### F01-TC-026 — PASS

- **Trace:** **F01-TC-026** · FR-08; AC-25; GD-11 · dormant close boundary
- **Action and fixture:** Try direct `closeHelpRequest` and search F01 UI for close/withdraw controls against each approved state.
- **Required assertions:** Callable remains unavailable/no transition; no F01 UI control; no F01-created `CLOSED` document or altered timestamps. Existing shared symbol can remain dormant.
- **Required evidence:** Callable **E** + RTL/source **M/H**; response, snapshots and UI audit. Needs F01 routes.
- **Executed evidence recorded:** Independent full integration rerun passed the production close-call matrix for PENDING, REJECTED, ACCEPTED and guessed IDs as Student/Mentor/guest, with exact request/key/summary/receipt/conversation/booking snapshots unchanged. RTL passed both-role, all-state absence of Close/Withdraw; source/route audit found no F01 close UI path and the callable remains dormant.
- **Closure:** All approved TC-026 E and M/H evidence classes satisfied on the local integrated tree.

### F01-TC-027 — PARTIAL

- **Trace:** **F01-TC-027** · FR-08, FR-12; NFR-01; AC-37, AC-39; GD-09 · decision authority
- **Action and fixture:** As Student, `mentorB`, signed-out, inactive/unverified/wrong-role or stale-email Mentor, decide `mentorA` pending ID (also guessed ID).
- **Required assertions:** Trusted callable denies before status disclosure; request/key/summary/conversation unchanged. Addressed eligible Mentor alone can decide.
- **Required evidence:** Callable/Firestore **E**; role matrix and redacted errors. Needs auth fixtures.
- **Executed evidence recorded:** Production emulator denies foreign decision plus addressed Mentor sign-out, wrong role, suspension, Auth disablement, unverified token and stored-email drift before pending decision and terminal replay, with sanitized error and exact no-write coordination snapshots; eligible accept/replay recovers.
- **Missing assertion/evidence or blocker:** Other account-state and refreshed-token variants, direct status-disclosure probes and full addressed-only evidence remain.

### F01-TC-028 — PARTIAL

- **Trace:** **F01-TC-028** · FR-08, FR-11; AC-24; GD-06 · uncertain Mentor action UI
- **Action and fixture:** Open pending detail; confirm accept, defer response or return transport error; change route/return; resolve stale opposite decision.
- **Required assertions:** One frozen action/UUID/request ID, checking state, no premature success. UI reads authorized request and F02 conversation state; retries same action if still pending; actual opposite terminal status is shown.
- **Required evidence:** RTL/deferred services **M**; call sequence and DOM. F02 read seam needed; mock does not prove integration.
- **Executed evidence recorded:** RTL covers pending decision conflict without premature success; production replay exists.
- **Missing assertion/evidence or blocker:** Lost decision reply using the same operation ID across reload and opposite-decision UI reconciliation.

### F01-TC-029 — PASS

- **Trace:** **F01-TC-029** · FR-08, FR-11; NFR-02, NFR-05; AC-22, AC-33, AC-36; GD-16 · atomic acceptance
- **Action and fixture:** Real F02 transaction provision helper and Rules; pending request/key/summary; addressed Mentor accepts.
- **Required assertions:** One commit yields `ACCEPTED` and exactly `conversations/{helpRequestId}` with required immutable parent, Student and Mentor from request; key released, summary updated. Fresh client reads confirm pair; no accepted-only intermediate durable state.
- **Required evidence:** Callable/Firestore/Rules **I**; transaction trace, Admin/client snapshots. **Approved F02 planning, real implementation and evidence block execution/release**; ownership approval is recorded.
- **Executed evidence recorded:** Independent production Auth/Firestore/Functions/Rules integration fresh-reads pending request/key/summary/creation receipt, then one Mentor acceptance with ACCEPTED parent and deterministic same-ID conversation, immutable Student/Mentor/parent, one shared native server timestamp, released key, exact summary transition and unchanged creation receipt. Student and Mentor Rules-backed SDK reads see both pair documents; outsider reads and direct writes deny. Source trace proves the real F02 tx.create is staged with parent/key/summary inside one Firestore runTransaction, and controlled provision fault before commit rolls back parent and pair with unchanged Admin snapshots.
- **Closure:** All approved TC-029 callable/Firestore/Rules I transaction-trace and Admin/client snapshot assertions satisfied on the local integrated tree. The approved row does not require a separate decision receipt or an internal pause hook.

### F01-TC-030 — PASS

- **Trace:** **F01-TC-030** · FR-11; NFR-02; AC-24, AC-34; GD-06, GD-16 · provision failure and lost reply
- **Action and fixture:** Inject F02 provision failure or transaction abort before commit; separately commit then drop callable reply and retry same decision.
- **Required assertions:** Failure leaves pending request/key/summary and no newly created conversation, with unresolved UI. Lost reply reconciles one accepted request/one conversation; repeat does not change timestamps or add docs.
- **Required evidence:** Real transaction fault **I** + UI **M**; before/after snapshots and response trace. **F02 fault seam required**.
- **Executed evidence recorded:** Independent real F02 provision-helper fault before Firestore commit rolls back request/key/summary with no conversation. A production Mentor accept then commits; the official client service seam discards its successful reply, and fresh Admin plus Student/Mentor Rules-backed reads prove one ACCEPTED request/same-ID conversation, key release, exact summary, unchanged creation receipt and server timestamp. Retry of the captured decision operation ID returns already_decided with byte-equivalent Admin state. Focused UI tests keep the mounted uncertain decision ID for retry and, after reload, withhold success/chat link until authoritative accepted parent and matching conversation arrive, without a second decision call.
- **Closure:** All approved TC-030 real transaction-fault I and UI M rollback/lost-reply/reconciliation assertions satisfied locally. Reply loss was simulated after the real callable result at the client seam, not by cutting network bytes; stale-PENDING-after-reload/new-UUID timing is not directly exercised.

### F01-TC-031 — PASS

- **Trace:** **F01-TC-031** · FR-11; NFR-02, NFR-05; AC-34, AC-36; GD-16 · exact per-request uniqueness
- **Action and fixture:** Accept two separate requests between same Student/Mentor, then concurrent repeated accept for one; probe attempt to create a second conversation with same parent under alternate ID.
- **Required assertions:** Exactly one conversation per request, two distinct conversations overall; alternate duplicate is rejected by F02 trusted logic/Rules or otherwise impossible by approved schema. No accepted request lacks a matching doc.
- **Required evidence:** Firestore/Rules **I**; collection scan and hostile attempt. **F02 uniqueness design required**.
- **Executed evidence recorded:** Independent production Auth/Firestore/Functions/Rules integration creates and accepts two distinct requests for the same Student/Mentor; two same-request accept callables cross a shared client dispatch barrier, with emulator executions overlapping and outcomes decided/already_decided. A full fixture collection scan proves exactly two deterministic request-ID conversations and no accepted request without a pair; every parent, participant, native timestamp, key, summary and receipt field is checked before/after replay. Student/Mentor Rules reads pass, alternate-ID/forged-parent direct writes deny with unchanged Admin snapshots, and trusted F02 validator rejects alternate/canonical-ID forged parents.
- **Closure:** All approved TC-031 Firestore/Rules I uniqueness, repeat/concurrency and hostile alternate-pair assertions satisfied locally. Transaction callback overlap was not instrumented; two callable executions began before either completed.

### F01-TC-032 — PASS

- **Trace:** **F01-TC-032** · FR-11, FR-12; NFR-01; AC-32, AC-41; GD-16 · parent-gated access
- **Action and fixture:** Pending, rejected, accepted requests; participants/nonparticipant attempt conversation get/list and message get/list/create via client SDK. Try direct client conversation create for pending/rejected parent, arbitrary conversation ID and forged participant array.
- **Required assertions:** Pending/rejected and foreign access denied even when array claims membership; arbitrary/client-created conversation denied; accepted parent with matching immutable IDs permits only authorized participants. Message access follows same parent gate. Admin snapshots show no hostile conversation/message write.
- **Required evidence:** Rules Emulator **I**; actual Rules decisions and parent snapshots. **F02 Rules/messages required**.
- **Executed evidence recorded:** Independent corrected Firestore Rules Emulator matrix verifies Student/Mentor/outsider pair and message get/list/create for PENDING, REJECTED and ACCEPTED parents, broad pair-list denial, and hostile pair create with pending/rejected/arbitrary IDs or forged members. Current role/status/email/token denials and nonempty before/after Admin parent/pair/message snapshots pass. The first fixture run failed because its snapshot helper returned undefined; that fixture was corrected and rerun 3/3.
- **Closure:** All approved TC-032 Rules R accepted-parent access, hostile write and no-mutation assertions passed locally.

### F01-TC-033 — PASS

- **Trace:** **F01-TC-033** · FR-11; AC-33, AC-35; GD-16 · immutable link and entry
- **Action and fixture:** Accepted request with conversation; Student and Mentor follow their accepted-context links; client tries alternate link/member mutation.
- **Required assertions:** Both reach same authorized conversation ID; stored `helpRequestId`, studentId, mentorId and membership remain request-derived and immutable; no F01 message UI is required.
- **Required evidence:** Frontend/Rules **I**, route **M**; URL, read and mutation-denial evidence. **F02 route/schema required**.
- **Executed evidence recorded:** Independent production Auth/Firestore/Rules tests prove both participant reads of the one request-ID pair with immutable helpRequestId, Student/Mentor and membership; alternate-ID pair creation and client member mutation deny with exact unchanged Admin state. Focused accepted-detail UI links only when strict pair is ready, and recorded Mentor/Student browser routes after account switch reach the same persisted conversation ID.
- **Closure:** All approved TC-033 I and M immutable same-link/entry and mutation-denial assertions satisfied locally.

### F01-TC-034 — PARTIAL

- **Trace:** **F01-TC-034** · FR-11; AC-22, AC-24, AC-36; GD-16 · corrupt accepted pair fails closed
- **Action and fixture:** Seed `ACCEPTED` without conversation, or mismatched existing conversation; retry accept and render decision result.
- **Required assertions:** No success/already-decided or chat link; integrity error/support signal, no request/conversation mutation. Release audit reports defect until repaired.
- **Required evidence:** Callable/Firestore **I**; snapshots, error and release-block record. **F02 schema/helper required**.
- **Executed evidence recorded:** Production replay rejects missing/mismatched accepted pair without mutation; RTL hides link for accepted-without-chat.
- **Missing assertion/evidence or blocker:** For accepted-without-pair and mismatched pair, prove no success/already-decided or chat link, exact no-mutation Admin snapshots and integrity/support result; release audit must report defect until repaired.

### F01-TC-035 — PASS

- **Trace:** **F01-TC-035** · FR-11, FR-12; NFR-01; AC-35, AC-41; GD-16 · F02 list-query feasibility
- **Action and fixture:** Seed mixed accepted/pending parents and foreign conversations; execute F02's actual participant list query/listener under parent-gated Rules.
- **Required assertions:** Authorized list returns only accepted own conversations or fails closed; broad/foreign list denied. If Rules cannot prove parent condition for query, F02-owned trusted paginated projection is tested for per-parent authorization and no leakage; no claim that a mock query passes.
- **Required evidence:** Rules/Functions **I**; query transcript or approved projection evidence. **F02 query design required**.
- **Executed evidence recorded:** Independent production Auth/Firestore/Rules integration rerun executes the actual F02 subscribeList adapter for both Student and Mentor against own accepted/pending, foreign accepted and own accepted missing-pair fixtures. Both bounded listeners emit only own ready/support accepted rows; pending and foreign pairs never appear. Broad, wrong-owner and foreign-pair queries deny under parent-gated Rules with unchanged Admin state.
- **Closure:** All approved TC-035 I actual participant-list query/listener and fail-closed access assertions satisfied locally.

### F01-TC-036 — PASS

- **Trace:** **F01-TC-036** · FR-12; NFR-01; AC-31, AC-40; GD-14 · owner get/list/listener
- **Action and fixture:** Verified active Student and Mentor participant; foreign Student/Mentor, guessed ID, wrong role/status/verification/stale email. Run direct get, owner-scoped bounded query and `onSnapshot`.
- **Required assertions:** Participant reads/listeners receive only own documents; every foreign/guessed/ineligible access denies without content/existence-sensitive result. Direct get and list policy agree.
- **Required evidence:** Rules Emulator/client SDK **E**; get/query/listener results. Implemented Rules and indexes required; ownership approval is recorded.
- **Executed evidence recorded:** Independent Firestore Rules Emulator/client SDK rerun covers participant direct get and bounded owner list/listener. Foreign Student/Mentor, guessed ID, stale role/status/email and unverified-token get/list/listener deny without private content or an existence-sensitive success; eligible owner reads return only own records.
- **Closure:** All approved TC-036 E get/query/listener and ineligible/foreign matrix assertions passed locally.

### F01-TC-037 — PASS

- **Trace:** **F01-TC-037** · FR-12; NFR-01; AC-31; GD-14 · broad query denial
- **Action and fixture:** As otherwise eligible participant, query whole collection, omit owner predicate, use wrong owner, or loosen limit; attach listener even when current collection has only own docs.
- **Required assertions:** Every query whose potential results include foreign requests is denied; actual owner/status/order query succeeds. Denial is not treated as empty success.
- **Required evidence:** Rules Emulator/client SDK **E**; query/listener traces. Needs final query/Rules alignment.
- **Executed evidence recorded:** Independent Firestore Rules Emulator/client SDK rerun proves broad/ownerless, wrong-owner, unbounded and limit-over-20 listeners deny after authoritative server evaluation even with own rows in the local cache. The valid owner/status/order bounded query succeeds under Rules and production pagination evidence.
- **Closure:** All approved TC-037 E broad-listener denial and valid bounded-owner query assertions passed locally.

### F01-TC-038 — PASS

- **Trace:** **F01-TC-038** · FR-12; NFR-01; AC-38; GD-02 · direct mutation/private paths
- **Action and fixture:** Client SDK attempts own/foreign request create, status/identity update, delete; reads/writes/lists receipt, tuple-key and summary paths, then own summary read.
- **Required assertions:** Request and coordination writes/reads denied; authorized own summary read only; Admin before/after snapshots unchanged. No browser can forge status or membership.
- **Required evidence:** Rules Emulator **E**; deny matrix and snapshots. Needs implemented F01 Rules; ownership approval is recorded.
- **Executed evidence recorded:** Independent Firestore Rules Emulator/client SDK rerun denies own and foreign request create, status/identity update and delete; receipt, tuple-key and summary collection list and read/write attempts deny. Own summary get succeeds and a nonempty Admin before/after snapshot of requests, receipts, keys and summaries is exact.
- **Closure:** All approved TC-038 E direct mutation/private-path/summary and no-write snapshot assertions passed locally.

### F01-TC-039 — PARTIAL

- **Trace:** **F01-TC-039** · FR-10, FR-12; NFR-01; AC-30, AC-40; GD-14 · revocation during read
- **Action and fixture:** Start owner listener; change authoritative `users/{uid}` status/role/email, then force protected read/reconnect and trusted replay. In a separate verification variant, revoke Auth email verification, refresh the ID token to carry unverified claims, then repeat.
- **Required assertions:** Subsequent Rules read/listen and callable deny under the changed user record or refreshed token; frontend clears private state and shows access guidance rather than empty/current success. Do not assert immediate Rules denial from an unrefreshed old token or instant detection on an idle page.
- **Required evidence:** Rules/Callable **E** + RTL **M**; denial, token/user fixture state, DOM and cleanup. Needs auth mutation/token-refresh fixture.
- **Executed evidence recorded:** Real production callable and Rules get deny after account role/status/stored-email or refreshed verification changes; RTL clears draft on sign-out, exact coordination snapshots remain unchanged.
- **Missing assertion/evidence or blocker:** Forced listener reconnect and complete refreshed-token/UI private-state matrix remain.

### F01-TC-040 — PARTIAL

- **Trace:** **F01-TC-040** · FR-10; AC-28; GD-14 · real-time membership
- **Action and fixture:** Student history/detail and Mentor pending/decided actual `onSnapshot` listeners open; create and decide a request.
- **Required assertions:** Persisted request appears, status/time updates without navigation; Mentor row leaves pending and enters decided, Student view follows. No stale duplicate row or manual refresh.
- **Required evidence:** Client SDK/Rules **E** + UI **M**; listener event sequence and DOM. Needs actual subscriptions/indexes.
- **Executed evidence recorded:** Real Rules-backed Student and Mentor list listeners observed a production rejection move one row from pending to decided, refill the pending first page and update Student status; key release and summary 22/0 to 21/1 were asserted.
- **Missing assertion/evidence or blocker:** Add simultaneous Student detail plus Mentor pending/decided listeners across create and accept/reject, with E event and M no-navigation DOM proof of persisted status/time, pending-to-decided migration and no stale duplicate or manual refresh.

### F01-TC-041 — PARTIAL

- **Trace:** **F01-TC-041** · FR-10; AC-29, AC-30; GD-14 · cleanup and cross-account race
- **Action and fixture:** Hold A callbacks/callable result, switch to B or sign out, unmount route, then deliver A results; separately fail subscription.
- **Required assertions:** A unsubscribe called, private A data clears, late A result cannot repopulate B. Failure/denial differs from complete empty and offers retry/access guidance; one live listener per visible page.
- **Required evidence:** RTL deferred mock **M** plus listener smoke **E**; unsubscribe/generation assertions. Needs session service.
- **Executed evidence recorded:** RTL covers foreign detail clearing and stale callbacks after listener denial.
- **Missing assertion/evidence or blocker:** Real cross-account held callback and complete failure/unsubscribe matrix.

### F01-TC-042 — PARTIAL

- **Trace:** **F01-TC-042** · FR-01, FR-04, FR-05; AC-08, AC-09; GD-08, GD-17 · submission feedback
- **Action and fixture:** Form has attempted different text while existing pending; separately uncertain timeout, server invalid selection, and valid confirmed result.
- **Required assertions:** Duplicate explicitly says new text was not delivered, keeps draft, links only own pending detail. Timeout keeps UUID/payload and checking; stale selection offers correction; only persisted success navigates/announces success.
- **Required evidence:** RTL **M**; exact call/DOM and draft assertions. Needs form/service.
- **Executed evidence recorded:** Focused form tests cover representative duplicate guidance, retained draft and uncertain operation ID.
- **Missing assertion/evidence or blocker:** Run M exact call/DOM matrix for changed-text duplicate with own pending link and undelivered text, timeout frozen UUID/payload/checking, invalid selection correction, and success only after authorized persisted result.

### F01-TC-043 — PARTIAL

- **Trace:** **F01-TC-043** · FR-07, FR-08; AC-20, AC-23, AC-24; GD-06, GD-09 · Mentor decision UX
- **Action and fixture:** Pending detail with confirmation, wrong/unchanged repeat, transient failure and concurrent opposite result.
- **Required assertions:** No action before confirmation; one intended action sent. Loading/checking/conflict/failure are distinct; buttons are disabled appropriately; actual terminal status shown; no false accepted announcement.
- **Required evidence:** RTL **M**; dialog, focus and call sequence. Needs Mentor UI.
- **Executed evidence recorded:** RTL covers disabled in-flight decision/conflict; browser acceptance and rejection confirmations settled, and Escape restored Reject focus.
- **Missing assertion/evidence or blocker:** Complete M confirmation-before-call, wrong/unchanged repeat, transient failure and concurrent opposite outcome sequence with one intended call, distinct loading/checking/conflict/failure, correct disabled buttons/focus, actual terminal status and no false accepted announcement.

### F01-TC-044 — PARTIAL

- **Trace:** **F01-TC-044** · NFR-03, NFR-04; AC-42 · accessibility and responsive function
- **Action and fixture:** Implemented Student form/history/detail and Mentor pending/decided/detail, populated/empty/loading/error; desktop and 320 px, keyboard and one screen reader/browser.
- **Required assertions:** Semantic labels/errors/status, visible focus, logical order, operable confirmation/retry/navigation, perceivable live updates, no clipped required data or horizontal page scroll; record WCAG 2.1 AA target observations and defects.
- **Required evidence:** Browser + assistive tech **H**; viewport/keyboard/screen-reader log and screenshots. **Implemented UI required**.
- **Executed evidence recorded:** Student and Mentor request history/detail rendered at 320 px without document overflow; browser form errors and two dialog focus loops were observed.
- **Missing assertion/evidence or blocker:** All mobile states, complete keyboard-only focus, zoom and real screen-reader observation.

### F01-TC-045 — PARTIAL

- **Trace:** **F01-TC-045** · NFR-07; AC-45 · HelpiNUS visual consistency
- **Action and fixture:** Side-by-side implemented screens and Student Dashboard, Mentor Dashboard, Mentor Profile, AppShell at laptop and 320 px; inspect empty, populated, loading/error/success states.
- **Required assertions:** Reused tokens, typography, spacing, cards, controls, nav/status conventions and clear affordances/hierarchy; no generic unstyled/oversized empty/text-only-action regressions. Record screenshots or detailed observations, fix material inconsistencies and reinspect.
- **Required evidence:** Browser/source **H**; comparison record and resolved-defect evidence. **Implemented UI required**.
- **Executed evidence recorded:** H desktop dashboard/discovery/form and mobile request/profile views inspected
- **Missing assertion/evidence or blocker:** Full side-by-side state/screenshot record

### F01-TC-046 — PARTIAL

- **Trace:** **F01-TC-046** · NFR-05, NFR-06; AC-36, AC-43, AC-44; GD-16 · evidence and handoff gate
- **Action and fixture:** After implementation, collect all focused/regression/Emulator/integrated/manual results, guides/log/feature ledger and ownership authorization record.
- **Required assertions:** Coverage status distinguishes planned, executed/pass/fail/blocked, `M` vs `E` vs `I` vs `H`. User/Developer Guides and handoff explain actual behavior, contract and limits. AC-36 remains blocked absent passing TC-029–035 real F02 evidence; no mock-only release claim.
- **Required evidence:** Read-only document/diff audit **H**; command logs, authorization reference, guide/handoff links. **Implementation and F02 required to close**.
- **Executed evidence recorded:** 91-case matrix, local independent suites, browser journey, guide and handoff links are recorded; unresolved rows remain conservatively classified.
- **Missing assertion/evidence or blocker:** Complete read-only H document/diff audit showing planned versus executed/pass/fail/blocked status and M/E/I/H distinctions, exact command/environment/outcome/ownership and guide/handoff coverage of actual behavior/limits; explicitly retain AC-36 as incomplete wherever TC-029–035 real F02 evidence is absent, with no mock-only release claim.

## F02: 45 approved cases

### F02-TC-001 — PASS

- **Trace:** **F02-TC-001** · AC-01 · FR-01
- **Action and fixture:** Eligible addressed Mentor accepts a real pending request through the production export.
- **Required assertions:** One commit produces `ACCEPTED` and exactly `conversations/{requestId}` with stored `id`, `helpRequestId`, Student/Mentor and ordered participants matching the request; both native conversation timestamps equal acceptance `updatedAt`. Pending key disappears and Student summary changes once; fresh authorized client reads see the pair. No accepted-only durable state.
- **Required evidence:** **I,E,R**; transaction trace and before/after Admin/client snapshots. Also executes F01-TC-029.
- **Executed evidence recorded:** Independently passed F01-TC-029 shared I/E/R production Auth/Firestore/Functions/Rules test starts from a real pending request and addressed Mentor export, then fresh-reads one ACCEPTED parent plus exactly conversations/{requestId} with matching stored IDs, Student/Mentor, ordered participants, equal native conversation timestamps and acceptance updatedAt, released pending key and one exact Student summary transition. Both authorized clients read the pair; outsider/direct mutation denies. Source traces the real F02 tx.create with request/key/summary in one Firestore transaction and the precommit fault rollback excludes an accepted-only durable state.
- **Closure:** All approved TC-001 I, E and R assertions are the same jointly executed transaction/read contract explicitly cross-referenced to F01-TC-029; independent logs and exact Admin/client snapshots satisfy this row.

### F02-TC-002 — PARTIAL

- **Trace:** **F02-TC-002** · AC-02 · FR-01
- **Action and fixture:** Throw from real provision helper before commit, abort/contend transaction, and separately fail commit.
- **Required assertions:** Every attempt leaves request `PENDING`, no new conversation, and key/summary unchanged; UI stays unresolved or unavailable, never accepted. No post-commit repair/outbox.
- **Required evidence:** **I,E,M**; injected fault trace and exact snapshots. Also F01-TC-030.
- **Executed evidence recorded:** Production provision-helper precommit fault and F01 rollback tests leave the parent PENDING with no pair; UI does not announce accepted on unresolved decision.
- **Missing assertion/evidence or blocker:** Separately inject provision throw, transaction abort/contention and failed commit through the real binding; compare exact PENDING request, absent pair, unchanged key/summary and unresolved UI after every fault, with no repair/outbox.

### F02-TC-003 — PARTIAL

- **Trace:** **F02-TC-003** · AC-03 · FR-01
- **Action and fixture:** Commit acceptance, drop callable reply, then restore network and reconcile from both role views.
- **Required assertions:** UI confirms only after authorized fresh request and strict matching conversation read; same decision ID/action retry makes no new write. `PENDING` permits same-action retry; opposite terminal status shows conflict; bad pair shows support.
- **Required evidence:** **I,E,M**; call sequence, DOM and timestamps. Also F01-TC-028/030.
- **Executed evidence recorded:** Production accepted pair and stable same-decision replay pass; client-seam postcommit reply loss and focused no-premature-success UI evidence exist.
- **Missing assertion/evidence or blocker:** Restore after committed reply loss and prove fresh authorized request/pair reconciliation in both role views, same-ID no-write retry, still-PENDING same-action retry, opposite terminal conflict and bad-pair support UI with exact timestamps.

### F02-TC-004 — PARTIAL

- **Trace:** **F02-TC-004** · AC-04 · FR-01
- **Action and fixture:** Invoke production F01 acceptance with its real F02 binding absent in a controlled harness.
- **Required assertions:** Explicit unavailable outcome; request/key/summary remain pending and no conversation is created. An injected test adapter cannot satisfy this case or release.
- **Required evidence:** **E,M,H**; production wiring inspection and snapshots.
- **Executed evidence recorded:** Direct handler with absent F02 binding returned unavailable and preserved pending snapshots.
- **Missing assertion/evidence or blocker:** Production-export wiring absence inspection, full UI feedback and complete request/key/summary/no-chat snapshots.

### F02-TC-005 — PARTIAL

- **Trace:** **F02-TC-005** · AC-05 · FR-02
- **Action and fixture:** Sequential and barrier-started same-outcome accepts, same/new F01 operation IDs, on one pending request; repeat accepted and rejected terminal decisions with same/new IDs and then opposite action.
- **Required assertions:** One accepted pair and one key/summary transition; accepted and rejected same-outcome replay return stored result without changing request/conversation timestamps or adding records. Each opposite replay returns actual terminal status conflict and UI displays that status, never the requested outcome. Strict pair validator runs before either accepted terminal result.
- **Required evidence:** **I,E,M**; race transcript, DOM and exact snapshots. Also F01-TC-023/024/031.
- **Executed evidence recorded:** Production acceptance proves one transaction-compatible pair; F01 race/replay tests exercise representative accepted and rejected terminal outcomes.
- **Missing assertion/evidence or blocker:** Complete sequential and barrier-started same/new-operation accept/reject replay matrix, one pair and key/summary transition, unchanged terminal timestamps/records, strict pair validation before accepted replay, and actual-status conflict DOM.

### F02-TC-006 — PARTIAL

- **Trace:** **F02-TC-006** · AC-06 · FR-02, FR-04
- **Action and fixture:** Accept two distinct requests for the same Student/Mentor; enter from each role and list.
- **Required assertions:** Two different deterministic conversation IDs, one per request; each link and list row reaches its own matched history, never a person-pair room.
- **Required evidence:** **I,R,M**; collection scan, route and content assertions. Also F01-TC-031/033.
- **Executed evidence recorded:** F01-TC-031 production scan proves two distinct request-ID pairs for the same Student/Mentor; Rules reject nonmatching pair/direct writes.
- **Missing assertion/evidence or blocker:** Open both distinct requests through both role list and detail routes and prove each link reaches its own matched history, never a shared person-pair room.

### F02-TC-007 — PARTIAL

- **Trace:** **F02-TC-007** · AC-07 · FR-02, FR-18
- **Action and fixture:** Reject normally; race accept/reject and accept/accept; seed a conversation before pending/rejected replay; try alternate conversation ID with the same parent. Separately change Mentor profile/module after request creation and revoke the Mentor's account eligibility before a decision.
- **Required assertions:** One F01 terminal result wins, opposite result reports actual conflict, rejected parent has no usable chat, and unexpected conversation fails closed. No alternate ID is created by trusted logic or direct SDK; key/summary/timestamps change only for the winner. Profile/module change alone does not decide or block the still-eligible addressed Mentor; revoked account cannot decide.
- **Required evidence:** **I,E,R**; barriers, hostile write, eligibility variants and snapshots. Also F01-TC-022–025/031/032.
- **Executed evidence recorded:** Production acceptance/race tests prove representative one-winner pair and Rules reject a corrupt timestamp; addressed Mentor rejection after profile/module changes succeeds.
- **Missing assertion/evidence or blocker:** Complete accept/reject and accept/accept race orderings, unexpected pending/rejected pair and alternate-ID integrity cases, later profile/module change versus revoked Mentor eligibility, with exact winner-only parent/key/summary/pair snapshots.

### F02-TC-008 — PARTIAL

- **Trace:** **F02-TC-008** · AC-08 · FR-03
- **Action and fixture:** Seed own `ACCEPTED` request lacking conversation; repeat accept and open list/detail.
- **Required assertions:** Replay yields integrity outcome, list retains a generic support-needed row, no chat link or fabricated doc, no request/status/time/key/summary mutation.
- **Required evidence:** **I,E,M**; persisted diff and DOM. Also F01-TC-034.
- **Executed evidence recorded:** Production accepted-pair and replay integrity checks pass representative corruption; focused UI tests show a support row for a missing pair.
- **Missing assertion/evidence or blocker:** Seed ACCEPTED parent without pair, replay production decision and assert integrity failure with exact unchanged parent/status/time/key/summary and no pair; both role list/detail must show generic support without chat link or mutation.

### F02-TC-009 — PARTIAL

- **Trace:** **F02-TC-009** · AC-09 · FR-03, FR-04
- **Action and fixture:** Seed wrong stored `id`, parent, participant order/identity or timestamp alongside a healthy accepted pair; open list and direct detail.
- **Required assertions:** Strict validator rejects each bad pair, exposes no corrupt fields, and keeps healthy row/detail usable. Denied conversation get is reclassified as support only after the own parent/session is revalidated; parent denial clears state.
- **Required evidence:** **I,R,M**; anomaly matrix, DOM and unchanged snapshots. Also F01-TC-034.
- **Executed evidence recorded:** Rules reject representative malformed accepted pairs; actual owner query and broad-query denial pass.
- **Missing assertion/evidence or blocker:** Test wrong stored pair ID, parent, participant order/identity and timestamp beside healthy pair, both role list/direct detail privacy, unchanged snapshots and own-parent revalidation before treating denied get as support.

### F02-TC-010 — PARTIAL

- **Trace:** **F02-TC-010** · AC-10 · FR-03
- **Action and fixture:** Try client repair/create, guessed direct route, foreign/missing ID, and alternate-parent document; retry accepted decision on corrupt pair.
- **Required assertions:** No client or callable repair, no usable chat or existence-sensitive difference for foreign/missing IDs, and all records unchanged. Real-data pre-enable audit separately reports accepted-without-pair, mismatches and legacy alternate IDs; a needed backfill remains separately reviewed.
- **Required evidence:** **I,R,M,H**; deny matrix, snapshots and audit report. Also F01-TC-034.
- **Executed evidence recorded:** Rules and production replay deny representative corrupt/alternate pairs; rejected direct chat URL showed only support guidance; both synthetic accepted/rejected audits were clean.
- **Missing assertion/evidence or blocker:** Guessed foreign/missing routes, every no-repair snapshot and audit of real legacy/accepted-without-pair data.

### F02-TC-011 — PARTIAL

- **Trace:** **F02-TC-011** · AC-11 · FR-04, FR-05
- **Action and fixture:** Open both role lists with own/foreign accepted, pending/rejected and own corrupt pairs.
- **Required assertions:** Only own accepted ready/support rows; ready rows show role-correct other-party name, module and request context. No message preview, unread count, foreign content or cross-user `users` read.
- **Required evidence:** **R,M**; actual role query and DOM. Also F01-TC-035.
- **Executed evidence recorded:** Actual bounded owner query and component list paging pass; F01-TC-035 executes the real adapter against mixed accepted/pending/foreign pair fixtures with own ready/support rows.
- **Missing assertion/evidence or blocker:** Complete both-role list DOM for own/foreign accepted, pending/rejected and corrupt pairs with historical other-party name, module/request context, no preview/unread/foreign content and no cross-user users read.

### F02-TC-012 — PARTIAL

- **Trace:** **F02-TC-012** · AC-12 · FR-04, FR-07
- **Action and fixture:** Follow Student and Mentor accepted-request detail links; inspect pending/rejected links and direct route.
- **Required assertions:** Both accepted links resolve to the same request-ID conversation only after pair verification; pending/rejected lack usable chat entry. Direct route runs the same parent validator and role guard.
- **Required evidence:** **I,R,M**; routes, query trace and rendered state. Also F01-TC-033.
- **Executed evidence recorded:** Rules deny malformed accepted pair and focused component list shows a support row without a chat link.
- **Missing assertion/evidence or blocker:** Prove accepted matched pair links for both roles, pending/rejected parents expose no chat link, and every direct route validates the exact same request-ID pair with support/denial on corruption.

### F02-TC-013 — PARTIAL

- **Trace:** **F02-TC-013** · AC-13 · FR-05, FR-06
- **Action and fixture:** Seed 21+ own accepted requests with equal/unequal `updatedAt`, foreign rows and 21st older row; page both roles, then send on an older chat.
- **Required assertions:** Actual owner/status query is `updatedAt DESC, documentId DESC`, bounded to 20 plus at most a separate `limit(1)` probe. Native timestamp+ID cursor yields every own row once; Load more reaches older rows. Send does not change request/conversation acceptance time or row order. Required composite indexes serve both roles.
- **Required evidence:** **R,E,M**; query/index trace, ordered IDs and snapshots. Also F01-TC-035.
- **Executed evidence recorded:** Bounded own accepted-parent Rules query and existing cursor tests pass representative pages.
- **Missing assertion/evidence or blocker:** Seed 21+ own accepted requests with equal/unequal native updatedAt plus foreign and older row, verify both-role DESC time/ID 20+probe query/index/cursor and Load more once-only reachability, then prove older-chat send never reorders list or acceptance timestamps.

### F02-TC-014 — PARTIAL

- **Trace:** **F02-TC-014** · AC-14 · FR-05
- **Action and fixture:** Hold owner list `onSnapshot` open, accept a new request from another client, then add a foreign request.
- **Required assertions:** New own row arrives without refresh; no foreign row, duplicate or reordering of existing rows. First-page shift and older-page merge retain loaded IDs.
- **Required evidence:** **L,R**; two-client event sequence and ordered IDs.
- **Executed evidence recorded:** Two authenticated SDK clients observed a new accepted owner row and excluded a foreign row under Rules without refresh.
- **Missing assertion/evidence or blocker:** First-page shift and older-page merge with ordered IDs, duplicates and stable cursor proof.

### F02-TC-015 — PARTIAL

- **Trace:** **F02-TC-015** · AC-15 · FR-06, FR-23
- **Action and fixture:** Drive initial loading, authorized zero, partial page, exhausted page, missing/malformed pair, index/network failure and Retry.
- **Required assertions:** Each state has distinct visible text/action; support row has no chat link; partial/error never says complete empty. Retry preserves healthy rows and does not multiply subscriptions.
- **Required evidence:** **M,R**; DOM, listener counts and actual error path.
- **Executed evidence recorded:** Focused component route-change test drops stale detail and existing list tests distinguish some loading/error states.
- **Missing assertion/evidence or blocker:** Drive initial loading, authorized zero, partial/exhausted, missing/malformed pair, index/network failure and Retry through actual error paths; assert distinct DOM, no chat link on support row, healthy-row retention and stable subscription counts.

### F02-TC-016 — PARTIAL

- **Trace:** **F02-TC-016** · AC-16 · FR-07
- **Action and fixture:** Open valid Student/Mentor details with request title, question, module metadata and saved messages; include missing/inactive module metadata.
- **Required assertions:** Other-party historical name and authoritative request context match parent; available module label comes from module adapter and unavailable metadata has non-invented fallback. History belongs only to selected request.
- **Required evidence:** **M,R**; DOM and service/read assertions.
- **Executed evidence recorded:** Browser showed authoritative accepted request title/module/other-party context and saved history; RTL metadata fallback exists.
- **Missing assertion/evidence or blocker:** Both-role missing/inactive metadata and exact historical name/question attribution under Rules.

### F02-TC-017 — PARTIAL

- **Trace:** **F02-TC-017** · AC-17 · FR-07, FR-16
- **Action and fixture:** While detail is open, revoke/delete parent or current participant eligibility; hold one callback and one callable reply.
- **Required assertions:** On detected denial, private detail, composer, pending text and subscriptions clear; no stale message or existence-sensitive error survives. Late outputs cannot repopulate state.
- **Required evidence:** **R,E,M**; denial, unsubscribe and DOM traces.
- **Executed evidence recorded:** Rules revoke on changed user role and focused denial tests clear private detail after representative callbacks.
- **Missing assertion/evidence or blocker:** While detail is open, revoke/delete parent or participant eligibility, hold callback and callable reply, then prove private detail/composer/pending text/subscriptions clear on denial and late outputs cannot repopulate.

### F02-TC-018 — PARTIAL

- **Trace:** **F02-TC-018** · AC-18 · FR-08, FR-22
- **Action and fixture:** Seed >40 messages; open history and keyboard-activate Load earlier through exhaustion; inject page failure.
- **Required assertions:** Initial and each older live query is bounded to 20 and oldest-to-newest in display; all authorized records reachable. Focus and scroll anchor remain sensible; loading, truly empty, partial, exhausted and failed states differ.
- **Required evidence:** **R,M,H**; query limits/order, keyboard and scroll observations.
- **Executed evidence recorded:** Production Rules-backed message listener/cursor tests cover a bounded 20-message first window and a 25-message equal-time fixture with an older page; focused DOM tests exercise Load earlier and saved-row continuity. The existing browser run did not cover the approved >40-message history or keyboard paging sequence.
- **Missing assertion/evidence or blocker:** Seed >40 saved messages and traverse every bounded 20-item older page through exhaustion under Rules; assert all IDs/order and distinct loading, empty, partial, exhausted and failed DOM states, plus required H keyboard focus/scroll observation.

### F02-TC-019 — PARTIAL

- **Trace:** **F02-TC-019** · AC-19 · FR-08, FR-12
- **Action and fixture:** Save body and receipt, navigate away, refresh, then sign in later as same eligible actor; separately leave only a local pending bubble.
- **Required assertions:** Persisted body/readAt returns from server; local bubble alone is never historical saved evidence. Every loaded older page continues receiving later receipt updates while open and releases its listener on exit.
- **Required evidence:** **E,R,L**; server snapshots and page-listener trace.
- **Executed evidence recorded:** Production send persisted and two authenticated SDK message listeners converged without refresh; two-page read-receipt integration already observes an older loaded page's live receipt update and unsubscribe, and browser cross-login saw saved body.
- **Missing assertion/evidence or blocker:** Fresh server body/readAt after navigate, refresh and later same-account sign-in, plus explicit exclusion of a local-only pending bubble from saved history remain; re-audit the existing older-page listener and unsubscribe trace against the final page state.

### F02-TC-020 — PASS

- **Trace:** **F02-TC-020** · AC-20 · FR-08, FR-09
- **Action and fixture:** Seed equal native timestamps and disparate IDs across page boundaries; force live-window shift and reconnect gap.
- **Required assertions:** Both roles and refreshed view sort by `(createdAt, messageId)` oldest-to-newest, each ID once. Shift retains subscribed saved rows; a gap is marked partial and filled by bounded pages before continuous-history claim.
- **Required evidence:** **R,M,L**; ordered ID sequence and listener/page trace.
- **Executed evidence recorded:** Independent production two-client Rules-backed tests separately prove 25 equal-native-time saved IDs plus live insertion/older cursor merge with exact oldest-to-newest 26-ID uniqueness, and offline disconnect/reconnect convergence. A focused deferred DOM test first reproduced first-page shift loss, then verified retained saved row, stale gap while bridge pending, bounded bridge merge, no duplicate, fresh Mentor entry and pagination with authoritative time-and-ID order.
- **Closure:** All approved TC-020 R, M and L tie, shift, reconnect, role and bounded gap assertions satisfied locally.

### F02-TC-021 — PARTIAL

- **Trace:** **F02-TC-021** · AC-21 · FR-09, FR-13
- **Action and fixture:** Start several sends; resolve callable/listener/receipt callbacks out of order.
- **Required assertions:** Unresolved bubbles remain after saved history in local submission order. Once server persistence is established, each ID collapses to one row at authoritative time+ID position; no client-clock chronology.
- **Required evidence:** **M,E**; deferred event transcript and saved IDs.
- **Executed evidence recorded:** Production tests persist messages with authoritative server IDs/timestamps and focused page continuity covers a bounded live-window bridge.
- **Missing assertion/evidence or blocker:** Start several sends and defer callable, listener and receipt callbacks in different orders; assert unresolved bubbles remain after saved history in local submission order, then collapse each saved ID once at authoritative server time+ID position with no client-clock ordering, using M transcript and E saved IDs.

### F02-TC-022 — PARTIAL

- **Trace:** **F02-TC-022** · AC-22 · FR-09, FR-14
- **Action and fixture:** Reload with one saved and one unresolved retry record, then reconnect to live pages.
- **Required assertions:** Records reconcile by original message IDs, one confirmed row per saved ID, unresolved row retained until server check; no local/listener duplicate.
- **Required evidence:** **M,E,R**; session record, server read and DOM.
- **Executed evidence recorded:** RTL restored one saved and one unresolved intention and prevented duplicate confirmed row.
- **Missing assertion/evidence or blocker:** Emulator server proof, reconnect/live-page merge and complete Rules evidence.

### F02-TC-023 — PASS

- **Trace:** **F02-TC-023** · AC-23 · FR-10, FR-11
- **Action and fixture:** Student and Mentor each send valid outer-spaced, multiline text through authenticated callable.
- **Required assertions:** Exactly one message under correct conversation per new canonical opaque UUID; sender comes from Auth, `createdAt` is native server time, `readAt` starts null, normalized body retains internal whitespace. Request, key, summary and conversation acceptance time do not change.
- **Required evidence:** **U,E,R**; callable response and exact snapshots.
- **Executed evidence recorded:** Independent shared-unit tests prove the UUID and outer-trim body contract; production callable/Firestore tests send as both Student and Mentor and fresh-read exactly one message per fresh UUID under the accepted conversation, Auth-derived sender, server Timestamp, null readAt and exact inner whitespace. Exact request/key/summary/receipt/conversation snapshots stay unchanged after each send, while Rules deny direct message creation.
- **Closure:** All approved TC-023 U, E and R assertions satisfied on the local integrated tree.

### F02-TC-024 — PASS

- **Trace:** **F02-TC-024** · AC-24 · FR-10
- **Action and fixture:** Test empty/whitespace, malformed input, 4,000 and 4,001 normalized Unicode code points including supplementary characters, inner whitespace, and direct SDK message create.
- **Required assertions:** UI and callable use one outer-`trim`/code-point policy: invalid has field/argument error and no document; boundary and valid Unicode persist exactly. Direct create always denies under Rules, including otherwise valid body, so it cannot bypass callable policy.
- **Required evidence:** **U,M,E,R**; boundary matrix and zero-write snapshots.
- **Executed evidence recorded:** Independent shared-unit and focused frontend tests prove one outer-trim/code-point policy for empty/whitespace, 4000/4001 mixed and supplementary Unicode, and preserved internal whitespace. Production callable/Firestore tests persist exact valid body/Timestamp, reject empty, whitespace, 4001 and malformed values with invalid-argument and exact zero-write Admin parent/key/summary/pair/message snapshots. Student and Mentor direct SDK message creation denies for valid and invalid bodies under Rules with the same unchanged snapshots.
- **Closure:** All approved TC-024 U, M, E and R boundary and no-write assertions satisfied on the local integrated tree.

### F02-TC-025 — PARTIAL

- **Trace:** **F02-TC-025** · AC-25 · FR-10
- **Action and fixture:** Send literal `<script>`-like and multiline text; view both roles and reload.
- **Required assertions:** DOM contains text, never executable markup; line breaks and internal spacing remain readable, with no HTML/Markdown interpretation.
- **Required evidence:** **M,H**; DOM assertion and browser observation.
- **Executed evidence recorded:** Browser sent literal script-like text, reloaded and verified escaped paragraph HTML with no injected script; focused DOM rendering checks pass a representative role.
- **Missing assertion/evidence or blocker:** Complete both-role multiline/literal markup and internal-spacing DOM assertions after reload, with no HTML/Markdown interpretation, plus the approved H browser observation of readable line breaks.

### F02-TC-026 — PASS

- **Trace:** **F02-TC-026** · AC-26 · FR-11, FR-18
- **Action and fixture:** Forge sender, timestamp, request/parent, membership and extra fields in callable and direct SDK attempts.
- **Required assertions:** Callable rejects or ignores client authority as contract requires; Rules deny direct writes. No hostile message or changed parent fields; authorized send still derives identity/time from server.
- **Required evidence:** **U,E,R**; auth/argument matrix and snapshots.
- **Executed evidence recorded:** Independent shared strict-wire tests reject forged authority fields; production callable tests reject forged sender, timestamp, readAt, parent/request, membership and extra fields for Student and Mentor, and reject a foreign parent without writes. Direct SDK forged pair/message writes deny under Rules. Exact Admin request/key/summary/pair/foreign-parent/message snapshots remain unchanged after every hostile attempt, while valid sends fresh-read Auth-derived sender and native server time.
- **Closure:** All approved TC-026 U, E and R auth/argument/direct-write and no-mutation assertions satisfied on the local integrated tree.

### F02-TC-027 — PASS

- **Trace:** **F02-TC-027** · AC-27 · FR-11, FR-18
- **Action and fixture:** Client SDK tries conversation create/update/delete, message create/update/delete, receipt-field update and forged participant array.
- **Required assertions:** All prohibited writes denied; immutable parent/participants/body/readAt unchanged. Trusted receipt callable alone may update only readAt under its separate case.
- **Required evidence:** **R**; before/after Admin snapshots. Also F01-TC-032/033.
- **Executed evidence recorded:** Independent production SDK/Rules test denies conversation create/update/delete, forged participants, message create/update/delete, body/sender/readAt mutation as Student, Mentor and outsider; exact Admin parent/pair/message/summary snapshots and absence of forged documents are asserted after each actor.
- **Closure:** All approved TC-027 Rules R and before/after Admin snapshot assertions satisfied on the local integrated tree.

### F02-TC-028 — PARTIAL

- **Trace:** **F02-TC-028** · AC-28 · FR-11, FR-17
- **Action and fixture:** Invoke production acceptance, send and acknowledgement directly as signed-out, outsider, wrong-role, inactive, disabled, unverified or stale-email actors. Include synthetic secret sentinels in message text and foreign fixture fields while capturing callable/client logs and surfaced errors.
- **Required assertions:** Admin-SDK handlers independently check current Auth/user/accepted parent before write or private result; unauthorized target IDs get existence-safe denial and all documents remain unchanged. Neither logs nor errors contain message bodies, foreign document content or full private retry records.
- **Required evidence:** **I,E,M**; role matrix, sanitized log/error capture and snapshots.
- **Executed evidence recorded:** Production emulator denies status/role/stale-email/Auth-disabled/unverified message send and receipt with unchanged message snapshots.
- **Missing assertion/evidence or blocker:** Complete signed-out and refreshed-token role/status/Auth revocation for acceptance, send, receipt and same-ID replay, with exact unchanged pair/message/coordination snapshots, non-sensitive errors and synthetic private-body sentinel absent from server/client logs.

### F02-TC-029 — PASS

- **Trace:** **F02-TC-029** · AC-29 · FR-12
- **Action and fixture:** Keep two eligible client sessions on one validated chat; alternate persisted sends, include equal-time fixture and older loaded page.
- **Required assertions:** Both receive newly saved messages via actual Firestore listeners without refresh and converge on same IDs/order/body. A local pending bubble does not count; disconnect is reported as stale/uncertain.
- **Required evidence:** **L,R,E**; two-client event and persistence trace.
- **Executed evidence recorded:** Independent production two-client Firebase Auth/Firestore/Functions/Rules test holds actual Student/Mentor onSnapshot listeners, alternates persisted sends and checks identical IDs/order/body without refresh. A 25-message equal-time fixture plus live insertion and older cursor yields 26 unique ordered rows; Student disableNetwork produces fromCache, Mentor sends offline, and Student reconnects to exact server convergence. Adapter regression tests first reproduced silent cached/pending-write snapshots, then verify stale signaling and no optimistic confirmation; component regression preserves authorized saved transcript with stale feedback on transient detail failure while permission denial clears it.
- **Closure:** All approved TC-029 L, R and E two-client event/persistence/disconnect assertions satisfied locally. No simultaneous two-browser H observation is claimed; H is not an approved TC-029 evidence class.

### F02-TC-030 — PASS

- **Trace:** **F02-TC-030** · AC-30 · FR-12, FR-20, FR-21
- **Action and fixture:** Recipient views a saved incoming message; acknowledge through production callable; repeat after navigation and for an older loaded sender message.
- **Required assertions:** One persisted `readAt` set by recipient and unchanged on replay; sender changes live from Sent to Read only after observed persistence, including older loaded page. Re-entry retains Read; received bubble has no sender ticks.
- **Required evidence:** **E,R,L,M**; message snapshots, listener/DOM sequence.
- **Executed evidence recorded:** Independent production two-client Auth/Firestore/Functions/Rules test holds recent and older bounded message listeners while Mentor acknowledges two saved incoming Student messages. Each native readAt is persisted once, both clients observe the exact timestamp live, and replay/navigation/re-entry leave it unchanged; direct SDK readAt edits deny with exact Admin parent/key/summary/pair/message snapshots. Focused DOM tests hold sender Sent until the persisted listener event, then show Read, retain Read for older loaded and re-entered messages, and omit sender ticks on the recipient bubble.
- **Closure:** All approved TC-030 E, R, L and M persisted receipt, listener and DOM-sequence assertions satisfied on the local integrated tree.

### F02-TC-031 — PASS

- **Trace:** **F02-TC-031** · AC-31 · FR-13, FR-19
- **Action and fixture:** Commit send then drop reply; press Retry while same-ID listener/server read may arrive; race concurrent same-ID calls. Separately fail deletion of the local retry key after confirmation, then restore.
- **Required assertions:** Question-mark/Retry persists until authoritative same-ID confirmation; one stored message and original `createdAt`, then Sent/Read as stored. Replay rechecks current eligibility and never creates another ID or timestamp. Failed key cleanup leaves a record that restore rechecks by the same ID and removes when possible, without redispatching a duplicate intention.
- **Required evidence:** **E,R,M**; race trace, storage fault, snapshots and status DOM.
- **Executed evidence recorded:** Independent production emulator serializes concurrent same-ID sends, then commits a real send whose client result is discarded; fresh Rules-backed server read and same-ID replay retain exactly one message and original native Timestamp with exact Admin parent/key/summary/pair/message snapshots, while direct overwrite denies. Focused UI tests race the listener and Retry server read, retain uncertain feedback until authoritative saved evidence, then show Sent; a local retry-key deletion fault keeps the record, and remount rechecks that same server ID and cleans up without duplicate dispatch.
- **Closure:** All approved TC-031 E, R and M race/storage/status/no-duplicate assertions satisfied locally. Reply loss was simulated at the client seam after real commit, not by cutting network bytes.

### F02-TC-032 — PASS

- **Trace:** **F02-TC-032** · AC-32 · FR-13
- **Action and fixture:** Drop reply before commit; keep client offline, then restore network and return to eligible parent.
- **Required assertions:** Cached absence does not authorize retry. `getDocFromServer` proves same ID absent and current access valid before automatic same-ID callable retry; exactly one message eventually persists. If server proof remains unavailable, UI stays uncertain.
- **Required evidence:** **E,R,M**; network/server-read ordering and snapshots.
- **Executed evidence recorded:** Independent review of focused RTL and production Rules-backed offline/reconnect emulator evidence verifies cached absence cannot authorize retry, offline server read fails while the original retry ID/body and uncertain UI remain, and reconnect proves current accepted parent/pair plus server message absence before one same-ID send. Exact persisted message/time and unchanged coordination snapshots survive replay; affected focused RTL passed.
- **Closure:** All approved TC-032 E/R/M offline server-proof ordering, no premature resend and one-message persistence assertions passed locally.

### F02-TC-033 — PASS

- **Trace:** **F02-TC-033** · AC-33 · FR-13
- **Action and fixture:** Revoke eligibility before manual/automatic replay; reuse saved ID with changed body/actor in same path; attempt official-client retarget to another request.
- **Required assertions:** Recheck denies before private replay, no stale success. Same-path divergent content/identity is definitive ID conflict without overwrite; client rejects retarget. Explicit edited new intention gets new UUID and valid parent authorization.
- **Required evidence:** **E,R,M**; same-ID and access matrix, unchanged snapshots.
- **Executed evidence recorded:** Independent production Auth/Firestore/Functions emulator and Rules tests revoke Student status or Auth before same-ID replay, deny server get/direct write and private callable result with exact unchanged Admin parent/pair/message/coordination snapshots; changed body or actor on the same path returns definitive already-exists without overwrite or timestamp change. Restored original replay is stable and an edited new UUID sends only on a second authorized parent. Focused frontend tests prove automatic/manual current-auth recheck and call order, denial cleanup, definitive Failed for mismatched saved body/sender, and official-client retarget rejection. The mismatched saved-content UI regression was reproduced red and corrected.
- **Closure:** All approved TC-033 E, R and M access/conflict/retarget/new-intention assertions satisfied on the local integrated tree.

### F02-TC-034 — PARTIAL

- **Trace:** **F02-TC-034** · AC-34 · FR-14, FR-22
- **Action and fixture:** Start multiple independently keyed sends, force sending/unknown/definitive-failure outcomes, navigate and refresh same browser session. Seed malformed/tampered version, UID, parent, ID and body records before restore; capture client logs with a synthetic body sentinel.
- **Required assertions:** Each valid `sessionStorage` record preserves UID, request, ID, normalized body, local order and state; restore waits for verified session and parent, then recovers each separately. Malformed or cross-account records fail closed with no dispatch or disclosure to another account and with recovery guidance. Logs omit the body sentinel and full retry record. Sending/uncertain/failed/recovered feedback remains keyboard accessible. No private body in `localStorage`.
- **Required evidence:** **M,E,H**; storage/call ordering, tamper matrix, sanitized log, DOM and keyboard observation.
- **Executed evidence recorded:** Focused retry UI/storage tests preserve representative uncertain intention across remount and prevent duplicate send.
- **Missing assertion/evidence or blocker:** Exercise multiple independently keyed sending/unknown/definitive-failure and recovery intentions through navigation/refresh; tamper version, UID, parent, ID and body records; prove per-intention ordering/feedback, no cross-account disclosure/dispatch, no private body in localStorage/log sentinel, and required H keyboard observation.

### F02-TC-035 — PASS

- **Trace:** **F02-TC-035** · AC-35 · FR-15
- **Action and fixture:** Make per-intention storage write or readback fail, or collide with existing key, while earlier unresolved records exist.
- **Required assertions:** No new callable dispatch; earlier records remain byte-for-byte intact and recoverable; UI pauses new submissions with guidance. No fixed pending-count cap or oldest-record eviction.
- **Required evidence:** **M**; storage fault spy, preserved records and DOM.
- **Executed evidence recorded:** Independent frontend rerun covers storage write/readback faults and key collisions with earlier unresolved records, byte-for-byte preservation and recovery of prior records, rollback of newly written key on failed readback, no fixed pending-count cap or eviction, and zero new callable dispatch. Component UI pauses new submissions with storage guidance until reload.
- **Closure:** All approved TC-035 M storage-fault, preservation, no-eviction and DOM assertions satisfied locally.

### F02-TC-036 — PASS

- **Trace:** **F02-TC-036** · AC-36 · FR-14, FR-16
- **Action and fixture:** Sign out, switch account, lose role or swap service with private pending records; deliver held old callbacks.
- **Required assertions:** All F02 retry keys/owner marker and in-memory text are removed on detected change; new account cannot see/retry old body. Ordinary same-account navigation/refresh retains recoverable records.
- **Required evidence:** **M,R**; storage scan, unsubscribe and DOM.
- **Executed evidence recorded:** Independent focused component and corrected Rules reruns cover sign-out, account switch, same-UID role/status change and service swap: retry owner/key/body and in-memory private content clear, held callbacks cannot restore them, and a new account cannot dispatch the old send. Same-account remount retains unresolved intentions; Rules deny changed current eligibility.
- **Closure:** All approved TC-036 M/R storage, unsubscribe, DOM and current-access assertions passed locally.

### F02-TC-037 — PARTIAL

- **Trace:** **F02-TC-037** · AC-37 · FR-16, FR-23
- **Action and fixture:** Fail first message listener, then a later loaded page listener, then recover while same account remains eligible.
- **Required assertions:** Initial failure never appears as empty. Previously loaded data is visibly stale/partial with Retry; healthy pages remain identifiable. Reconnect fills any gap and revalidates eligibility before calling data live.
- **Required evidence:** **R,M**; listener fault and DOM sequence.
- **Executed evidence recorded:** Component stale listener and Retry paths exist;
- **Missing assertion/evidence or blocker:** first/later-page fault recovery trace.

### F02-TC-038 — PARTIAL

- **Trace:** **F02-TC-038** · AC-38 · FR-17
- **Action and fixture:** Suspend/deactivate or change role/email in the authoritative `users/{uid}` record; separately disable Auth, unverify, change verified Auth email or sign out after valid history. Try later get/list/listen/send/receipt, then restore eligibility.
- **Required assertions:** Current user-record ineligibility denies later Rules and callable operations; callable checks current Auth disabled/verification/email state before private result or write. For Rules checks based on Auth claims, refresh the token or establish re-auth failure before asserting denial; an already-issued old token alone does not prove immediate Auth-disable revocation. Detected denial clears UI/listeners/retry records, persisted history remains unchanged, and restored actor may read only while accepted parent and membership still match. Do not claim instant idle-screen revocation.
- **Required evidence:** **E,R,M**; claims/user fixtures, token-refresh or re-auth evidence, and denial/recovery trace.
- **Executed evidence recorded:** Rules reject malformed stored user ID and production send/receipt reject changed status, role, email, Auth disablement and unverified state; RTL clears private state on denial.
- **Missing assertion/evidence or blocker:** Refresh-token and restore/replay matrix with held callbacks.

### F02-TC-039 — PASS

- **Trace:** **F02-TC-039** · AC-39 · FR-16
- **Action and fixture:** Hold old list/detail/message callbacks, server reads and callable result; change route, account, role or service, then release them.
- **Required assertions:** Old unsubscriptions run; epoch check discards every stale output and cannot revive private content or send in new context.
- **Required evidence:** **M**; unsubscribe counts and DOM/storage.
- **Executed evidence recorded:** Independent focused component rerun covers held list/detail/message/server/callable outputs after route, account, role and service changes, verifies old unsubscriptions and epoch rejection, no private content revival or new-context send, and same-account reconnect discarding old callbacks. Existing stale-context tests cover route-change cleanup.
- **Closure:** All approved TC-039 M held-output, unsubscribe, DOM and storage assertions passed locally.

### F02-TC-040 — PASS

- **Trace:** **F02-TC-040** · AC-40 · FR-17, FR-18
- **Action and fixture:** Actual Student/Mentor owner/status/limit request queries; participant and outsider conversation/message get/list/listen; broad conversation/message queries and pending/rejected/corrupt parent; stale flags.
- **Required assertions:** Eligible owner query and matching direct get work; conversation collection list and broad/foreign/potential-result queries deny. Message list requires authorized matching accepted parent and `limit <= 20`. Current role/status/email checks align between Rules and callables; no foreign/existence-sensitive content.
- **Required evidence:** **R,E,I**; exact query transcripts and before/after snapshots. Also F01-TC-032/035.
- **Executed evidence recorded:** Independent production SDK/Rules tests prove bounded Student/Mentor accepted-owner queries, pair/message get/list/listen, outsider and broad/unbounded denial, pending/rejected/corrupt parent and forged pair fail-closed access. Both roles' status/role/stored-email and refreshed unverified-token changes deny pair/message and owner query/listener paths with sanitized errors, exact unchanged Admin snapshots and restored access; production callables deny the same changed accounts.
- **Closure:** All approved TC-040 Rules R, production integration E/I query, account-alignment and no-leak assertions satisfied on the local integrated tree.

### F02-TC-041 — PASS

- **Trace:** **F02-TC-041** · AC-41 · FR-20
- **Action and fixture:** Recipient, sender, outsider, ineligible actor and missing/foreign/nonaccepted/malformed target invoke receipt callable; repeat a valid acknowledgement and try changing body through receipt.
- **Required assertions:** Only currently eligible other participant can set previously null `readAt`; replay returns same time with no new write. All hostile attempts leave entire message unchanged; body and other fields remain immutable.
- **Required evidence:** **E,R**; role matrix and exact snapshots.
- **Executed evidence recorded:** Independent production emulator covers eligible recipient, sender, outsider, six changed-account states, missing/foreign/pending/rejected/corrupt-message targets and extra-field body attempt with sanitized denial and exact Admin no-write snapshots; concurrent valid acknowledgement sets only one persisted readAt and replay is stable. Rules deny direct message mutation.
- **Closure:** All approved TC-041 callable E and Rules R role/target/no-write/replay assertions satisfied on the local integrated tree.

### F02-TC-042 — PARTIAL

- **Trace:** **F02-TC-042** · AC-42 · FR-19, FR-22, FR-23
- **Action and fixture:** Inspect both role pages at laptop and 320 px with long multiline content, loaded/empty/partial/stale/denied/support states, paging, send, Retry and receipt status. Use keyboard and a real screen reader.
- **Required assertions:** HelpiNUS shell/tokens and navigation remain coherent; no clipped required content or horizontal page scroll. Labels, visible focus, scroll/focus retention, restrained one-time sender-context arrival announcement without private body, sender-only accessible Sending/Sent/Read/uncertain/failed semantics and no Delivered claim. Record browser, viewport, screen reader, observations and defects against WCAG 2.1 AA target.
- **Required evidence:** **H,M**; screenshots/observation log and focused DOM assertions.
- **Executed evidence recorded:** Rendered Student chat at 1280 and 320 px with long multiline/literal text and no document overflow; RTL labels exist.
- **Missing assertion/evidence or blocker:** Mentor mobile and all state/paging/Retry/receipt views, keyboard, zoom and real screen reader.

### F02-TC-043 — PARTIAL

- **Trace:** **F02-TC-043** · AC-43 · FR-20, FR-21
- **Action and fixture:** Keep incoming saved message offscreen, background tab or unfocused; then move it into eligible foreground viewport. Fail/delay receipt write and repeat with a modified client attempting early call.
- **Required assertions:** Official app sends no acknowledgement before foreground intersection and sends at most one intended call afterward. Sender remains Sent until persisted readAt arrives, including receipt failure/uncertainty. Server permits only authorized recipient for existing message; no claim that server proves visual attention.
- **Required evidence:** **M,E,L,H**; observer/call trace, snapshots and browser observation.
- **Executed evidence recorded:** Browser recipient saw Mentor message and sender UI showed Sent; production receipt and viewport RTL pass.
- **Missing assertion/evidence or blocker:** Simultaneous two-client persisted Read transition, visibility timing and human accessibility observation.

### F02-TC-044 — PARTIAL

- **Trace:** **F02-TC-044** · AC-44 · NFR-09
- **Action and fixture:** After implementation and independent verification, audit ledger, tests, guides, code diff, release audit and CI at exact commit.
- **Required assertions:** Every PRD FR/NFR/AC and F01 dependency has case-level command/environment/outcome/persisted assertion and required evidence class; incomplete work is FAIL/PARTIAL/BLOCKED/NOT RUN, never PASS. Actual User/Developer Guides, feature log and handoff explain verified behavior, limits and receipt trust boundary. Node 22 CI and required manual observations are linked. No mock-only release claim.
- **Required evidence:** **H,C**; complete crosswalk, CI run URL/SHA and document links. Also F01-TC-046.
- **Executed evidence recorded:** 91-case RTT matrix and local independent checks recorded; approved PRD ID inventory completed.
- **Missing assertion/evidence or blocker:** Full semantic crosswalk, exact-revision Node 22 CI URL/SHA, required manual/real-data audit and guide verification.

### F02-TC-045 — PARTIAL

- **Trace:** **F02-TC-045** · NFR-08 · F01 regression
- **Action and fixture:** Run affected F01 request creation/decision/replay/summary, auth/role routing, Student/Mentor dashboard, shared contract and prior feature suites after F02 wiring; inspect direct close/booking routes and callables.
- **Required assertions:** F01 still permits only the addressed eligible Mentor to decide, preserves pending key and summary behavior, returns same/opposite terminal results without extra writes, and does not activate closure or booking. Existing approved behavior and shared consumers still pass; any failure is investigated rather than waived by F02 success.
- **Required evidence:** **E,R,M,C**; suite commands/results, contract output and targeted source/route evidence. Includes F01-TC-026 regression.
- **Executed evidence recorded:** Final local Node 22 pass completed 355 unit/component, 23 Firestore Rules and 96 production-wired integration tests after F02 wiring; the first integration 95/96 was a corrected synthetic email-case fixture. F01 creation/decision/replay/summary, dashboard and shared-contract suites passed. The final read-only source/diff audit confirmed dormant close/booking callables remain notImplemented with no frontend dispatch, while accepted decisions retain the real F02 transaction binding. See verification-evidence/F02-TC-045-local-regression-audit.md.
- **Missing assertion/evidence or blocker:** Exact-revision Node 22 CI URL/SHA for required C evidence remains unavailable until a separately authorized CI run.
