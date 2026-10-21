# S2-D1-F03 Student Study Assistant interaction summary

## Request and confirmed decisions

Zheng Hao approved `S2-D1-F03`, the recommended architecture, Option A static
deterministic retrieval, plain-text output, and a local-only empty conversation
until first send. Recommended defaults were accepted for multi-turn context,
citations, safe retry, rolling 14-day conversation content, 30-day metadata
audit, rate controls, deletion, and fail-closed production behavior.

The user clarified that Zheng Hao is Developer 1 and owns this Student Study
Assistant, while Royden is Developer 2 and owns a separate Mentor AI assistant.
The two assistants must not interfere or share feature-specific routes,
contracts, data, implementation, or artifacts.

## Work performed

Implementation started from the exact `origin/dev-staging` commit in an
isolated local worktree and feature branch. Shared contracts, Firestore denial
rules, server handlers, deterministic retrieval, a provider seam, fake emulator
provider, private persistence, rolling expiry, tombstones, cleanup seams,
metadata-only auditing, frontend adapters, recovery storage, the Student page,
responsive styling, tests, guides, and an adversarial evaluation were added.

The sanitized SoCLaaS Quick Start later confirmed the Chat Completions endpoint,
Bearer header, request/response shape, retry categories, and `default` model
alias. A server-only adapter now binds `SOCLAAS_API_KEY_STUDENT` only to
`studentStudyAssist`, applies bounded timeout/retry and response-size policies,
validates strict grounded/insufficient-context JSON, and maps upstream failures
without exposing their bodies. No real key or provider request was used.
Production still requires an explicit server-side enable flag and currently has
an empty corpus.

Development staging is enabled with a committed non-secret project-specific
dotenv file that pins only the reviewed base URL and `default` model. The key
is not present in the repository and must be created separately in Firebase
Secret Manager. The deployed retriever remains empty pending human source
approval, so staging cannot yet exercise a grounded real-provider answer.

The adapter follow-up passed the full Node 22 repository gate (frontend 323,
Functions 99, shared 16 tests), deploy-package validation, the verify-app
structural grader and self-test, and the final 2/2 Chromium Study Assistant
journey at `.verify-app/runs/2026-10-21T09-59-23-482Z/`. Independent review
found and prompted fixes for untrusted context in a system role, redirect SSRF,
unbounded response buffering, deadline misalignment, non-success response-body
cleanup, and output-rejection audit classification. The final re-review found
no remaining functional or security blocker for local/staging readiness.

## Verification-driven repairs

Focused unit and rendered-app checks found and repaired an authentication wait
race, repeated accessible-name locators, stale history-page responses, and
incorrect message chronology. Independent security and code reviewers then
identified and prompted repairs for:

- unbounded or instruction-shaped provider-bound corpus metadata;
- uncertain prompt residue after account/session changes;
- completed-replay and repeated-delete resource abuse;
- delete-operation and audit cleanup gaps;
- missing feature audit events for schema/auth/provider-output/expiry failures;
- public-rejection audit write amplification and duplicate/misclassified events;
- incomplete callable authorization-matrix evidence;
- over-broad browser assertions; and
- cleanup that could recreate a conversation shell from a tombstone alone.

Each repair received a focused regression. The final Node 22 check, feature
unit suites, Rules emulator, callable emulator integration, deploy-package
gate, structural grade, and Chromium journey passed. Desktop and mobile
screenshots were inspected directly. The final browser Functions emulator also
reported Node 22 and exercised keyboard activation and focus transfer for New
conversation.

The independent security re-review found no remaining local-code release
blocker and accepted the feature for local/emulator-only delivery. The final
code review found no critical/high correctness or isolation defect. Its final
audit, scheduler-documentation, encoded-input evaluation, and keyboard/focus
evidence observations were addressed before handoff; production integration
remains deliberately unapproved.

The final abuse-control follow-up moved public schema/auth rejection events to
content-free structured platform logs and coalesced durable rate-limit audits
to one event per Student, minute window, and reason. Repeated over-limit calls
therefore do not grow the Firestore audit collection.

## Security and scope result

The final local/emulator-only design is fail-closed: every callable requires a
current active Student profile; storage is UID-namespaced; direct Firestore
access is denied; request IDs bind exact payloads; citations are rebuilt from
approved retrieved chunks; model text is plain text; deletions use tombstones;
and production is disabled until human operational gates are complete.

No Developer 2 restricted artifact or owned AI implementation was accessed or
modified. No remote push, pull request, merge, deployment, production access,
credential access, production data access, or real SoCLaaS request occurred.

## Human follow-up

The user must review the local branch, create the `SOCLAAS_API_KEY_STUDENT` Firebase
secret for the intended project, approve the production corpus and cleanup
schedule, run semantic and real-provider validation, and explicitly authorize
later remote or production actions.
