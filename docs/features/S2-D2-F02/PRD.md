# Product Requirements Document — S2-D2-F02 Conversation Management

**Status:** Developer 2 approved for TDD planning; complete F02 SDD package separately approved 2026-10-16; Git publication pending  
**Draft date:** 2026-10-16 (Asia/Singapore)  
**Feature owner / workstream:** Developer 2 / Sprint 2 F02  
**Approval reference:** Developer 2's “approve PRD” reply in this conversation on 2026-10-16 approved the exact pre-approval-metadata PRD with SHA-256 `AF69722D52877121FD22CAEB38CF7C49FC88FFB547B784B96490D1935BAAB86B`. No durable reply identifier is claimed. The approved bytes are preserved in `Dev2-local-SDD-backups/2026-10-16-S2-D2-F02-PRD-owner-approved-preheader/`.  
**Approval scope:** This PRD's product requirements for subsequent TDD planning. The TDD, Requirements-to-Tests and complete SDD package were separately approved later on 2026-10-16; implementation, Git publication and release retain separate gates.  
**Document scope:** Product requirements only; this approval permits TDD drafting but does not approve the resulting design, tests, application code, or publication.  
**Counts:** 23 functional requirements, 9 non-functional requirements, 44 acceptance criteria.

## Document authority and frozen workflow

This PRD was drafted using the **committed** F01 worktree workflow at Git HEAD `bb2e7c2ae1c4a8556716be62cfafd052d8789045`, inspected before drafting. The applicable instruction snapshots for that drafting run were `AGENTS.md` (Git blob `671e5c7a33c7d42b2a04933f89a4c715885cf0a5`), `workflow/agents/README.md` (blob `b3bdcf339e5e6ff019cb7f2995d4593336b21c1a`), and the committed local delivery skill (blob `0f166f424d1193fa24e6c79e1f936b7a5ea1f83e`). Concurrent uncommitted governance edits in that checkout were outside that run. The later PRD approval is recorded above; final package approval, publication, and implementation gates remain separate. The updated workflow in the dedicated F02 worktree governs subsequent F02 work.

**Governing product sources, in order:** the [approved F02 Mission Brief](../../mission-brief/S2-D2-F02-conversation-management.md) and [owner-approved full-text amendment](../../mission-brief/S2-D2-F02-conversation-management-amendment-draft.md), the original Sprint 2 F02 specification and [owner-approved specification amendment](../../../workflow/specs/sprint-2/S2-D2-F02-conversation-management-amendment-draft.md), then [approved F02 Grilling Decisions](GrillingDecisions.md) GD-01–GD-11 for open choices. The [approved F01 Mission Brief](../../mission-brief/S2-D2-F01-help-request-management.md), [F01 decisions](../S2-D2-F01/GrillingDecisions.md), [PRD](../S2-D2-F01/PRD.md), [TDD](../S2-D2-F01/TDD.md), and [Requirements-to-Tests](../S2-D2-F01/RequirementsToTests.md) govern the shared acceptance boundary. Sprint 1 architecture ADR-001/003/004 and the product WCAG 2.1 AA target constrain security and UX. Repository code is compatibility evidence, not a source of new product policy.

Developer 2 approved the F02 Mission Brief and explicitly confirmed GD-01–GD-11, including the GD-07/08/11 clarification round. Developer 2's later “approve all” reply approved the exact pre-header grilling record and two read-receipt scope-amendment drafts, identified by their recorded SHA-256 values in those artifacts and the F02 planning handoff. An independent read-only exact-byte review performed for this PRD preflight compared those approved backup bytes with the active drafts and F01/F02 sources; it found no material contradiction or unresolved P0 decision. The active amendment bodies retain historical “proposed” wording while their approval headers record the later owner approval. This PRD applies the bounded GD-11 amendment and does not silently edit those approved source files. Developer 2's approval of this PRD's pre-approval-metadata bytes is recorded above.

The original F02 specification was inspected at `CS3227-2610-MP3-help-requests/workflow/specs/sprint-2/S2-D2-F02-conversation-management-spec.md`; the F01 implementation handoff was inspected at `Dev2-local-SDD/workflow/handoffs/royden/S2-D2-F01.md`.

## 1. Product overview, goals, and success

Conversation Management gives one Student and the specific Mentor who accepted that Student's Help Request a private, durable, real-time text conversation about that request. A conversation belongs to one accepted request; another accepted request between the same people has a separate conversation. Chat may resolve the question without an appointment.

Success means both currently eligible participants can find the same request-linked conversation, read its persisted history, exchange validated text and see new persisted messages without refresh. A successful Mentor acceptance produces one durable accepted request and exactly one matching conversation; an acceptance failure produces neither half of that pair. Authorized use survives navigation and later sign-in. Unauthorized users, stale accounts, and malformed relationships never gain chat access. Sender-visible statuses truthfully distinguish local sending, server persistence, uncertainty, and the bounded recipient acknowledgement approved in GD-11. Release evidence must come from the real F01/F02 integration, not a mock provisioner.

## 2. Scope, dependencies, and exclusions

**Included:** trusted conversation provisioning during F01 acceptance; authorized Student and Mentor lists, accepted-request entry and detail; request and participant context; text history, composition, validation, send and real-time updates; bounded history/list loading; same-intent retry and session recovery; sender-only Sending/Sent/Read status and recipient-authorized viewport acknowledgement; Firestore Rules and trusted-boundary authorization; responsive, accessible error and recovery states.

**Dependency:** F01 owns the specifically addressed request, its immutable Student/Mentor IDs, and the Mentor-only PENDING → ACCEPTED or REJECTED decision. F02 supplies the real transaction participant and chat. The current production F01 export still lacks that provisioner, so acceptance remains unavailable until integration. F01's approved request summary, pending-key, terminal replay, and anomaly behavior remain intact.

**Excluded:** availability, slots, consultation or appointment booking; request withdrawal, closure, reassignment, automatic rejection, or another decision state; public rooms, arbitrary direct messages, attachments, voice/video, notifications, AI chat, unread counters, recipient-device delivery receipts, reactions, message editing/deletion, and any new retention/deletion policy. Read receipts are limited to GD-11; the dormant shared CLOSED symbol does not create a closure feature. F01 plus F02 do not complete all Sprint 2 booking work.

## 3. Actors and end-to-end journeys

| Actor | Journey |
| --- | --- |
| Student | Submit a specifically addressed F01 request; while pending, see no usable chat. After acceptance, enter from accepted request detail or own conversation list, inspect the selected Mentor and request context, read history, send text, receive live replies, leave and later return to durable history. |
| Mentor | Review and accept an assigned pending F01 request; after the integrated accepted pair is durable, enter from accepted request context or own conversation list, identify the Student and request, read and reply, and return later without losing history. |
| Trusted acceptance boundary | Authorize the addressed Mentor; decide the request; provision its deterministic matching conversation in the same committed outcome; reject or fail without partial acceptance. |
| Firestore and client boundary | Persist and authorize conversations, messages and bounded read acknowledgements; deliver authorized live updates; stop subscriptions and discard late private data when context changes. |

Both roles see loading before an empty result, generic support guidance for an anomalous accepted pair, distinct transient and permission-denied states, and per-message sending/uncertain/failed feedback. A direct route never bypasses list or parent authorization.

## 4. Functional requirements

### FR-01 — Atomic request-linked provisioning

On a successful F01 acceptance by the currently eligible addressed Mentor, the trusted acceptance workflow MUST persist exactly one conversation whose immutable parent is the accepted Help Request ID and whose Student/Mentor identities equal that request. The accepted request and matching conversation MUST become durable as one outcome; failure to provision MUST leave the request pending and its F01 coordination state unchanged. F02 MUST NOT independently set request status or offer arbitrary conversation creation. **Acceptance:** AC-01–AC-04. **Source:** F02 brief §4; F01 PRD FR-08/11; GD-04.

### FR-02 — Acceptance replay, races, and separation

Repeated or concurrent acceptance of one request MUST converge on its original conversation without changing the accepted timestamp or creating a second conversation. Two separately accepted requests between the same Student and Mentor MUST have distinct conversations. A rejected request MUST not gain a conversation, and an opposite terminal response MUST retain F01's actual-status conflict behavior. **Acceptance:** AC-02, AC-05–AC-07. **Source:** F02 brief §4; F01 PRD AC-23/33/34.

### FR-03 — Corrupt or missing parent pair

If an accepted request lacks its required conversation, or the conversation's parent/identities conflict with the authoritative request, the affected chat MUST fail closed. The accepted request MUST remain visible as a generic support-needed/unavailable row; healthy conversations MUST remain usable. Opening or replaying the bad pair MUST NOT fabricate, silently repair, disclose corrupt fields, or claim successful chat access. Production repair/backfill needs separate review. **Acceptance:** AC-08–AC-10. **Source:** GD-04; F01 PRD AC-24/36.

### FR-04 — Authorized discovery and entry

Each currently eligible Student and Mentor MUST be able to find only their own accepted request-linked conversations through a role-appropriate list and enter the same conversation from an accepted F01 request detail. Pending, rejected, foreign, missing, and corrupt pairs MUST not yield usable chat through a list, link, guessed ID, or direct route. **Acceptance:** AC-06, AC-09–AC-12. **Source:** GD-04, GD-07; F02 specification §§3, 5.

### FR-05 — Conversation list content and order

A conversation list MUST show the other participant, module, and enough parent-request context to identify each chat, without message-body previews or unread counters. Usable rows MUST be ordered by newest authoritative acceptance time first with a deterministic tie-break; a new message MUST NOT reorder an older accepted chat. An open list MUST update when a newly accepted authorized request becomes durable without navigation or manual refresh. **Acceptance:** AC-11–AC-14. **Source:** GD-07.

### FR-06 — Bounded conversation list

The list MUST load a bounded portion first and expose an accessible “Load more” action to reach older authorized entries. It MUST distinguish initial loading, truly empty, partially loaded, exhausted, recoverable failure, and support-needed rows; a partial result MUST NOT imply that older conversations do not exist. **Acceptance:** AC-13, AC-15. **Source:** GD-07, GD-04.

### FR-07 — Conversation detail and context

Opening an authorized conversation MUST show the associated Help Request's module and question context, the role-appropriate identity of the other participant, and existing messages. Student and Mentor views MUST resolve to the same request-linked conversation. An unavailable parent or lost authorization MUST not leave private detail on screen or reveal existence-sensitive internals. **Acceptance:** AC-10, AC-16–AC-17. **Source:** F02 brief §§2, 5; GD-03/04.

### FR-08 — Durable, bounded history

The detail MUST retrieve a bounded recent portion of persisted messages, display it oldest to newest, and provide an accessible “Load earlier” action until all authorized history is reachable. Loading older records MUST preserve sensible scroll position and focus. The view MUST distinguish no messages, loading, exhausted history, and failure. History MUST remain available after navigation, refresh, and later eligible sign-in. **Acceptance:** AC-18–AC-20. **Source:** GD-06; F02 specification §§3–5.

### FR-09 — Stable chronology and pending placement

Confirmed messages MUST appear oldest to newest by authoritative creation timestamp, with message ID breaking equal-timestamp ties. Concurrent sends and listener updates MUST converge on that same order. Unresolved local bubbles MUST appear after confirmed history in local submission order; on persistence each moves to its authoritative position and the local/listener copies of its ID collapse to one row. **Acceptance:** AC-20–AC-22. **Source:** GD-05.

### FR-10 — Text composition and validation

Both authorized participants MAY send plain text. The system MUST trim surrounding whitespace, retain valid internal spaces and newlines, reject empty or whitespace-only normalized text, and reject normalized text longer than 4,000 characters through both the intended UI and authoritative write boundary. Invalid submissions MUST identify the problem without persisting a partial message. Saved text MUST render as text, never executable markup. **Acceptance:** AC-23–AC-25. **Source:** GD-02.

### FR-11 — Trusted message identity and persistence

Each intended send MUST have one opaque message ID. A successful write MUST persist that message in exactly its authorized conversation with authenticated sender identity and authoritative creation time. The sender cannot choose another actor, a foreign parent, or a client clock as authority. Neither participant can edit or delete a saved message in F02. **Acceptance:** AC-23, AC-26–AC-28. **Source:** GD-01/02; F02 specification §§4–6.

### FR-12 — Real-time messages and durable re-entry

When an authorized participant has an open conversation, newly persisted messages and authorized receipt changes MUST arrive through a live Firestore subscription without manual refresh. Both connected parties MUST see the same persisted message and subsequent eligible sessions MUST retrieve it. A local pending bubble alone MUST not count as persisted delivery. **Acceptance:** AC-19, AC-29–AC-30. **Source:** F02 brief §5; GD-01/05/11.

### FR-13 — Same-intent retry and reconciliation

After an uncertain send, the client MUST inspect the same authorized message ID before any retry. If it already persisted, the UI MUST reconcile to the saved message; if definitively absent and still authorized, manual or approved automatic retry MUST use that original ID and content. A fresh ID MUST represent a new intention, never a retry of the same message. Retry or replay MUST NOT duplicate a saved message or bypass current access checks. **Acceptance:** AC-21, AC-31–AC-33. **Source:** GD-01, GD-08.

### FR-14 — Multiple pending sends and local recovery

The UI MUST permit multiple unresolved intended sends, each retaining its own ID, text, local submission order, and sending/uncertain/failed state. Same-account browser-session navigation or refresh MUST preserve their recoverable retry records. On reconnection in that eligible session, the app MUST reconcile each uncertain ID and automatically retry only after establishing that it was not saved. A timeout with unknown persistence MUST show a distinct question-mark status and accessible Retry action, not Sent or definitive Failed. A definitive failure MUST be visibly different from uncertainty. **Acceptance:** AC-21, AC-31–AC-35. **Source:** GD-08.

### FR-15 — Local retry capacity

There is no fixed product count limit on pending sends. If an additional retry record cannot be stored safely, the app MUST pause new submissions, preserve all existing records, and explain recovery rather than drop an older record or send without refresh-safe tracking. **Acceptance:** AC-35–AC-36. **Source:** GD-08.

### FR-16 — Listener failure and denial

A transient listener or network failure MAY retain previously loaded messages only for the same still-eligible account, clearly marked potentially stale with Retry. It MUST not be presented as live or empty success. Permission denial, account switch, sign-out, or detected eligibility loss MUST clear private history, composer, subscriptions, and account-scoped pending records; late callbacks or promises MUST not repopulate them. **Acceptance:** AC-17, AC-37–AC-39. **Source:** GD-03, GD-09.

### FR-17 — Current eligibility and parent authorization

Every conversation, message and receipt read, list, listener and write MUST require the current authenticated participant with the correct Student/Mentor role, active account state, applicable verification/email match, and a matching ACCEPTED parent request. Inactive, unverified, wrong-role, signed-out or otherwise ineligible actors MUST lose historical reads and sends until eligibility is restored; no stored messages or requests are automatically changed. An unobserved remote change need not cause instantaneous idle-screen detection, but every protected operation and subsequent authorization check MUST fail closed. **Acceptance:** AC-38–AC-40. **Source:** GD-03; ADR-001; F01 authorization policy.

### FR-18 — Immutable membership and direct-client defense

Conversation parent, Student/Mentor IDs and any redundant membership fields MUST derive from trusted F01 data and remain immutable. Firestore Rules and trusted server operations MUST deny client conversation create/update/delete, forged membership or sender, unauthorized direct SDK reads/lists/subscriptions/writes, and message mutation. List access MUST be no broader than direct-document access, including Rules potential-result behavior or an equivalently authorized bounded trusted route. Privacy-preserving errors MUST not reveal foreign content or whether a guessed ID exists. **Acceptance:** AC-07, AC-26–AC-28, AC-40–AC-41. **Source:** F02 specification §§4–6; GD-03/07; F01 PRD AC-41; ADR-001/003/004.

### FR-19 — Local sending and server-saved statuses

Only the sender's own bubble MUST display the approved status convention: one grey tick for local Sending and two grey ticks for Sent only after authoritative persistence. An uncertain result MUST show the distinct question-mark/Retry state; a definitive failure MUST not masquerade as Sent. “Sent” MUST not claim recipient-device delivery. Received bubbles MUST show no sender status ticks. **Acceptance:** AC-31, AC-42. **Source:** GD-08, GD-11.

### FR-20 — Recipient read acknowledgement

For each persisted message, the official app MUST submit a read acknowledgement only for the other participant's message after that message appears in the currently eligible recipient's foreground chat viewport. The receipt is always on in F02. Only the authenticated recipient MAY persist an acknowledgement for an existing message in an authorized accepted-parent conversation; no sender, outsider, or ineligible actor may acknowledge it. The acknowledgement MUST not edit the message body or other message fields. **Acceptance:** AC-30, AC-40–AC-43. **Source:** GD-11 and owner-approved F02 amendments.

### FR-21 — Truthful Read display

The sender MUST see two blue ticks/Read only after the recipient-authenticated acknowledgement has persisted. Historical messages lacking one MUST remain Sent; no inferred or backfilled reads are allowed. The UI MUST not imply that a blue tick proves human attention. A modified recipient client can acknowledge early or withhold acknowledgement; server authorization can validate recipient and message existence, not viewport visibility. **Acceptance:** AC-30, AC-42–AC-43. **Source:** GD-11.

### FR-22 — Accessible chat interaction

Conversation entry, list and history paging, composer, send, Retry, and receipt/status feedback MUST be keyboard operable with visible focus, labels, and managed focus. A new incoming message MUST receive a brief accessible announcement with sender context without automatically reading the private body aloud or repeatedly interrupting composition. The history MUST remain readable and navigable on demand. **Acceptance:** AC-18, AC-34, AC-42. **Source:** GD-10; product WCAG 2.1 AA target.

### FR-23 — Truthful UI states and navigation

Student and Mentor surfaces MUST follow HelpiNUS navigation and visual conventions across desktop and mobile. They MUST present distinct initial loading, empty, partial, denied, unavailable, stale, sending, uncertain, definitive failure, recovered, and successful states where applicable. A failed route, listener, or provision outcome MUST never appear as an empty successful chat or a completed acceptance. **Acceptance:** AC-08, AC-15, AC-17, AC-34, AC-37, AC-42. **Source:** F02 brief §§2, 5; GD-04/08/09/10.

## 5. Non-functional requirements

| ID | Requirement | Acceptance |
| --- | --- | --- |
| NFR-01 — Security and privacy | The authenticated identity, authoritative user record, ACCEPTED parent, immutable participant fields, and current eligibility govern every protected path. Direct Firestore SDK and trusted Admin SDK boundaries both enforce their respective checks; errors do not disclose foreign data. | AC-26–AC-28, AC-38–AC-41 |
| NFR-02 — Atomic consistency | No durable accepted request may lack its matching conversation; no alternate conversation may reuse its parent. A failed or conflicting operation preserves the prior request/coordination state. | AC-01–AC-10 |
| NFR-03 — Durability and idempotency | Confirmed messages, authoritative order and read acknowledgements survive later eligible sessions; same-intent acceptance and message retries do not duplicate records. | AC-05–AC-06, AC-19–AC-22, AC-29–AC-33 |
| NFR-04 — Real-time correctness | Authorized open views reflect persisted conversation-list additions, messages and receipt changes without manual refresh, while listener failures and late events do not falsely imply current data. | AC-14, AC-29–AC-30, AC-37–AC-39 |
| NFR-05 — Bounded performance | Initial list and history loads are bounded, with explicit access to older authorized records. Exact page sizes and numerical latency targets are reserved for TDD because none was approved. | AC-13, AC-15, AC-18–AC-20 |
| NFR-06 — Accessibility | The feature targets WCAG 2.1 AA, including semantic controls, keyboard access, focus visibility and management, readable history, and restrained status announcements. Manual checks include long multiline messages and recovery states. | AC-18, AC-34, AC-42 |
| NFR-07 — Responsive visual quality | At laptop and 320 px mobile widths, Student and Mentor chat use established HelpiNUS shell, tokens, typography, components and clear layout for populated, empty, loading and error states without hiding required controls or content. | AC-42 |
| NFR-08 — Regression compatibility | F02 preserves F01 Mentor-only decisions, pending/terminal semantics, request summary and replay behavior, and existing shared access contracts. F02 does not activate closure or booking. | AC-01–AC-10, AC-40–AC-41 |
| NFR-09 — Evidence integrity | Release readiness distinguishes component/mock, Firestore Emulator, Security Rules Emulator, real F01/F02 transaction, concurrency/fault, two-client live, manual accessibility/mobile, and regression evidence. Planned checks are not recorded as passing. | AC-44 |

## 6. Numbered acceptance criteria

| ID | Setup / action | Independently observable result |
| --- | --- | --- |
| AC-01 | Eligible addressed Mentor accepts a pending F01 request through the production integrated path. | Fresh authoritative reads show ACCEPTED plus exactly one conversation at the request's deterministic identity, with matching immutable parent, Student and Mentor; F01 pending key and summary reflect the same commit. |
| AC-02 | Inject F02 provision failure or transaction abort before commit. | Request remains PENDING, no conversation appears, and pending key/summary remain at their prior values; UI does not claim acceptance. |
| AC-03 | Drop the acceptance response after a successful commit, then reconcile. | UI confirms only after reading the authorized accepted pair and links to its real conversation. |
| AC-04 | Attempt acceptance with no real provisioner. | Production path reports unavailable without a partial acceptance; a test-only adapter is not counted as release evidence. |
| AC-05 | Retry and race same-outcome acceptance for one request. | One accepted pair remains; conversation count and decision timestamp do not increase/change on replay. |
| AC-06 | Accept two separate requests for the same Student/Mentor. | Two distinct conversations exist, one per request; both role entry paths resolve to the correct separate IDs. |
| AC-07 | Reject a pending request, race opposite terminal decisions, or attempt an alternate conversation ID for one parent. | F01 terminal result/conflict is preserved; rejected request has no chat; alternate duplicate is impossible or denied, with no new usable record. |
| AC-08 | Seed an accepted request with no conversation, then retry acceptance and inspect its list/detail. | Integrity failure and generic support-needed row appear; no success link, fabricated chat, status change, or hidden accepted request. |
| AC-09 | Seed a mismatched/foreign/nonaccepted conversation beside healthy pairs. | Bad pair cannot open and leaks no corrupt details; healthy pairs remain accessible. |
| AC-10 | Attempt client-side repair, direct creation, or open by guessed ID for the bad pair. | Denied; records remain unchanged and error is existence-safe. |
| AC-11 | Open Student and Mentor lists containing own, foreign, pending and rejected requests. | Each sees only authorized accepted conversations and support-needed own anomalies; rows show other participant, module and request context without message preview or unread count. |
| AC-12 | Follow accepted-request detail from each role. | Both arrive at the same authorized per-request conversation; pending/rejected detail has no usable chat entry. |
| AC-13 | Seed more conversations than the first bounded list portion, including equal acceptance times. | First portion is newest acceptance first with stable ties; “Load more” reaches older authorized entries and a new message does not reorder a row. |
| AC-14 | Keep a list open, then durably accept a newly authorized request in another client. | Its row appears without navigation/refresh, and no foreign row appears. |
| AC-15 | Exercise empty, loading, partial, exhausted, failure and anomalous list states. | UI distinguishes each, offers appropriate loading/retry/Load more/support action, and never presents partial or failed loading as complete empty success. |
| AC-16 | Open a valid conversation from either role. | Detail shows the correct other participant, module/question context and persisted history from its authoritative parent. |
| AC-17 | Remove or revoke parent/participant access while detail is open. | Private detail, composer, pending local state and subscription clear when denial is detected; no stale chat remains usable or existence-sensitive error appears. |
| AC-18 | Load a long history and activate “Load earlier” by keyboard. | Bounded recent records load first; older authorized records become reachable, focus/scroll remain sensible, and loading/empty/exhausted/failure differ. |
| AC-19 | Leave, refresh, or later sign in as the eligible same participant. | Previously confirmed message bodies and authorized acknowledgements are retrieved from persistence, not reconstructed from a local pending bubble. |
| AC-20 | Seed messages with equal authoritative timestamps and disparate IDs; include older pages. | Both roles and a refreshed view show oldest-to-newest timestamp then ID order without gaps or reordering at page boundaries. |
| AC-21 | Send concurrently and hold listener/ack events out of order. | Pending bubbles follow local submission order after confirmed history; each confirmed ID appears once at its authoritative position. |
| AC-22 | Reconnect or reload while messages are pending. | Confirmed and unresolved rows reconcile by the same IDs without duplicate confirmed rows. |
| AC-23 | Send normalized valid text from Student and Mentor. | Exactly one message per intended send persists under the correct conversation with authenticated sender and authoritative timestamp; UI renders saved text as plain text. |
| AC-24 | Submit empty, whitespace-only, malformed, or normalized over-4,000 text via UI and direct SDK, including Unicode near the approved boundary. | Each path rejects invalid text with no message; valid internal whitespace/newlines, Unicode content, and the approved boundary value remain intact under one aligned length policy. |
| AC-25 | Send markup-looking text and multiline text. | History renders literal text and line breaks, never executable markup. |
| AC-26 | Forge sender ID, client timestamp, parent, or membership during a message/direct SDK write. | Authorization or validation rejects it and before/after records show no hostile mutation. |
| AC-27 | Use direct SDK to create/update/delete a conversation or edit/delete a message. | Rules deny all prohibited writes; parent/participants/body remain unchanged. |
| AC-28 | Invoke trusted provisioning or message paths outside the UI guard as unauthorized actors. | Server or Rules independently denies before private disclosure or mutation; Admin SDK code does not rely on Rules for its checks. |
| AC-29 | Keep two authorized clients open and send a persisted message from each. | Both live views receive each new message without refresh and converge on the same saved history. |
| AC-30 | Keep two eligible clients open while recipient views a sender message and receipt persists. | Sender's status changes live to Read only after persisted recipient acknowledgement; re-entry preserves it. |
| AC-31 | Lose send acknowledgement after persistence, then press Retry. | Uncertain question-mark/Retry appears until reconciliation; same ID resolves to one saved message and Sent, with no new ID or duplicate. |
| AC-32 | Lose acknowledgement before any persistence, then reconnect. | Authorized reconciliation establishes absence before automatic same-ID retry; one message eventually persists or a truthful failure remains. |
| AC-33 | Revoke access before a manual/automatic retry, or change intended text under an old ID. | Retry is denied or treated as a new intention only with a new ID; no stale success, foreign content, or duplicate appears. |
| AC-34 | Start multiple sends, navigate/refresh in the same eligible browser session, and return. | Each unresolved record retains text, ID and state; Sending, uncertain question-mark/Retry, definitive failure and recovered Sent are distinct and keyboard accessible. |
| AC-35 | Fill retry storage until the next record cannot be safely retained. | New submissions pause with recovery guidance; existing records remain intact and no untracked message is sent. |
| AC-36 | Sign out or switch account while unresolved text exists. | Account-scoped private retry records clear; another account never sees or retries them. |
| AC-37 | Cause a transient listener/network error for a still-eligible open chat. | Previously loaded history is marked potentially stale with Retry; failure is not displayed as live or empty success. |
| AC-38 | Suspend/deactivate, change role, unverify, change verified email, or sign out while data is open. | Subsequent protected reads/sends deny; on detected loss the app clears private state and listeners. Later restored eligibility permits access only if parent/membership still match. |
| AC-39 | Hold a prior account's callback or send result, then change route/service/account and deliver it late. | Old listener is removed; late data cannot populate the new view or revive cleared private text. |
| AC-40 | As outsider, wrong-role or ineligible user, try direct get/list/listener/send/receipt; as participant, try a broad query whose potential results include foreign conversations. | Rules or trusted bounded path denies foreign/pending/rejected access; authorized list and direct detail have equivalent parent/eligibility gates and errors reveal no foreign content. |
| AC-41 | Try acknowledging own, foreign, nonexistent, or unaccepted-parent message; try altering message content through receipt path. | Only currently eligible recipient can acknowledge an existing authorized message; prohibited attempts leave message and receipt state unchanged. |
| AC-42 | Inspect Student/Mentor chat at laptop and 320 px, keyboard and screen reader, including long multiline text, history paging, incoming message, empty/loading/error/denial, Retry and ticks. | HelpiNUS styling and hierarchy remain coherent; controls/content stay operable and readable; focus is visible and managed; brief sender-context arrival is announced without automatically speaking private body; statuses are truthful, sender-only, and distinguish Sending/Sent/Read/uncertain/failed. Manual WCAG 2.1 AA observations and any defects are recorded. |
| AC-43 | Keep a recipient's chat in the background or keep a message outside the foreground viewport; then bring that message into the eligible recipient's foreground viewport. Separately fail or delay acknowledgement persistence. | The official app sends no acknowledgement while backgrounded or offscreen; it submits one only after foreground visibility. The sender remains Sent until an authorized acknowledgement is confirmed persisted, including during failed/uncertain receipt writes; then Read appears. No test claims that Rules can prove visual attention. |
| AC-44 | Prepare the F02 release evidence record and guides after implementation. | The Requirements-to-Tests execution record maps each applicable FR/NFR/AC and F01 integration case to actual commands, environment, results and persisted-state assertions; it labels unit/component mock, Firestore Emulator, Rules Emulator, real F01/F02 transaction, concurrency/fault, two-client live, regression, and manual mobile/accessibility evidence separately. User/Developer Guides and handoff describe verified behavior and limitations. Missing or unrun evidence is not marked passing, and mock-only acceptance cannot satisfy the integrated release gate. |

## 7. Error and exceptional behavior

**Acceptance failure or uncertainty:** F01 remains the status authority. A failed provision leaves PENDING and no conversation; a lost response is unresolved until the real accepted pair is read. Corrupt or pre-existing mismatched pairs fail closed with generic support guidance. The app never repairs them from a chat route.

**Message uncertainty:** A local pending bubble is not persisted evidence. Unknown write outcome stays question-mark/Retry until same-ID authorized reconciliation. Definitive validation/permission failure is distinct. Reconnection may automatically retry only after absence is established. If retry state cannot be stored, sending pauses without dropping existing records.

**Read and subscription failure:** A recoverable transport failure may show same-account stale history with a clear label and Retry. Denial removes private content and pending state. Empty means an authorized successful query returned no records, never a failed or partial query. Late callbacks from a previous context are discarded.

**Receipts:** Sent is server save; Read is a persisted recipient acknowledgement under the official app's foreground viewport rule. Neither label proves recipient-device delivery or human attention. Missing historical acknowledgements are not inferred.

## 8. F01/F02 integration boundary and release verification

The observed F01 code exports `respondToHelpRequestHandler(input, request, db, provision?)`; it pre-reads the request, conversation, pending key and summary, checks terminal pair integrity, and invokes `provision(tx, updated, conversation)` before its transaction writes. The production export currently supplies no provisioner and returns F02_UNAVAILABLE for acceptance. The approved F01 TDD describes the conceptual F02 participant `provisionForAcceptedRequest(tx, acceptedRequest)`; exact helper signature, schema, query indexes and receipt storage are later TDD matters. The binding compatibility result is a deterministic conversation tied to the persistent Help Request ID within the accepted transaction, with immutable request-derived identities. F02 must preserve F01's read-before-write, replay/conflict and anomaly behavior.

Actual release verification MUST include unit/component tests, Firestore Emulator integration, Security Rules Emulator direct-SDK adversarial tests, real F01/F02 acceptance and transaction rollback tests, concurrent/repeated acceptance and message sends, failure injection for lost replies and provision faults, two-client live messages and receipts, account/session revocation, manual keyboard/screen-reader/mobile checks, and relevant F01/regression suites. The F01 handoff identifies F02-dependent RTT TC-022–TC-025 and TC-028–TC-035, plus broader evidence/handoff gate TC-046; their integrated assertions cannot pass on a mock helper. A real-data audit for accepted requests lacking a matching conversation precedes production enablement; any repair/backfill is separately reviewed. These are required evidence classes, not claims that tests have run or passed.

## 9. Traceability and consistency audit

| Approved decision | PRD coverage |
| --- | --- |
| GD-01 — intended-message identity/retry | FR-11, FR-13; AC-21–AC-23, AC-31–AC-33 |
| GD-02 — normalized text | FR-10–FR-11; AC-23–AC-25 |
| GD-03 — current eligibility/historical access | FR-16–FR-18; AC-17, AC-38–AC-40 |
| GD-04 — bad accepted pair | FR-03–FR-04; AC-08–AC-10 |
| GD-05 — chronology/pending placement | FR-09; AC-20–AC-22 |
| GD-06 — history loading | FR-08; AC-18–AC-20 |
| GD-07 — discovery/order/live list | FR-04–FR-06, FR-18; AC-11–AC-15, AC-40 |
| GD-08 — multiple sends/uncertainty/session recovery | FR-13–FR-15, FR-19; AC-31–AC-36 |
| GD-09 — listener failure versus denial | FR-16, FR-23; AC-17, AC-37–AC-39 |
| GD-10 — accessible/responsive chat | FR-22–FR-23; NFR-06–NFR-07; AC-18, AC-34, AC-42 |
| GD-11 — sender ticks and recipient acknowledgement | FR-19–FR-21; AC-30–AC-31, AC-40–AC-43 |

| Requirement IDs | Meaningful acceptance evidence |
| --- | --- |
| FR-01–FR-03 | AC-01–AC-10: persisted pair, rollback/replay, uniqueness, anomaly and unchanged-state observations |
| FR-04–FR-07 | AC-06, AC-09–AC-17: role entry, bounded/live list, context and denial |
| FR-08–FR-09 | AC-18–AC-22: durable paging, equal timestamps, pending/concurrent convergence |
| FR-10–FR-12 | AC-19, AC-23–AC-30: normalized body, trusted identity/time, immutable persistence and two-client updates |
| FR-13–FR-15 | AC-21, AC-31–AC-36: same-ID reconciliation, multiple pending sends, capacity and isolation |
| FR-16–FR-18 | AC-07, AC-17, AC-26–AC-28, AC-37–AC-41: stale/denied states, parent/eligibility and direct-SDK adversarial checks |
| FR-19–FR-21 | AC-30–AC-31, AC-40–AC-43: truthful sender ticks, receipt authorization and viewport trigger |
| FR-22–FR-23 | AC-08, AC-15, AC-17–AC-18, AC-34, AC-37, AC-42: accessible, responsive and truthful states |
| NFR-01–NFR-03 | AC-01–AC-10, AC-19–AC-22, AC-26–AC-33, AC-38–AC-41 |
| NFR-04–NFR-06 | AC-13–AC-15, AC-18–AC-20, AC-29–AC-30, AC-34, AC-37–AC-39, AC-42 |
| NFR-07–NFR-09 | AC-01–AC-10, AC-29–AC-30, AC-40–AC-44 |

Mandatory original F02 capabilities map to FR-01–FR-12 and FR-16–FR-18; the approved amendment maps to FR-19–FR-21. F01's accepted-pair invariant maps to FR-01–FR-03 and AC-01–AC-10. All 11 approved F02 decisions and every FR/NFR have acceptance coverage. No requirement here creates booking, closure, arbitrary chat, unread counts, or message mutation.

## 10. Risks, technical deferrals, and review record

- The TDD must choose a real F02 provision helper compatible with F01's existing transaction read-before-write seam and prove that no alternate conversation can reuse a parent. The production F01 export still lacks the helper.
- The TDD must prove a bounded authorized conversation-list strategy under Firestore Rules potential-result semantics; current Rules deny conversation collection list. It must also reconcile direct message creation and authoritative normalization/timestamps with GD-01/02 without weakening ADR-003/004.
- The TDD must choose receipt persistence and Rules that permit only recipient acknowledgement while preserving message immutability. Rules cannot prove viewport visibility; official-app behavior and its limit require separate UI/security evidence.
- Page sizes, indexes, exact routes, service interfaces, scroll implementation, and local retry-state representation belong to the TDD. No unapproved numerical latency target or fixed pending-send count is assumed.
- Existing accepted pairs need a real-data audit before release; any anomaly repair or migration needs separate review. F01's incomplete standalone/integrated evidence remains a release dependency.

**Preflight independent review:** A read-only reviewer checked the three owner-approved pre-header F02 artifacts against their recorded hashes, active metadata-only variants, original F02 scope, F01 documents and code. It found no material contradiction or unapproved P0 decision. Its sole minor editorial finding is historical “proposed” language in frozen amendment bodies; this PRD states the later approval explicitly and leaves those approved bytes untouched.  
**Independent PRD review:** The read-only reviewer found no material unapproved policy or F01 contradiction. P1: explicit foreground/offscreen and failed-receipt evidence was missing; resolved by AC-43 and FR-20/21 trace. P2: evidence provenance and guide/RTT completion lacked a direct criterion; resolved by AC-44 and NFR-09. P2: the F01 dependency list was too narrow; §8 now identifies TC-022–TC-025, TC-028–TC-035 and TC-046. P3: Unicode boundary evidence was implicit; AC-24 now names it. The reviewer rechecked the corrected draft read-only, verified all four resolutions and sequential, mapped IDs, and found no remaining material issue before Developer 2 draft approval.  
**Remaining product questions:** None identified within approved F02 scope. Any material source contradiction discovered later requires Developer 2 resolution and renewed review of affected approval.
