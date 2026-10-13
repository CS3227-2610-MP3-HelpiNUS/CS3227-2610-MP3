# Authentication and role routing handoff

## Integration points

- `src/frontend/src/services/contracts.ts` contains the auth adapter boundary.
- `firebaseServices.ts` owns Firebase Auth operations, callable profile setup,
  shared-schema validation, and profile-backed session resolution.
- `ServiceProvider.tsx` subscribes to auth state for session restoration and
  refresh; React pages call service methods only.
- `AuthPages.tsx` provides Student registration, email/password login, retry
  after partial profile initialization, and non-privileged access states.
- `ProtectedRoute.tsx` sends signed-out users to login, invalid/inactive users
  to account access, and wrong-role users to their profile-authorized dashboard.
- Public profile initialization uses the existing trusted
  `initializeStudentProfile` callable. No direct user-profile writes or public
  Mentor provisioning were added.

## Emulator demonstration

Configure the development Firebase Web App values from
`src/frontend/.env.example`, enable the loopback emulators with
`VITE_USE_FIREBASE_EMULATORS=true`, seed the two documented demo users, then
run the frontend. Demo sign-in is `student@example.test` /
`Student-demo-123!` or `mentor@example.test` / `Mentor-demo-123!`. The
verification bypass is restricted to the development frontend explicitly
connected to emulators and the exact synthetic suffix; backend enforcement
remains in place.

## Verification and remaining work

Frontend tests cover registration without role selection, recoverable profile
setup, login, logout, auth listener restoration, role redirects, and suspended
or disabled access. `npm run check` passed (frontend 25 tests, Functions 11,
shared 3); `npm run test:rules --workspace src/functions` passed (4 tests); and
`npm run test:integration --workspace src/functions` passed (2 tests, all
callable exports loaded). Local emulators used Node 26 although Functions
request Node 22. Live Firebase project setup and Email/Password enablement
remain human console tasks; no AI/domain workflows were implemented. See the
implementation log for full outcomes and commit hashes.

## Commits

- `efb76af` — auth and routing implementation with tests.
- `2a12cdd` — callable-compatible profile retry.
- `b7d102e` — user/developer guide and handoff documentation.
