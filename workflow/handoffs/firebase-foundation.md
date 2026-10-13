# Firebase foundation handoff

## Source state

- Base commit: `d674f3d4f7f322df58cdeca9d96028e4e614b278`
- Branch: `zh/feat-firebase-foundation`
- Owner: ZhengHao
- `4759411` — Firebase aliases, emulator configuration, Rules/index, Rules tests.
- `af110c2` — callable authorization, profile initialization, utilities, unit/integration tests.
- CI and handoff documentation are included in the commit containing this file.

## Delivered boundaries

- `.firebaserc` maps `helpinus-dev` and `helpinus-prod` to distinct projects.
- Auth, Firestore, and Functions emulators use ports 9099, 8080, and 5001.
- Functions v2 use Node 22 and `asia-southeast1`; esbuild bundles shared
  contracts into `src/functions/lib/index.js` to keep deployment self-contained.
- `users/{uid}` remains the sole role/status authority. Protected callables fail
  closed for missing, inactive, malformed, mismatched-email, or unverified
  profiles. Only synthetic `@example.test` identities bypass verification in
  the Functions emulator.
- `initializeStudentProfile` is authenticated and idempotently creates only an
  `ACTIVE` `STUDENT`; caller-supplied role/status are stripped by the shared
  schema. Other approved callable seams validate and authorize before returning
  an explicit unavailable error without domain persistence.
- Rules implement the approved direct-access matrix. Messages are participant
  readable and create-only, require self as sender, enforce length bounds, and
  require server request time. Availability query filters and index are covered.
- The Mentor provisioner uses Application Default Credentials and requires an
  explicit target project. The demo seed utility requires both Auth and
  Firestore emulator host variables.
- GitHub Actions verify the workspace and both emulator suites. Pushes to
  `dev-staging` deploy to `helpinus-dev`; pushes to `master` target `helpinus-prod`
  behind the `production` GitHub Environment.

## Verification results

- `npm ci --ignore-scripts` — passed.
- `npm run check` — passed (lint, typecheck, unit tests, and builds).
- Functions unit tests: 3 files / 11 passed; shared contract tests: 1 file /
  3 passed.
- `npm run test:rules --workspace src/functions` — passed, 4 Rules tests.
- `npm run test:integration --workspace src/functions` — passed, 2 emulator
  integration tests; all 13 callable exports loaded.
- Emulator seed utility — passed against Auth and Firestore emulators.
- `npm audit --omit=dev --json` — zero runtime dependency findings. Full tree:
  17 development-tool advisories (12 high, 4 moderate, 1 low).
- Local execution used Node 26; emulator output warned that the configured
  runtime is Node 22. GitHub Actions uses Node 22. No live deploy or CI run.

## Human setup required

1. Create `helpinus-dev` and `helpinus-prod`, enable Email/Password Auth,
   provision Firestore in `asia-southeast1`, and confirm each default Hosting
   site. The workflow builds the existing frontend before Hosting deployment;
   no frontend UI files were changed.
2. Add `FIREBASE_SERVICE_ACCOUNT_HELPINUS_DEV` as a repository secret and
   `FIREBASE_SERVICE_ACCOUNT_HELPINUS_PROD` as a secret on the `production`
   GitHub Environment. Grant least-privilege Firebase deployment roles.
3. Add required reviewers to GitHub Environment `production`.
4. Review the deployment workflow and configure the human production approval
   process before any production promotion.

No projects, service-account credentials, GitHub secrets, PRs, or deployments
were created or modified.
