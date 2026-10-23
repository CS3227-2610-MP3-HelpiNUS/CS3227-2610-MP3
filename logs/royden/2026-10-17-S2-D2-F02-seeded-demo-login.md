# S2-D2-F02 seeded demo login correction

## Report and reproduction

The user entered different credentials but always reached Jamie Tan. The mock preview was selected because `src/frontend/.env.local` was absent and the root emulator launcher supplied only `VITE_USE_FIREBASE_EMULATORS`, not the web configuration required by `getFirebaseConfig`. Independently, the mock session's `signIn` ignored email and password and returned Jamie Tan. A focused mock sign-in test failed with a resolved Jamie Tan user for Aisha's credentials; a launcher test failed because the spawned Vite environment lacked `VITE_FIREBASE_DEV_PROJECT_ID`.

## Correction

Commit `a46778c` makes the root launcher supply fixed, synthetic `helpinus-dev` Firebase web settings to Vite, so `npm run dev:emulators` selects Auth, Firestore and Functions Emulators without a local `.env` file. Mock preview sign-in now rejects with a visible explanation instead of impersonating Jamie. The emulator seed adds verified Jamie Tan and Sample Aisha accounts, with Aisha offering two active modules. The existing Demo Student and Demo Mentor accounts remain available. User and Developer Guides list the credentials and steps.

## Verification

Both focused regression tests went red before the code change and green afterward. Root `npm run check` passed on Node 22: lint, typecheck, frontend 187/187, Functions 36/36, shared 12/12, and build. An isolated Auth/Firestore/Functions Emulator integration test passed 1/1 after signing in as both seeded users, finding Aisha in Mentor discovery, creating Jamie's request, accepting it as Aisha, and reading the conversation as both participants under Rules. The first isolated run passed the request and acceptance path; a rerun passed after adding the discovery assertion. The emulator processes were cleaned up after the run.

The test uses synthetic local accounts only. It does not establish production or full RTT release readiness.
