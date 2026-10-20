# HelpiNUS verification feature map

Keep this map aligned with `src/frontend/src/routes/appRoutes.tsx`. All browser verification uses the local `helpinus-dev` Firebase emulators and synthetic accounts from `src/functions/scripts/seed-emulator.ts`.

| Area | Routes / navigation | Important interactions | Verification approach | Test data |
| --- | --- | --- | --- | --- |
| Entry redirect | `/` | Resolve the default destination and authentication guard | Open the root URL and assert the final guarded route for the current session | None or the intended seeded role |
| Public authentication | `/login`, `/register?role=STUDENT`, `/register?role=MENTOR`, `/forgot-password`, `/account-access` | Choose Student or Mentor before Google sign-in, register the selected role, switch roles, open Google Account Recovery guidance, recover a missing display name | Assert role-specific destination and registration, refresh and route guards, recovery link, and active-account routing | Public pages need no account; seeded and new synthetic accounts are linked to mock `google.com` identities |
| Student dashboard | `/student`, `/student/dashboard` | View greeting, recent requests, upcoming consultations, and feature links | Sign in as Student through mock Google; assert identity-specific heading and navigation without console/network failure | Seeded Google identity `student@example.test` |
| Mentor discovery and help request | `/student/mentors`, `/student/mentors/:mentorId/request` | Search/filter Mentors, expand details, paginate, select a module, submit a request | Use the seeded Student and Mentor catalogue; assert result identity, chosen module, explicit form feedback, and persisted destination | Student account; `aisha@example.test` supports seeded modules |
| Student requests | `/student/requests`, `/student/requests/:id` | Page through history, inspect status/details, open eligible conversation | Seed or create synthetic requests; assert order, status, persisted fields, and authorization-visible actions | Student plus matching synthetic requests |
| Student conversations | `/student/conversations`, `/student/conversations/:requestId` | Open eligible chat, page history, send, retry, observe read state | Use an accepted synthetic request; assert persisted message identity/order and error/retry state | Matched Student/Mentor accounts and accepted request |
| Student placeholders | `/student/consultations`, `/student/study-assistant` | Navigate to the workspace placeholders | Assert route, heading/copy, and shell navigation | Seeded Student |
| Mentor dashboard and profile | `/mentor/dashboard`, `/mentor/profile` | View request summary; inspect and edit profile/module availability | Sign in as Mentor through mock Google; assert identity, saved/reloaded fields, validation, and responsive controls | Seeded Google identity `mentor@example.test` or `aisha@example.test` |
| Mentor requests | `/mentor/requests`, `/mentor/requests/:id` | Page pending/decided requests; accept or reject with confirmation | Create isolated synthetic request; assert authorized transition, terminal state, and Student-visible persistence | Matched seeded Student/Mentor pair |
| Mentor conversations | `/mentor/conversations`, `/mentor/conversations/:requestId` | List/open eligible chats, send and receive, page history | Use accepted synthetic request; assert both-role convergence and persisted content | Matched Student/Mentor accounts |

## Maintained smoke coverage

`app-verification/tests/app-smoke.spec.ts` currently proves:

- the rendered login journey requires a Student or Mentor choice before Google authentication and reaches Google Account Recovery guidance;
- seeded Student and Mentor identities sign in through the Auth Emulator's mock Google provider and route from authoritative profiles;
- a new mock Google identity is provisioned only as an ACTIVE Student and reaches `/student/dashboard`;
- a new mock Google identity can register as Mentor and Student on one UID, switch roles, refresh, and remain behind the selected-role route guard;
- browser console errors, uncaught page errors, and failed requests are attached to each result; expected `net::ERR_ABORTED` cancellation of Firestore Listen channels remains recorded but does not fail the smoke, while every other diagnostic error does;
- success screenshots are retained alongside failure-only traces/video configured by Playwright.

Add feature-specific tests beside the smoke file and tag the title with a stable journey phrase so `--grep` can select it. Use unique synthetic identifiers for tests that write data; do not depend on production or shared human accounts.
