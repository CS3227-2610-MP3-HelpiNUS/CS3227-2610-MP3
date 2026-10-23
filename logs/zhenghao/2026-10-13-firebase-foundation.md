# Firebase foundation implementation log

**Date:** 13 October 2026  
**Owner:** ZhengHao  
**Branch:** `zh/feat-firebase-foundation`  
**Base:** `d674f3d4f7f322df58cdeca9d96028e4e614b278`

## Scope delivered

- Added Firebase aliases `helpinus-dev` and `helpinus-prod`, Auth/Firestore/
  Functions emulator configuration, Firestore Rules and the availability query
  index.
- Added Node 22 Cloud Functions v2 in `asia-southeast1`. The build bundles
  `@helpinus/shared` so the uploaded Functions package does not depend on a
  workspace sibling. No Express package or live deployment was added.
- Added shared request validation/error handling, profile-backed auth and role
  checks, `testAuthenticated`, and idempotent Student-only profile setup.
- Added authorized unavailable stubs for remaining approved callables, ADC-based
  trusted Mentor provisioning, and emulator-only Student/Mentor demo fixtures.
- Added unit, Firestore Rules, and Auth/Firestore/Functions emulator integration
  coverage plus GitHub verification and environment-gated deployment workflows.
- Updated the Developer Guide and added a repository lesson about emulator
  command working directories after correcting an invalid nested workspace
  command during setup verification.

## Commits

- `4759411` — Firebase aliases, emulator configuration, Rules/index, and Rules tests.
- `af110c2` — callable authorization, profile initialization, utilities, and unit/integration tests.
- CI and handoff documentation are included in the commit containing this file.

## Verification

- `npm ci --ignore-scripts` — passed from the committed lockfile.
- `npm run check` — passed: lint, typecheck, unit tests, and production builds.
- Functions unit tests — 3 files, 11 passed; shared contract tests — 1 file,
  3 passed.
- `npm run test:rules --workspace src/functions` — passed on Firestore Emulator:
  4 tests covering direct-access allows/denials, query constraints, ownership
  protections, suspended users/mentors, and immutable messages.
- `npm run test:integration --workspace src/functions` — passed on Auth,
  Firestore, and Functions emulators: 2 tests; all 13 callable exports loaded.
- Emulator seed utility — passed against isolated Auth and Firestore emulators;
  only `@example.test` synthetic accounts were created.
- `npm audit --omit=dev --json` — zero reported production dependency
  vulnerabilities. The complete tree reports 17 dev-tool advisories (12 high,
  4 moderate, 1 low); these are in development/testing dependencies.
- Local checks used host Node 26 because Node 22 was not installed. CI is pinned
  to Node 22. No GitHub Actions run or live deployment was performed.

## Human setup required

1. Create the two Firebase projects on the approved Blaze plan; enable
   Email/Password Auth, create Firestore in `asia-southeast1`, and confirm the
   default Hosting site in each project.
2. Add service-account JSON secrets `FIREBASE_SERVICE_ACCOUNT_HELPINUS_DEV` and
   `FIREBASE_SERVICE_ACCOUNT_HELPINUS_PROD` with only the required deploy IAM.
3. Configure GitHub Environment `production` with required human reviewers.
4. Review and run development deployment after merge to `dev-staging`; keep
   production deployment approval manual. Deployment publishes Hosting,
   Functions, Firestore Rules, and indexes; no deployment was run here.

No Firebase projects, credentials, GitHub secrets, PRs, or deployments were
created or changed.
