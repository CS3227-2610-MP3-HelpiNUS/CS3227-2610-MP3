# S2-D1-F03 Student Study Assistant handoff

**Owner:** Zheng Hao, Developer 1

**Feature:** `S2-D1-F03`

**Branch:** `zh/feat-student-study-assistant`

**Baseline:** `baa1a2e99dbe574944a76d81c03b9dc6e5bca1bf` (`origin/dev-staging`)

**Status:** Local/emulator implementation complete; production integration and human review pending

## Delivered behavior

- Dedicated Student route `/student/study-assistant` with a local-only empty
  conversation until the first successful send.
- Plain-text multi-turn conversations, per-answer citations, saved history,
  bounded pagination, insufficient-context guidance, safe uncertain-send retry,
  deletion confirmation, responsive navigation, and academic-integrity copy.
- Four strict shared callable contracts: send, list, read, and delete.
- Server-owned authorization, ownership, idempotency, rate controls, retrieval,
  provider validation, persistence, auditing, deletion, and cleanup seams.
- Deterministic Option A retrieval over an immutable, versioned, approved local
  corpus. The emulator uses labelled BFS/recursion fixtures and a fake provider.
- Rolling 14-day conversation content retention and 30-day metadata retention
  targets for audit and delete-operation records.
- Direct Firestore access denied for every feature namespace.

## Isolation from Developer 2

This feature is Zheng Hao's Student Study Assistant only. Its route, callables,
contracts, UI state, collections, tests, and provider boundary are separate
from Royden's Mentor AI feature. No Developer 2 mission brief, feature
specification, handoff, log, branch, worktree, or owned AI implementation was
opened or modified during this delivery.

## Interfaces and persistence

Callables:

- `studentStudyAssist`
- `listStudentStudyAssistantConversations`
- `readStudentStudyAssistantConversation`
- `deleteStudentStudyAssistantConversation`

Private namespaces:

```text
studentStudyAssistantUsers/{uid}/studentStudyAssistantConversations/{conversationId}
  /studentStudyAssistantMessages/{messageId}
studentStudyAssistantUsers/{uid}/studentStudyAssistantSendOperations/{requestId}
studentStudyAssistantUsers/{uid}/studentStudyAssistantDeleteOperations/{requestId}
studentStudyAssistantDeletionTombstones/{uid}/studentStudyAssistantConversations/{conversationId}
studentStudyAssistantRateControls/{uid}
studentStudyAssistantAuditEvents/{eventId}
```

## Local commits

- `291663c` — define callable contracts.
- `02c990b` — lock down direct storage access.
- `b37b779` — implement the secure backend boundary.
- `ee62661` — verify private persistence.
- `881e77b` — build the Student workspace.
- `b3773bd` — preserve message chronology.
- `7a36a49` — harden client recovery races.
- `b8d593b` — close independent security and reliability review gaps.
- `e3e2bd8` — add the adversarial evaluation and rendered app journey.
- `a29aebd` — complete schema, auth, provider-output, and expiry auditing.
- `5464d88` — close keyboard/focus and encoded-input evidence gaps.

Documentation and this handoff are committed separately.

## Verification evidence

All commands below used the repository's Node 22 runtime, including the final
isolated browser stack whose Functions emulator reported `Using node@22 from
host`.

- `npm run check` — passed: frontend 37 files / 323 tests; Functions 14 files /
  90 tests; shared 2 files / 16 tests; lint, type checks, production builds.
- Focused Functions security suite — 3 files / 37 tests passed.
- Focused frontend suite — 2 files / 12 tests passed.
- Focused callable emulator integration — 1 file / 5 tests passed, including
  every callable under unauthenticated, Mentor, inactive, malformed,
  email-mismatched, and unverified identities.
- Firestore Rules emulator — 2 files / 26 tests passed.
- Deploy package verification and its valid/stale/out-of-bound/stale-lockfile
  cases — passed.
- `npm run verify:app:grade` — passed.
- `npm run verify:app -- --port 5180 --grep "Student study assistant"` — 2/2
  Chromium tests passed. Evidence:
  `.verify-app/runs/2026-10-21T09-12-32-555Z/`.
- Desktop and 390-pixel mobile screenshots were visually inspected; no active
  markup, chronology issue, overflow, or unusable interaction was observed.

The browser journey proves grounded BFS and recursion answers, trusted source
links, insufficient context, lost-response retry without duplication, reload,
keyboard activation and composer focus for New conversation, deletion,
responsive layout, clean diagnostics, and Mentor denial.

## Independent review and repairs

The security review found provider-bound metadata validation, session retry
residue, replay/delete abuse, cleanup retention, and evaluation-accuracy gaps.
The final code review additionally found a stale page-response race and a
tombstone-only deletion path that could recreate a shell document. Repairs add
bounded metadata validation and immutable corpus snapshots, session-transition
cleanup, a replay limiter, expiring delete receipts, cleanup seams, expanded
audits at schema/auth/provider-output/expiry boundaries, request-generation
guards, and update-only tombstone cleanup. Direct
regressions cover each repair. Final reviewer verdicts are recorded in the
interaction log.

The final independent security verdict was acceptable for local/emulator-only
delivery with no unresolved local-code vulnerability. The final code review
reported no critical/high correctness or isolation defect; its remaining
audit, scheduler-documentation, evaluation, and accessibility observations
were repaired or recorded as explicit production gates before delivery.

## Production gates and human actions

Production remains fail-closed. The supplied service base URL is
`https://soclaas-api.comp.nus.edu.sg/v1`, but the endpoint path, headers,
authentication, model identifier, response/error schemas, quota, and retention
contract remain unknown and were not guessed.

Before production enablement, a human must:

1. review and approve this branch;
2. provide the official SoCLaaS wire contract and server-side credential;
3. review the real adapter and bind its secret only to the Functions runtime;
4. approve the immutable production corpus and exact source allowlist;
5. approve cadence/IAM, implement/export/deploy the scheduled cleanup
   Functions, and monitor the 14-day content, 30-day audit, and 30-day
   delete-operation targets (parent TTL alone does not delete subcollections);
6. run the repeated semantic adversarial evaluation and real-provider smoke
   test; and
7. explicitly set `STUDENT_STUDY_ASSISTANT_ENABLED=true` and authorize any
   push, pull request, deployment, or production mutation.

No push, pull request, merge, deployment, production access, production data,
credential access, or real-provider request was performed in this round.
