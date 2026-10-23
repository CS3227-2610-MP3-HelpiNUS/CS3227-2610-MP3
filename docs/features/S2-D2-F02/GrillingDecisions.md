# Grilling Decisions — S2-D2-F02 Conversation Management

**Artifact status:** Developer 2 owner-approved; independent exact-byte review completed 2026-10-16; complete F02 SDD package separately approved 2026-10-16.  
**Decision status:** GD-01–GD-11 confirmed by Developer 2 in the interactive grilling conversation on 2026-10-16 (Asia/Singapore); the later clarification round further specified GD-07, GD-08 and GD-11.  
**Owner:** Developer 2  
**Decision evidence:** Developer 2 selected the answers to Q1–Q26 and then selected “Confirm all (Recommended)” in response to the consolidated GD-01–GD-11 record. In the subsequent clarification round, Developer 2 selected the official-app visibility rule, “Question-mark status with Retry,” “Automatic retry after reconciliation,” and “Live list update,” then selected “Confirm clarifications (Recommended)” for that consolidated follow-up. No durable reply identifier was supplied; none is invented here. Q24's “Both participants” answer was superseded by Q26's “Sender statuses only” answer.  
**Owner approval:** Developer 2's “approve all” reply in this conversation on 2026-10-16 approved the exact pre-header draft with SHA-256 `9D403517736D6F59368C6F1333A897B7D97C346402911C9E8CE3F1AECEEB1812`, alongside the two F02 scope-amendment drafts. Approval metadata and the readiness statement were updated afterward; the later review outcome is recorded separately below.  
**Approval scope:** Product, UX, access, and security decisions and the reviewed-by-owner pre-header bytes of this artifact. This decision-record approval alone did not authorize a PRD, TDD, Requirements-to-Tests artifact, source-code change, publication, or deployment. The independent exact-byte review and separate complete-package approval were completed later on 2026-10-16.  
**Independent review evidence:** In F02 PRD task `01a1441b-5aef-7be0-9345-156b3cbd66f5`, a separate read-only reviewer verified the owner-approved pre-header backup SHA-256 `9D403517736D6F59368C6F1333A897B7D97C346402911C9E8CE3F1AECEEB1812`, compared the active copy's approval/readiness metadata changes, and found no material F01/F02 contradiction or unresolved P0 decision. Historical “proposed” wording was an editorial finding; no approved decision text was changed.  
**Implementation authorization:** Not granted by this decision record.

## Authority and inspected evidence

- **Approved F02 Mission Brief:** `Dev2-local-SDD/docs/mission-brief/S2-D2-F02-conversation-management.md`, especially §§3–10. Its present exclusion of read receipts remains in force until an exact amended version is separately approved.
- **Sprint 2 F02 feature specification:** `CS3227-2610-MP3-help-requests/workflow/specs/sprint-2/S2-D2-F02-conversation-management-spec.md`, especially §§4–10. It likewise excludes read receipts pending approval.
- **Approved F01 package:** `Dev2-local-SDD/docs/mission-brief/S2-D2-F01-help-request-management.md` and `docs/features/S2-D2-F01/{GrillingDecisions,PRD,TDD,RequirementsToTests}.md`. F01 owns the Mentor-only `PENDING → ACCEPTED | REJECTED` transition and requires an atomic accepted request plus exactly one matching conversation.
- **Observed F01 implementation:** `CS3227-2610-MP3-help-requests` on `royden/feat-help-request-management` at `bb2e7c2ae1c4a8556716be62cfafd052d8789045` during this session. `src/functions/src/helpRequests.ts` pre-reads `conversations/{helpRequestId}` and exposes a transaction-compatible provision seam; `src/functions/src/index.ts` has no production provisioner, so acceptance remains unavailable. `firestore.rules` permits accepted-parent conversation `get` and Rules-gated message `create`, but denies conversation `list`; `src/shared/src/domain.ts` has a nullable conversation parent and a provisional trimmed 4,000-character message schema. These are implementation facts, not evidence of F02 production readiness.
- **Independent read-only consistency review:** Rechecked the F01/F02 documents and current code after the questions. It found no F01 lifecycle conflict in the selected behavior, but confirmed that read receipts require an explicit F02 Mission Brief and feature-specification amendment. It also identified the need to keep receipt writes recipient-authorized and pending text isolated by account.

The existing F01 checkout has unrelated local changes and untracked Sprint 2 specification copies. No F01 source, Rules, indexes, tests, or approved artifacts were edited during grilling. A real-data audit of accepted requests and conversations remains a later release prerequisite; an empty local emulator audit is not evidence about production data.

## Confirmed decisions

### GD-01 — Intended-message identity and retry

- **Issue and evidence:** A direct Firestore write can persist while its acknowledgement is lost. F01's request operation receipt does not cover messages. Current message Rules allow create and deny update; a stable client-selected document ID can support authorized same-ID reconciliation without a new send callable if Emulator tests prove the path.
- **Alternatives considered:** Stable ID per intended message; fresh ID on every retry; or a trusted send callable with a receipt.
- **Recommended option:** Stable ID and same-intent reconciliation, retaining Rules-gated direct creation where viable.
- **Developer 2's actual answer:** Q1, “Stable ID (Recommended)”; final consolidated record, “Confirm all (Recommended).”
- **Approved behavior:** Generate one opaque message ID for each intended send. After an uncertain result, check the same authorized message and retry only under that ID. Never report success solely from a local pending state or start a fresh-ID retry for the same intention.
- **Rationale and trade-off:** This prevents duplicate saved messages after a lost acknowledgement while preserving the existing direct-write boundary. The client needs durable per-message retry state and an authoritative reconciliation path.
- **Resulting requirement:** Same-intent retries are idempotent and currently authorized; definitive failure and uncertain persistence remain visibly distinct.
- **Status:** `APPROVED`.

### GD-02 — Message text policy

- **Issue and evidence:** The shared `messageSchema` trims and caps at 4,000, while current Rules reject whitespace-only text and cap at 4,000 without requiring outer trimming. The code values were proposals, not prior F02 policy.
- **Alternatives considered:** Trim with a 4,000-character cap; preserve outer whitespace at that cap; or approve a shorter bound.
- **Recommended option:** Trim outer whitespace, retain internal formatting, and use the current 4,000-character cap.
- **Developer 2's actual answer:** Q2, “Trim, 4,000 (Recommended)”; final consolidated confirmation.
- **Approved behavior:** Trim surrounding whitespace; reject empty or whitespace-only text and text exceeding 4,000 characters under the aligned client/shared/authoritative policy. Preserve valid internal spaces and newlines. Render saved content as plain text, never executable markup.
- **Rationale and trade-off:** It fits current contracts while preserving readable multi-line academic discussion. TDD must reconcile client and Rules normalization and test boundary cases, including Unicode and multiline input.
- **Resulting requirement:** Invalid text cannot be persisted through either the intended UI or a direct client write.
- **Status:** `APPROVED`.

### GD-03 — Historical access after eligibility changes

- **Issue and evidence:** Current `acceptedConversation` Rules require an active, verified participant whose current role matches the request. The F02 brief requires private state to clear when loss of authorization is detected.
- **Alternatives considered:** Suspend historical reads and sends until eligibility returns; allow read-only history; or revoke access permanently.
- **Recommended option:** Suspend access according to current eligibility.
- **Developer 2's actual answer:** Q3, “Suspend access (Recommended)”; final consolidated confirmation.
- **Approved behavior:** Inactive, unverified, wrong-role, signed-out, or otherwise ineligible participants cannot access past conversations or send. Access returns if eligibility is restored and the parent/participant checks still pass. Detected loss clears open private data, listeners, composer, and pending local messages; no messages or parent requests are automatically deleted or changed.
- **Rationale and trade-off:** This matches the authoritative account gate without inventing a request transition. An unobserved remote account change is not promised instant detection; protected operations and subsequent authorization checks must fail closed.
- **Resulting requirement:** Conversation, message, and receipt access uses current identity and eligibility, including after later sign-in.
- **Status:** `APPROVED`.

### GD-04 — Missing or inconsistent accepted conversations

- **Issue and evidence:** F01 checks the deterministic conversation during terminal replay and fails on a missing or mismatched accepted pair. The current implementation has no production provisioner; existing data must be audited before enablement.
- **Alternatives considered:** Fail closed with support guidance; automatically create or repair on open; or silently omit the chat. For a list with one bad pair, block the whole list or keep healthy chats usable.
- **Recommended option:** Fail closed for the affected pair, with a visible unavailable row and separately reviewed repair.
- **Developer 2's actual answers:** Q4, “Fail closed (Recommended)”; Q11, “Show unavailable row (Recommended)”; final consolidated confirmation.
- **Approved behavior:** A missing, mismatched, foreign, or nonaccepted conversation cannot be opened or fabricated by the client. Healthy conversations remain usable. Show a generic support-needed state for the affected accepted request without disclosing corrupt record details, and do not change its status. Any production backfill or repair needs separate review.
- **Rationale and trade-off:** This preserves F01's atomic-pair guarantee and avoids hiding an accepted request, while acknowledging that an anomalous row requires support work.
- **Resulting requirement:** Audit real accepted-request/conversation pairs before release; unresolved anomalies block claims of completed integration.
- **Status:** `APPROVED`.

### GD-05 — Confirmed and pending chronology

- **Issue and evidence:** Equal authoritative timestamps and concurrent sends can otherwise display in different orders after listener updates or refresh. Multiple pending messages have no authoritative timestamps yet.
- **Alternatives considered:** Timestamp plus message ID; a server sequence; listener arrival order. For pending messages, show them after confirmed history, interleave by client clock, or hide them until saved.
- **Recommended option:** Stable server-time/ID order for confirmed history and local submission order for a pending region after it.
- **Developer 2's actual answers:** Q5, “Timestamp, then ID (Recommended)”; Q15 first answered with a WhatsApp-style tick convention rather than a placement choice. In the final consolidated record Developer 2 confirmed pending bubbles after confirmed history in submission order and movement into authoritative order after save.
- **Approved behavior:** Display saved messages oldest to newest by authoritative creation timestamp, breaking ties by message ID. Show unresolved local bubbles after saved history in local submission order; move each to its authoritative position only when saved. Deduplicate the local and listener representation of the same ID.
- **Rationale and trade-off:** The visible order may shift on confirmation, but all participants and later sessions converge without a coordinating sequence write.
- **Resulting requirement:** Concurrent sends, equal timestamps, retries, and listener changes never produce unstable duplicate confirmed rows.
- **Status:** `APPROVED`.

### GD-06 — History loading

- **Issue and evidence:** Unbounded initial history increases Firestore reads and mobile rendering cost. The F02 brief requires persisted history and bounded, usable loading.
- **Alternatives considered:** Recent bounded page with “Load earlier”; infinite scroll; or all history at once.
- **Recommended option:** An explicit older-history action.
- **Developer 2's actual answer:** Q6, “Load earlier (Recommended)”; final consolidated confirmation.
- **Approved behavior:** Load a bounded recent portion first, show it oldest to newest, and expose an accessible “Load earlier” action. Preserve a sensible scroll position and focus when older records arrive. Distinguish loading, empty, exhausted, and failure states.
- **Rationale and trade-off:** Users can reach complete history without an unbounded first load or surprise automatic scrolling. Exact page size and query mechanics belong to TDD.
- **Resulting requirement:** History remains durable and reachable after navigation, refresh, and later eligible sign-in.
- **Status:** `APPROVED`.

### GD-07 — Authorized conversation discovery

- **Issue and evidence:** Both roles need a list, but current Rules deny `conversations` list, and parent-dependent authorization may prevent a safe potential-result query. F01 has owner-scoped request lists and authoritative terminal `updatedAt`.
- **Alternatives considered:** Newest message activity, newest acceptance, or request creation order; with or without private previews. Older entries could use explicit pages, infinite scroll, or a fixed recent-only list.
- **Recommended option:** Newest acceptance first, no message preview, bounded “Load more.”
- **Developer 2's actual answers:** Q7, “Acceptance time (Recommended)”; Q12, “Load more (Recommended)”; final consolidated confirmation. In the later clarification round, “Live list update (Recommended).”
- **Approved behavior:** Each eligible participant can find only their accepted conversations, newest acceptance first with a deterministic tie-break. Rows show the other participant, module and request context, without message-body previews. “Load more” reaches older entries. An open list updates when a newly accepted authorized request becomes durable, without navigation or manual refresh. Accepted-request details lead to the same per-request chat. A bad pair follows GD-04.
- **Rationale and trade-off:** Acceptance order avoids maintaining last-message metadata under direct message writes. It will not move an older chat to the top when a new message arrives. TDD must prove an authorized bounded list strategy, potentially request-backed or trusted, before enabling it.
- **Resulting requirement:** No foreign, pending, rejected, or corrupt conversation becomes usable through a list or direct route.
- **Status:** `APPROVED`.

### GD-08 — Multiple sends, uncertainty, and local recovery

- **Issue and evidence:** A lost write acknowledgement can leave message delivery unknown. F01 already scopes an uncertain request draft to a browser session; F02 must avoid cross-account private-text exposure. Local browser storage is finite.
- **Alternatives considered:** Pending bubble versus composer-retained text or error-only notice; one versus multiple pending sends; current-view-only, session, or persistent recovery; fixed queue bound versus no fixed count; pause, in-memory fallback, or drop-oldest on storage failure.
- **Recommended option:** Visible per-message pending bubbles with stable IDs and account-scoped session recovery; initially recommended one pending send and a fixed bound, but Developer 2 chose multiple pending sends and no fixed count.
- **Developer 2's actual answers:** Q8, “Pending bubble (Recommended)”; Q10, “Session recovery (Recommended)”; Q14, “Multiple pending”; Q16, “No fixed bound”; Q18, “Pause new sends (Recommended)”; final consolidated confirmation. In the later clarification round, “Question-mark status with Retry (Recommended)” and “Automatic retry after reconciliation.”
- **Approved behavior:** Permit multiple unresolved sends, each with its own text, ID, and sending/uncertain/failed state. A write timeout with unknown persistence shows a question-mark status and an accessible Retry action, not a Sent or definitive Failed claim. Preserve retry records across navigation or refresh within that account's browser session. On reconnection while that eligible account's browser session remains active, reconcile each uncertain ID and automatically retry the same intended send only after reconciliation establishes that it is not saved. Manual Retry follows the same rule. Never show confirmed Sent before authoritative persistence. There is no fixed product count limit, but if another retry record cannot be safely stored, pause new submissions, preserve existing records, and explain how to recover. Clear account-scoped private local state on sign-out, account switch, or detected loss of eligibility. Do not silently drop an older unresolved record.
- **Rationale and trade-off:** Rapid conversation remains possible during latency, at the cost of a more complex local queue. Storage exhaustion cannot be treated as a successful send or silently degrade refresh-safe retry.
- **Resulting requirement:** Multiple pending messages cannot duplicate, impersonate another session, or lose their original retry identity during a recoverable same-session refresh.
- **Status:** `APPROVED`.

### GD-09 — Listener failure versus access loss

- **Issue and evidence:** A transient message-listener failure does not prove authorization was revoked, while an access denial must remove private state. The F02 brief requires truthful loading, subscription, and denied states.
- **Alternatives considered:** Keep prior messages visibly stale with retry; clear all history on every listener error; or silently retry while presenting stale data as live.
- **Recommended option:** Keep stale history only for a still-authorized session and mark synchronization failure.
- **Developer 2's actual answer:** Q13, “Show stale history (Recommended)”; final consolidated confirmation.
- **Approved behavior:** During a transient network/subscription failure, retain previously loaded messages only for the same eligible account, mark them as potentially stale, and provide retry. Permission denial, account change, or detected eligibility loss clears the history, composer, listeners, and pending local state. A loading or failure state is never displayed as a confirmed empty chat.
- **Rationale and trade-off:** Users keep context during outages without mistaking it for live data; denial remains private and fail-closed.
- **Resulting requirement:** Late callbacks and promises from a previous route, service, or account cannot repopulate cleared private content.
- **Status:** `APPROVED`.

### GD-10 — Chat accessibility and responsive behavior

- **Issue and evidence:** The approved brief targets existing HelpiNUS visual conventions, WCAG 2.1 AA, mobile use, keyboard operation, and restrained assistive-technology feedback.
- **Alternatives considered:** Brief new-message status; automatic reading of each full body; or no live cue. Layout and exact focus mechanics can be chosen in TDD against the established design system.
- **Recommended option:** Brief status announcement without reading the private body aloud.
- **Developer 2's actual answer:** Q9, “Brief status (Recommended)”; final consolidated confirmation.
- **Approved behavior:** Chat and retry/history controls work by keyboard and at desktop and 320 px widths, with visible focus, accessible labels, and clear sending/error/status feedback. Announce a new incoming message briefly with sender context without automatically reading its body. Make content navigable and readable on demand; avoid excessive repeated announcements.
- **Rationale and trade-off:** Arrival is perceivable without interrupting composition or broadcasting private text through assistive speech.
- **Resulting requirement:** Later human verification covers keyboard, screen reader, long multiline text, loading, denial, recovery, and mobile states.
- **Status:** `APPROVED`.

### GD-11 — Read-receipt scope amendment and truthful tick states

- **Issue and evidence:** The currently approved F02 Mission Brief §3 and Sprint specification §§4.2, 9–10 exclude read receipts. Current message Rules allow only create and deny message update/delete, so a recipient-authorized receipt persistence path needs later design. Firestore message persistence alone cannot prove delivery to the recipient's device or reading. Rules can verify recipient identity and message existence, but cannot prove actual foreground viewport visibility or human reading.
- **Alternatives considered:** Keep F02 sending/sent states and defer receipts; add actual device-delivery and read acknowledgements; or amend F02 scope for read receipts while treating two grey ticks only as server-saved. Read could mean viewport visibility, merely opening a chat, or manual marking; privacy could be always-on, mutual opt-out, or opt-in. Old reads could be fabricated, hidden, or left unconfirmed.
- **Recommended option:** Initially recommended keeping F02 send states without read receipts. After Developer 2 reopened the scope, recommended truthful Sending/Sent/Read labels, viewport-based read evidence, and no fabricated historical reads.
- **Developer 2's actual answers:** Q17, “Reopen receipts scope”; Q19, “Server save”; Q20, “Visible message (Recommended)”; Q21, “Always on”; Q22, “Sending, Sent, Read (Recommended)”; Q23, “No fabricated reads (Recommended)”; Q24, “Both participants,” **superseded by** Q26, “Sender statuses only”; Q25, “Amend F02 scope (Recommended)”; final consolidated record, “Confirm all (Recommended).” In the later clarification round, “Yes, use this rule (Recommended)” for the official-app visibility rule and its Rules limitation.
- **Approved behavior:** Propose an F02 scope amendment for always-on per-message read receipts, without an opt-out in this feature. On the sender's bubble, one grey tick is local **Sending**, two grey ticks are **Sent** only after authoritative server persistence, and two blue ticks are **Read** only after a recipient-authenticated acknowledgement has persisted. The official app sends that acknowledgement only when the message appears in the eligible recipient's foreground chat viewport. Rules enforce recipient identity and message existence, but cannot prove screen visibility or human reading; a modified recipient client could acknowledge early or withhold acknowledgement. No recipient-device delivery state is claimed. Received bubbles show no sender status icons. Historical messages without a persisted acknowledgement remain Sent; do not infer or backfill blue ticks. Receipt reads/writes obey the same current parent, participant and eligibility gate as chat, and only the recipient may write their acknowledgement. Message editing/deletion, unread counters, notifications, and other excluded features remain out of scope.
- **Rationale and trade-off:** The requested blue ticks represent a recipient-authenticated acknowledgement generated by the official app's view rule, but expose viewing behavior and add persistence, Rules and live UI work. They cannot cryptographically prove visual attention. Calling server save “Delivered” would be false, so the approved label is “Sent.” The approved Mission Brief and feature specification must be separately amended and their exact bytes reviewed before PRD drafting; this decision alone does not rewrite or approve those artifacts.
- **Resulting requirement:** The F02 PRD may include read receipts only after the governing F02 scope amendment is approved. TDD must select and prove a secure receipt representation without weakening F01 or allowing arbitrary message mutation.
- **Status:** `APPROVED` as product intent; governing-scope amendment remains pending exact-byte review.

## Inherited constraints and implementation deferrals

- F01 alone decides request status. F02 provisions `conversations/{helpRequestId}` within F01's accepted transaction, using the authoritative request's immutable Student/Mentor IDs. No durable accepted-without-conversation state, duplicate conversation, arbitrary direct chat, or chat for pending/rejected requests is allowed.
- Direct Firestore message creation remains the preferred technical starting point because current Rules already gate it; TDD must prove sender, body, timestamp, ID retry, and parent checks in the Emulator. A callable is justified only if that boundary cannot meet the confirmed behavior. Receipt representation and any narrowly authorized write path are TDD choices.
- Conversation-list authorization must be demonstrated against actual Firestore Rules potential-result semantics. If a direct list cannot be secured, TDD may use bounded accepted-request-backed reads or a trusted projection with the same per-parent gate. Exact routes, query indexes, page sizes, storage format, and accessibility control mechanics remain implementation decisions.
- A real-data audit and separately reviewed repair are required for any historical accepted request without a matching conversation. F01's existing anomaly detection and fail-closed behavior remain intact.
- No PRD, TDD, Requirements-to-Tests document, implementation, Rules/index edit, test implementation, commit, push, PR, merge, or deployment is authorized or performed by this record.

## Readiness and review gate

GD-01–GD-11 resolve the material product decisions surfaced in the F02 Mission Brief plus the owner-approved read-receipt intent, including the follow-up clarification round. The initial independent read-only decision consistency review found no need to revise approved F01 behavior. A subsequent independent draft-file review attempt reached a usage limit and was not a completed review. Developer 2 then replied “approve all” to the three unchanged draft hashes; that approval did not retroactively complete the review. A later separate read-only reviewer completed the exact-byte/hash and consistency review recorded above. The F02 PRD was subsequently drafted and independently reviewed; it remains a separate Developer 2 approval gate. Final SDD package approval remains pending.
