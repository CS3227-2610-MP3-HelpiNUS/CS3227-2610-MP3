# S2-D1-F03 Student Study Assistant handoff

**Owner:** Zheng Hao, Developer 1

**Feature:** `S2-D1-F03`

**Branch:** `zh/feat-student-study-assistant`

**Baseline:** `baa1a2e99dbe574944a76d81c03b9dc6e5bca1bf` (`origin/dev-staging`)

**Status:** Local/emulator implementation and SoCLaaS wire adapter complete; deployed corpus, configuration, semantic evaluation, and human review pending

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
- Server-only SoCLaaS Chat Completions adapter using the fixed `/v1` base URL,
  `default` model alias, Bearer secret binding, bounded timeout/retries, safe
  error mapping, response-size limits, and strict output validation.
- Non-secret `helpinus-dev` runtime configuration enables the staging feature
  and pins the reviewed base URL/model. Production remains disabled by default,
  and neither environment file nor source control contains the API key.
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
- `307f759` — bound public and rate-limit rejection audit volume.
- `51b0a6f` — connect the reviewed SoCLaaS Chat Completions provider.
- `3bef738` — enable non-secret development-staging configuration.

Documentation and this handoff are committed separately.

## Verification evidence

All commands below used the repository's Node 22 runtime, including the final
isolated browser stack whose Functions emulator reported `Using node@22 from
host`.

- `npm run check` under Node 22 — passed: frontend 37 files / 323 tests;
  Functions 14 files / 99 tests; shared 2 files / 16 tests; lint, type checks,
  and production builds.
- Focused SoCLaaS/provider/backend suite — 3 files / 46 tests passed, including
  request construction, secret absence, HTTP mapping, retry/cancellation,
  deadline, streaming response bound, output validation, and safe auditing.
- Focused Functions security suite — 3 files / 37 tests passed.
- Focused frontend suite — 2 files / 12 tests passed.
- Focused callable emulator integration — 1 file / 5 tests passed, including
  every callable under unauthenticated, Mentor, inactive, malformed,
  email-mismatched, and unverified identities.
- Firestore Rules emulator — 2 files / 26 tests passed.
- Deploy package verification and its valid/stale/out-of-bound/stale-lockfile
  cases — passed.
- `npm run verify:app:grade` — passed.
- `npm run verify:app -- --port 5180 --grep "study assistant"` — 2/2
  Chromium tests passed. Evidence:
  `.verify-app/runs/2026-10-21T09-59-23-482Z/`.
- Desktop and 390-pixel mobile screenshots were visually inspected; no active
  markup, chronology issue, overflow, or unusable interaction was observed.

The browser journey proves grounded BFS and recursion answers, trusted source
links, natural history-resolved follow-ups, insufficient context, lost-response
retry without duplication, delayed answers remaining in their originating
conversation after navigation, reload, keyboard activation and composer focus
for New conversation, deletion, responsive layout, clean diagnostics, and
Mentor denial.

## Independent review and repairs

The security review found provider-bound metadata validation, session retry
residue, replay/delete abuse, cleanup retention, and evaluation-accuracy gaps.
The final code review additionally found a stale page-response race and a
tombstone-only deletion path that could recreate a shell document. Repairs add
bounded metadata validation and immutable corpus snapshots, session-transition
cleanup, a replay limiter, expiring delete receipts, cleanup seams, expanded
content-free structured logs at schema/auth boundaries, durable bounded audits
for provider-output/lifecycle/expiry events, request-generation guards, and
coalesced per-Student/window rate-limit audits, and update-only tombstone
cleanup. Direct
regressions cover each repair. Final reviewer verdicts are recorded in the
interaction log.

The final independent security verdict was acceptable for local/emulator-only
delivery with no unresolved local-code vulnerability. The final code review
reported no critical/high correctness or isolation defect; its remaining
audit, scheduler-documentation, evaluation, and accessibility observations
were repaired or recorded as explicit production gates before delivery.

The SoCLaaS follow-up review additionally removed system-role privilege from
retrieved data, rejected redirects, bounded and cancelled response streams,
aligned provider/callable deadlines, cancelled non-success response bodies,
and classified adapter output failures in the dedicated audit event. The final
independent security and code reviews reported no remaining functional or
security blocker for local/staging readiness.

The final pre-merge repair correlated send responses with their originating
conversation, included bounded recent history in retrieval queries, coalesced
all handler rejection audits by Student/window/event/reason, declared the
delete-receipt and abandoned-claim collection-group indexes, and added bounded
transactional cleanup for expired first-send claims without conversations.

## Production gates and human actions

Production remains fail-closed. The sanitized SoCLaaS guide now confirms
`POST /v1/chat/completions`, Bearer authentication, the OpenAI Chat Completions
response path, retryable `429`/`5xx` failures, and the validated `default` chat
model alias. The adapter is implemented without exposing or accessing a real
credential. Provider retention/privacy terms and a real-model semantic result
remain unverified.

Development staging is enabled after merge, but its registry is intentionally
empty until Zheng Hao approves a real source generation. It can exercise route,
authorization, persistence, deletion, and insufficient-context behavior after
deployment; it cannot produce a grounded real-model answer or prove that the
provider was called until the corpus and controlled smoke test are approved.

Before production enablement, a human must:

1. review and approve this branch;
2. create `SOCLAAS_API_KEY_STUDENT` in Firebase Secret Manager for the target project;
3. approve the immutable production corpus and exact source allowlist;
4. approve cadence/IAM, implement/export/deploy the scheduled cleanup
   Functions, and monitor the 14-day content, 30-day audit, and 30-day
   delete-operation and abandoned-send-claim targets (parent TTL alone does not
   delete subcollections);
5. run the repeated semantic adversarial evaluation and real-provider smoke
   test; and
6. explicitly set `STUDENT_STUDY_ASSISTANT_ENABLED=true` and authorize any
   push, pull request, deployment, or production mutation.

The final issue pass was authorized for commit and push to the existing
`zh/feat-student-study-assistant` branch only. No new branch or pull request,
merge, deployment, production access, production data access, credential
access, or real-provider request was performed.
