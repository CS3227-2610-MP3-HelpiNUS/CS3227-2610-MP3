# Sprint 1 authentication and role routing

**Date:** 13 October 2026  
**Owner:** ZhengHao  
**Branch:** `zh/feat-auth-role-routing`

## Delivered

- Connected email/password Student registration, sign-in, sign-out, and auth
  state restoration through the frontend service adapter.
- Registration sends only display name, email, and password, creates the Auth
  identity, then calls `initializeStudentProfile`. A partial setup has an
  idempotent retry path; email verification is refreshed before retry.
- Session validation reads the matching `users/{uid}` document through the
  shared user schema, checks identity email and verified-email state, and fails
  closed for missing, malformed, mismatched, suspended, disabled, or
  unverified profiles.
- The public form has no role or status input. Student and Mentor routes use
  the trusted profile role; wrong-role access routes to the proper dashboard.
  Mentor provisioning remains backend-only.
- Added frontend auth-flow tests and User/Developer guide instructions. Domain
  dashboards remain fixtures/scaffolds and no SoC LLM call was added.

## Verification

- `npm run check` — passed: lint, typecheck, all workspace tests (frontend 25,
  Functions unit 11, shared 3), and production builds.
- `npm run test:rules --workspace src/functions` — passed, 4 Firestore Rules
  tests.
- `npm run test:integration --workspace src/functions` — passed, 2 Auth,
  Firestore, and Functions emulator integration tests; all callable exports
  loaded.
- `git diff --check` — passed.
- Local emulator commands used Node 26 (Functions requested Node 22); no live
  Firebase project, CI run, or deployment was used. Vite reports the existing
  Firebase adapter chunk exceeds 500 kB minified.

## Human setup and limits

Live Firebase Email/Password Auth and Web App configuration remain Firebase
console setup. The implementation can be demonstrated locally with the Auth,
Firestore, and Functions emulators and the documented `@example.test` demo
accounts. No live Firebase console action, deployment, push, merge, or PR is
part of this change.
