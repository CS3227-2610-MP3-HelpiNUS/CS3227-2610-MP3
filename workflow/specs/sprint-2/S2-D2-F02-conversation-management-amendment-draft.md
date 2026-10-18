# S2-D2-F02 — Conversation Management

**Project:** CS3227 MP3  
**Sprint:** Sprint 2 — Help Requests, Conversations and Consultations (15–17 October 2026)  
**Feature owner:** Developer 2 (reassigned ownership)  
**Artifact type:** Feature-level specification for a later Mission Brief; **not** an implementation approval.  
**Status:** Developer 2 owner-approved read-receipt scope amendment; independent exact-byte review completed 2026-10-16; complete F02 SDD package separately approved 2026-10-16. The unchanged original specification remains in the F01 code worktree.  
**Prerequisite:** S2-D2-F01 Help Request Management contract.
**Amendment decision evidence:** Developer 2 selected “Amend F02 scope (Recommended)” and then “Confirm all (Recommended)” for GD-01–GD-11 on 2026-10-16 (Asia/Singapore), then confirmed the official-app viewport rule with its Firestore Rules limitation. No reply identifier is invented.
**Owner approval:** Developer 2's “approve all” reply in this conversation on 2026-10-16 approved this exact pre-header draft with SHA-256 `308BFAFB66D8552E8398CF19F2D19A9D5356451F4BD2C1D09C2F91C7A3A7547A`, the F02 grilling record, and the companion Mission Brief amendment. Approval metadata was added afterward; the later review outcome is recorded separately below. This approval does not authorize a PRD, technical design, tests, implementation, or publication.
**Independent review evidence:** In F02 PRD task `01a1441b-5aef-7be0-9345-156b3cbd66f5`, a separate read-only reviewer verified the owner-approved pre-header backup SHA-256 above, compared the active copy's approval metadata changes, and found no material contradiction. The exact-byte review completed on 2026-10-16; the complete SDD package was separately approved later that day. Historical “proposed” wording was an editorial finding.

## 1. Purpose and provenance

Deliver **private, persistent, real-time chat** between one Student and one Mentor, enabled **only after the Mentor accepts a specific help request**.

This re-groups the chat-specific portions of the original Sprint 2 **S2-D1-02 (Student Chat Interface)**, **S2-D2-02 (Persistent Conversations)**, and **S2-D2-03 (Request-to-Conversation Integration and Real Firestore Subscriptions)**. It includes a Mentor chat experience needed for the approved two-party workflow. The original availability, booking and appointment portions remain **outside F02**.

**Approved design:** One conversation per **accepted help request**, not a generic per-student/mentor thread. Messages may resolve the question without any appointment. The conversation is not an open/public chat and cannot be initiated independently of acceptance.

## 2. Actors and prerequisite relationship

- **Student:** The authenticated student ID on the parent `ACCEPTED` help request.
- **Mentor:** The authenticated addressed mentor ID on that request.
- **Trusted backend:** Creates the conversation as part of successful F01 acceptance and enforces/anchors immutable membership.
- **Firestore:** Persists conversations and messages and supports authorized real-time listeners.

An accepted F01 request supplies **request ID, student ID, and mentor ID**. These values define membership and cannot be chosen or modified by an arbitrary chat client.

## 3. Approved end-to-end journeys

### 3.1 Unlocking a conversation

1. Student submits a help request to a specific mentor through F01.
2. While its status is `PENDING`, neither party has access to a usable conversation for that request.
3. The addressed Mentor accepts the request through F01.
4. The trusted acceptance workflow creates **exactly one** associated conversation and makes it accessible to its two participants.
5. Student can enter chat from the accepted help-request details. Mentor can discover the same chat from the Mentor conversation list / accepted-request context.
6. If request is `REJECTED`, no conversation is created. Retrying an already-successful acceptance does not create duplicate conversations.

### 3.2 Student and Mentor chat

1. Both participants see a list of their authorized conversations.
2. They open a conversation showing its associated request context and existing message history.
3. They compose and send a text message.
4. Their own and the other participant's interface receives persisted messages in near real-time using Firestore listeners (e.g., `onSnapshot()`).
5. Messages display in a stable chronological order; recent messages remain available after navigation, refresh, and subsequent sign-in.
6. Loading, empty, send-failure, subscription-error and unauthorized-access states are handled safely.

No live audio/video, group messaging, files/attachments, AI bot, or consultation booking is included.

## 4. Domain and persistence contract

### 4.1 Conversation

At minimum, a conversation must identify:

| Item | Required invariant |
|---|---|
| Conversation ID | Unique conversation identity |
| Parent help-request ID | Immutable link to one `ACCEPTED` F01 request |
| Student ID | Immutable, server-controlled participant identity from F01 |
| Mentor ID | Immutable, server-controlled participant identity from F01 |
| Creation timestamp | Authoritative persistence timestamp |
| Active/usable condition | Only conversations whose associated request currently meets the approved access condition are writable |

Suggested list-display metadata (last message/time, unread count) is **optional**, not a requirement. A redundant membership array, exact Firestore path, lifecycle/status fields, and indexing are implementation decisions. Do not silently introduce mutable client-controlled membership.

### 4.2 Messages

Each message belongs to exactly one conversation, with at least:

| Item | Required invariant |
|---|---|
| Message ID | Unique within its conversation |
| Sender ID | Derived from the authenticated participant; cannot be forged |
| Body | Nonblank valid text subject to approved length limit |
| Creation timestamp | Authoritative time used for consistent ordering |

Original sprint describes a **Firestore Conversation collection** with **Message subcollections**. Follow current repository conventions and document any reason to diverge. **Proposed subsequent F02 scope amendment:** add only the per-message read receipt confirmed in GD-11 of the [F02 grilling record](../../../docs/features/S2-D2-F02/GrillingDecisions.md). Message editing, deletion, recipient-device delivery receipts, reactions, media, and retention/deletion policies remain outside this feature. This draft does not approve its own exact bytes.

## 5. Scope

### Chat interfaces for both roles

- Conversation list filtered to authenticated user's conversations.
- Conversation detail with parent request context (e.g., module/title), message history and composer.
- Authorized conversation entry from accepted request; both actors have a route to their own conversation.
- Real-time `onSnapshot()` (or repository-equivalent Firebase listener) for message updates.
- Stable chronological message ordering, empty/loading/failure states, and listener cleanup to avoid duplicate subscriptions.
- A permitted, validated message-send path and visible delivery/error feedback.
- Under the proposed amendment, sender-only Sending/Sent/Read status: one grey tick while a local send is in progress; a distinct question-mark status with Retry when persistence is uncertain; two grey ticks after authoritative persistence; two blue ticks only after a recipient-authenticated acknowledgement persists. The official app submits that acknowledgement only after the message appears in the eligible recipient's foreground viewport. “Sent” does not claim delivery to a recipient device, and Read cannot prove human attention. Received bubbles do not show sender status ticks.
- Mock conversation adapters for isolated UI tests if established by repository practices.

### Trusted backend, Firestore, and security

- Conversation persistence and message subcollections.
- Trusted conversation creation tied to successful F01 acceptance and consistent with the cross-feature contract.
- Exactly-one-conversation invariant even under duplicated/retried acceptance calls.
- Membership verification for all conversation/message reads, writes and subscriptions.
- Server-controlled parent relationship and participant identities.
- Message validation, size limits (value requires approval), authenticated sender identity and timestamps.
- Firestore Security Rules rejecting nonparticipant access, arbitrary conversation creation, membership changes, message spoofing, and chat before an accepted request.
- If the amendment is approved, a recipient-authorized read-acknowledgement path and participant-only receipt reads that cannot edit message bodies or let another actor acknowledge. Rules validate recipient identity and message existence; they cannot prove foreground viewport visibility or prevent a modified recipient client from acknowledging early or withholding an acknowledgement. Historical messages without a persisted acknowledgement remain Sent.
- Authorized conversation list queries and message real-time subscriptions.
- Unit, UI, Firebase Emulator, integration and security regression tests.
- Documentation of chat model, validation, subscriptions, authorization, user workflow, test evidence, and feature integration.

The exact message-write mechanism (Firestore direct write gated by Rules versus trusted callable) must be consistent with existing architecture. The original sprint permits **authorized Firestore operations** and requires correct Firestore Rules; it does **not** mandate a new send-message callable.

## 6. Behavioral and security invariants

1. Exactly one conversation corresponds to an accepted help request; no conversation usable for pending/rejected requests.
2. Exactly the addressed Student and Mentor can see the conversation or its messages. Neither role can list another user's private chat.
3. Only authenticated participants of an **active authorized conversation** can send messages.
4. Student ID, Mentor ID and request link are created/controlled by trusted backend code, not accepted from client-supplied membership fields.
5. A user cannot send as another participant, alter another user's message, or bypass an access check through a client direct write.
6. Invalid, blank or over-limit messages are rejected authoritatively; raw inputs must not be treated as executable markup in rendering.
7. Repeated acceptance calls, network retries and concurrent operations do not result in duplicate conversations or duplicate conversation memberships.
8. Chat remains persisted between sessions; listeners must not expose data across user switches, route transitions or sign-out.
9. Conversation access must track the parent help-request authorization state. Request closure is outside F01 MVP, so future closure behavior is an explicitly deferred decision.
10. Under the proposed amendment, only the currently eligible addressed recipient can persist a read acknowledgement for an existing message. The official app sends it only when the message appears in the recipient's foreground chat viewport. The sender sees Read only after that acknowledgement persists. Rules cannot prove screen visibility or human attention; no other actor can forge the recipient identity, and no historical read is inferred without an acknowledgement.

## 7. Acceptance criteria

| ID | Observable outcome |
|---|---|
| F02-AC-01 | Successful F01 request acceptance provisions one conversation linked to that request with correct immutable participants. |
| F02-AC-02 | Retries/races do not create a second conversation for the same request. |
| F02-AC-03 | PENDING or REJECTED requests cannot yield an accessible/usable conversation. |
| F02-AC-04 | Student and Mentor each see only their authorized conversation list and can open their shared conversation. |
| F02-AC-05 | Both roles can read persisted message history with predictable chronological ordering. |
| F02-AC-06 | Either participant can send a valid message that is persisted with authenticated sender identity. |
| F02-AC-07 | Both connected interfaces receive new persisted messages through Firestore real-time subscriptions without manual refresh. |
| F02-AC-08 | Blank/invalid/oversized messages fail in a controlled manner (exact limits to be approved). |
| F02-AC-09 | Unauthenticated/nonparticipant users cannot list, subscribe to, read, or send to another conversation; Firestore Rules enforce the restriction. |
| F02-AC-10 | Clients cannot invent conversations, forge membership/senders, or edit server-controlled metadata. |
| F02-AC-11 | UI covers loading, empty, failure and lost-permission states; subscription cleanup prevents wrong-user data leakage. |
| F02-AC-12 | Firebase Emulator tests exercise creation integration, security, real-time delivery and persistence; actual results are documented. |
| F02-AC-13 (proposed amendment) | Sender-only Sending/Sent/Read ticks reflect local send, authoritative persistence, and a persisted recipient acknowledgement; uncertainty has a distinct question-mark status and Retry. The official app acknowledges only after viewport visibility. Server persistence is never labeled recipient-device delivery; messages without a persisted acknowledgement remain Sent. |
| F02-AC-14 (proposed amendment) | Rules and integration tests reject foreign, ineligible, nonrecipient, nonexistent-message and message-mutating receipt operations; UI tests verify the official app's foreground-viewport trigger. Both eligible clients observe authorized read-state changes without exposing them to outsiders. Rules cannot prove actual screen visibility. |

## 8. Integration boundary with S2-D2-F01

- **F01:** Owns trusted request acceptance and its `PENDING -> ACCEPTED` state change.
- **F02:** Owns conversation data model, trusted provision operation/helper, security rules for chat, message persistence and both actor chat UIs.
- **Shared invariant:** The final acceptance operation must be **atomic or equivalently safely coordinated**, avoiding an `ACCEPTED` request without its conversation; safe retries cannot cause duplicates. Prefer a single transaction if supported by the current Firestore/Cloud Functions architecture, but the detailed implementation is a TDD decision.
- F02 must not create a second independent “accept request” state machine. It integrates with F01's authoritative service.
- F01 may use a documented F02 adapter/mock before integration; production cannot silently treat that mock as completed provisioning.
- Student and Mentor access both derive from the canonical parent request IDs, not arbitrary chat membership input.

## 9. Explicit non-goals and downstream integration

**Not F02:** mentor availability UI or slots; consultation location; 30-minute scheduling; booking/reservation/cancellation/confirmation; appointment status management; notifications; public chat; AI chat or matching; unrelated mentor-profile/dashboard overhaul; message edits/deletions/media, recipient-device delivery receipts, unread counters, reactions, or any read-receipt behavior beyond the proposed GD-11 amendment. The original exclusion of read receipts remains governing until this draft and the companion Mission Brief amendment are approved.

The original Sprint 2 includes **availability, appointments and booking**. Those requirements remain outstanding under **separate feature ownership/specifications**; delivering F01 + F02 alone does **not** satisfy the original full Sprint 2 exit criteria. Future appointment entry may link from an accepted conversation but must not require changes to the basic chat contract.

## 10. Original open questions and later decisions

This list preserves the original specification's planning questions. GD-01–GD-11 of the F02 grilling record settle the product choices; transaction, query, schema and receipt-storage mechanisms belong to later TDD. No original question silently authorizes another feature.

1. Approved maximum message length, whitespace and input-content rules.
2. Exact conversation provisioning interface and transactions/retry strategy with F01.
3. Message send path (Firestore Rules-protected write or Cloud Function) according to existing repository contracts.
4. Stable message ordering when timestamps collide; pagination / initial-load limit for long conversations.
5. Whether active chat is disabled when future requests are closed, and whether old messages become read-only; **closure is not in current MVP**.
6. If a user is disabled/role changes, what happens to historical access under the project's existing auth model?
7. The original open question about read receipts is resolved as proposed GD-11 product intent, subject to approval of the exact scope amendments. Notifications, unread counts, message edit/delete, and retention controls remain excluded.
8. Existing UI routes/components, Firestore shape, indexing and data access constraints found during repository inspection.

## 11. Verification and feature handoff

Expected evidence: authenticated two-user end-to-end flow; acceptance creates the unique conversation; concurrent/replayed acceptance tests; real-time two-client message exchange; persistence across reload; Rules and adversarial tests with unrelated users; clear mock-vs-emulator-vs-live evidence; accurate User and Developer Guides, integration contracts, and requirement-to-test traceability. If this amendment is approved, also verify the official app's viewport-triggered acknowledgement, recipient-only Rules authorization, truthful sender-only status ticks, persistence and two-client receipt updates, absence of inferred old reads, and denial after eligibility loss.

**Mission Brief instruction:** After F01's approved feature planning is complete, investigate the repository and use this document to draft a standalone S2-D2-F02 Mission Brief. First step is planning only; do not begin implementation, PRD, TDD, commits, or PRs without explicit authorization.
