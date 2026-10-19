# HelpiNUS verification feature map

Keep this map aligned with `src/frontend/src/routes/appRoutes.tsx`. All browser verification uses the local `helpinus-dev` Firebase emulators and synthetic accounts from `src/functions/scripts/seed-emulator.ts`.

| Area | Routes / navigation | Important interactions | Verification approach | Test data |
| --- | --- | --- | --- | --- |
| Entry redirect | `/` | Resolve the default destination and authentication guard | Open the root URL and assert the final guarded route for the current session | None or the intended seeded role |
| Public authentication | `/login`, `/register`, `/forgot-password`, `/account-access` | Sign in, open registration and password recovery, recover partial accounts | Assert labelled fields, validation/errors, destination URL, and active-account routing | Public pages need no account; use the seeded accounts below for sign-in |
| Student dashboard | `/student`, `/student/dashboard` | View greeting, recent requests, upcoming consultations, and feature links | Sign in as Student; assert identity-specific heading and navigation without console/network failure | `student@example.test` / `Student-demo-123!` |
| Mentor discovery and help request | `/student/mentors`, `/student/mentors/:mentorId/request` | Search/filter Mentors, expand details, paginate, select a module, submit a request | Use the seeded Student and Mentor catalogue; assert result identity, chosen module, explicit form feedback, and persisted destination | Student account; `aisha@example.test` supports seeded modules |
| Student requests | `/student/requests`, `/student/requests/:id` | Page through history, inspect status/details, open eligible conversation | Seed or create synthetic requests; assert order, status, persisted fields, and authorization-visible actions | Student plus matching synthetic requests |
| Student conversations | `/student/conversations`, `/student/conversations/:requestId` | Open eligible chat, page history, send, retry, observe read state | Use an accepted synthetic request; assert persisted message identity/order and error/retry state | Matched Student/Mentor accounts and accepted request |
| Consultation booking | `/student/consultations`, `/mentor/consultations`; both dashboards | Mentor publishes 30–120 minute availability; Student books an open slot; another Student cannot take it; either participant cancels under the role-specific policy | Run the `consultation booking` journey against the isolated emulator stack; assert cross-role persistence, immediate confirmation, stale-slot removal, dashboard reflection, responsive layout, and browser diagnostics | `mentor@example.test`, `student@example.test`, and `jamie.tan@example.test` seeded accounts |
| Student study assistant placeholder | `/student/study-assistant` | Navigate to the workspace placeholder | Assert route, heading/copy, and shell navigation | Seeded Student |
| Mentor dashboard and profile | `/mentor/dashboard`, `/mentor/profile` | View request summary; inspect and edit profile/module availability | Sign in as Mentor; assert identity, saved/reloaded fields, validation, and responsive controls | `mentor@example.test` / `Mentor-demo-123!` or `aisha@example.test` / `Aisha-demo-123!` |
| Mentor requests | `/mentor/requests`, `/mentor/requests/:id` | Page pending/decided requests; accept or reject with confirmation | Create isolated synthetic request; assert authorized transition, terminal state, and Student-visible persistence | Matched seeded Student/Mentor pair |
| Mentor conversations | `/mentor/conversations`, `/mentor/conversations/:requestId` | List/open eligible chats, send and receive, page history | Use accepted synthetic request; assert both-role convergence and persisted content | Matched Student/Mentor accounts |

## Maintained smoke coverage

`app-verification/tests/app-smoke.spec.ts` currently proves:

- the rendered login journey reaches password recovery with labelled controls;
- the seeded Student signs in through Auth, Firestore, Functions, and Rules emulators and reaches `/student/dashboard`;
- the `consultation booking` journey publishes availability as a Mentor, books it as one Student, proves it disappears for another Student, and verifies the Mentor-visible booking details;
- browser console errors, uncaught page errors, and failed requests are attached to each result; expected `net::ERR_ABORTED` cancellation of Firestore Listen channels remains recorded but does not fail the smoke, while every other diagnostic error does;
- success screenshots are retained alongside failure-only traces/video configured by Playwright.

Add feature-specific tests beside the smoke file and tag the title with a stable journey phrase so `--grep` can select it. Use unique synthetic identifiers for tests that write data; do not depend on production or shared human accounts.
