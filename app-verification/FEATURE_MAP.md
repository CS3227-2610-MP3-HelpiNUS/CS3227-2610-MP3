# HelpiNUS verification feature map

Keep this map aligned with `src/frontend/src/routes/appRoutes.tsx`. All browser verification uses the local `helpinus-dev` Firebase emulators and synthetic accounts from `src/functions/scripts/seed-emulator.ts`.

| Area | Routes / navigation | Important interactions | Verification approach | Test data |
| --- | --- | --- | --- | --- |
| Entry redirect | `/` | Resolve the default destination and authentication guard | Open the root URL and assert the final guarded route for the current session | None or the intended seeded role |
| Public authentication | `/login`, `/login?existing=1`, `/register`, `/register?role=STUDENT`, `/register?role=MENTOR`, `/forgot-password`, `/account-access` | Choose existing versus new account, select a role before Google authentication, register one role, recover a missing display name, open Google Account Recovery | Assert role-specific destinations, explicit popup, refresh/logout, cancellation, name recovery, wrong-role feedback, absent role-switch controls, and direct cross-role callable rejection | Public pages need no account; seeded and new synthetic accounts use mock `google.com` identities |
| Student dashboard | `/student`, `/student/dashboard` | View greeting, recent requests, upcoming consultations, and feature links | Sign in as Student through mock Google; assert identity-specific heading and navigation without console/network failure | Seeded Google identity `student@example.test` |
| Mentor discovery and help request | `/student/mentors`, `/student/mentors/:mentorId/request` | Search/filter Mentors, expand details, paginate, select a module, submit a request | Use the seeded Student and Mentor catalogue; assert result identity, chosen module, explicit form feedback, and persisted destination | Student account; `aisha@example.test` supports seeded modules |
| Student requests | `/student/requests`, `/student/requests/:id` | Page through history, inspect status/details, open eligible conversation | Seed or create synthetic requests; assert order, status, persisted fields, and authorization-visible actions | Student plus matching synthetic requests |
| Student conversations | `/student/conversations`, `/student/conversations/:requestId` | Open eligible chat, page history, send, retry, observe read state | Use an accepted synthetic request; assert persisted message identity/order and error/retry state | Matched Student/Mentor accounts and accepted request |
| Student consultations placeholder | `/student/consultations` | Navigate to the workspace placeholder | Assert route, heading/copy, and shell navigation | Seeded Student |
| Student Study Assistant | `/student/study-assistant` | Confirm the CS2030S/CS2103 scope, start locally, send a grounded question, safely retry an uncertain send, continue with a context-dependent follow-up, navigate while an answer is pending, reload history, inspect citations, receive insufficient-context guidance, and delete the conversation | Sign in as the seeded Student against the local emulator stack; assert Student-only authorization, persisted message/citation state, idempotent retry, originating-conversation response routing, plain-text rendering, responsive layout, and clean browser diagnostics | Seeded Student plus the approved static CS2030S and CS2103 corpus; seeded Mentor for denial |
| Mentor dashboard and profile | `/mentor/dashboard`, `/mentor/profile` | View request summary; inspect and edit profile/module availability | Sign in as Mentor through mock Google; assert identity, saved/reloaded fields, validation, and responsive controls | Seeded Google identity `mentor@example.test` or `aisha@example.test` |
| Mentor requests | `/mentor/requests`, `/mentor/requests/:id` | Page pending/decided requests; accept or reject with confirmation | Create isolated synthetic request; assert authorized transition, terminal state, and Student-visible persistence | Matched seeded Student/Mentor pair |
| Mentor conversations | `/mentor/conversations`, `/mentor/conversations/:requestId` | List/open eligible chats, send and receive, page history | Use accepted synthetic request; assert both-role convergence and persisted content | Matched Student/Mentor accounts |

## Maintained smoke coverage

`app-verification/tests/app-smoke.spec.ts` currently proves:

- the rendered entry journey asks whether an account exists, separates registration from returning login, and reaches Google Account Recovery guidance;
- seeded Student and Mentor identities sign in through the Auth Emulator's mock Google provider and route from authoritative profiles;
- a new mock Google identity is provisioned only as an ACTIVE Student and reaches `/student/dashboard`;
- a new Mentor cannot register as Student, and a new Student cannot register as Mentor, including direct authenticated callable attempts;
- desktop and mobile dashboards offer no role switch; refresh, logout, wrong-role login, and protected URLs preserve the single role;
- popup cancellation leaves registration usable, a missing display name requires bounded recovery after Google confirmation, and a refresh requires confirmation again;
- login with a new Google identity offers explicit registration, and subsequent sign-in retrieves the persisted profile;
- browser console errors (including source URL), uncaught page errors, and failed requests are attached to each result; expected `net::ERR_ABORTED` Listen cancellation and the exact local Firestore `TYPE=terminate` HTTP 400 response remain recorded but do not fail the smoke; unrelated diagnostics still fail;
- success screenshots are retained alongside failure-only traces/video configured by Playwright.

Add feature-specific tests beside the smoke file and tag the title with a stable journey phrase so `--grep` can select it. Use unique synthetic identifiers for tests that write data; do not depend on production or shared human accounts.

`student-study-assistant.spec.ts` proves the full local Study Assistant journey,
including the visible two-module scope, history-resolved follow-up retrieval,
and a delayed-answer navigation race. It uses the deterministic fake provider
with the approved static corpus; it does not exercise or imply production
SoCLaaS readiness.
