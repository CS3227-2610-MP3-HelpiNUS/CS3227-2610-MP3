# Authentication flow verification — 21 October 2026

Branch: `zh/fix-auth-flows`. All runtime checks used disposable identities in
local Firebase emulators and Node 22. Port 5173 was not used or stopped.

## Expected behavior

- `/login` asks whether a HelpiNUS account already exists.
- New users choose Student (mentee) or Mentor at `/register`, then explicitly
  authenticate through Google. Returning users choose their existing role at
  `/login?existing=1`, then authenticate through Google.
- Registration and profile recovery preserve the authenticated Firebase UID;
  a UID cannot acquire the other role through public callables or provisioning.
- Desktop and mobile dashboards do not offer role switching.
- Google manages passwords. Local Auth Emulator popup behavior and staging
  Google OAuth configuration selection are unchanged.

## Commands and results

Run from the repository root with Node 22:

```sh
npm run check
npm run verify:app -- --port 5174 --grep 'Google|seeded'
npm run verify:app:grade
npm run verify:app:grade -- --self-test
```

- Repository check: PASS — lint, typecheck, 378 unit/component tests, builds.
- Browser smoke: PASS — all seven maintained authentication journeys.
- Structural grader: PASS — required files, safe launcher wiring, route map,
  syntax and discovery. Complete fixtures/discovery pass; missing launcher and
  missing cross-role journey fixtures fail as intended.
- Impeccable detector: no findings in the changed auth page, shell and CSS.
  Entry and registration screenshots were visually inspected at desktop and
  390-pixel mobile widths; the existing application design was preserved.

Backend callable integration and Firestore Rules command:

```sh
env -u GOOGLE_APPLICATION_CREDENTIALS -u FIREBASE_TOKEN \
  node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec \
  --only auth,firestore,functions --project helpinus-integration-test \
  "node node_modules/vitest/vitest.mjs run --root src/functions integration-tests/callables.test.ts rules-tests/access.test.ts --no-file-parallelism"
```

Result: PASS — 29 tests. Includes concurrent Student/Mentor registration (one
winner, one ALREADY_EXISTS), profile persistence/idempotency, Google-provider
requirements, and protected direct/list read denial for dual-role records.

## Browser evidence and repairs

Final complete run: `.verify-app/runs/2026-10-21T06-47-35-098Z/`.
The directory contains `application.log`, the Playwright HTML report,
screenshots and per-journey browser diagnostics. Failure traces are retained
in earlier runs `2026-10-21T06-39-55-524Z` and `2026-10-21T06-43-07-017Z`.

The initial checks revealed test navigation racing async sign-out and closing
a popup before its provider page rendered. Tests now wait for the completed
login redirect and the rendered provider before taking the next action. A
trace-confirmed local Firestore Listen `TYPE=terminate` HTTP 400 response during
logout is retained in diagnostics and narrowly classified as expected; all
unrelated console errors still fail. The affected journeys passed focused
reruns, followed by the seven-test complete run.

Coverage includes fresh-browser registration, returning login, missing-profile
guidance, popup cancellation, missing-name recovery, refresh/logout, wrong-role
login, responsive absence of switching, and direct cross-role API attempts.
Owned verification processes shut down, exported their isolated data, and
removed `.verify-app/active.json`; ports 5174, 8080, 9099 and 5001 were free after
the run. The prior manually launched stack was stopped with user authorization;
its export under `.emulator-data-auth-smoke/` was retained and ignored by Git.

## Existing accounts and limitations

No live accounts were read, rewritten or deleted. Existing single-role accounts
continue to work. A matching legacy Mentor copy in `users/{uid}` is retained
when migrated idempotently into `mentors/{uid}`. Existing Student+Mentor
conflicts fail closed and need support review; no role is automatically chosen
and no destructive migration runs.

Keep Firebase Authentication configured for one account per email and Google
as the only public provider. Real staging OAuth, provider/domain configuration,
cloud IAM and deployment were not exercised. Structural grading and the design
detector do not establish semantic correctness or complete accessibility; no
independent semantic evaluation score is claimed.
