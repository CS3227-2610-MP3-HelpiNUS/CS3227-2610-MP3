# Frontend foundation handoff

## Source state

- Base commit: `d674f3d4f7f322df58cdeca9d96028e4e614b278`
- Branch: `zh/feat-frontend-foundation`
- Frontend implementation: `6091530`

## Integration entry points

- `src/frontend/src/services/contracts.ts` defines the service boundary used by
  components. Domain entities come from `@helpinus/shared`.
- `src/frontend/src/services/mockServices.ts` supplies the Student preview and
  current UI sample data.
- `src/frontend/src/services/firebaseServices.ts` loads the authenticated
  Firebase identity and validates its own `users/{uid}` profile with the shared
  schema. Its dashboard operation intentionally still returns sample data.
- `src/frontend/src/services/firebaseConfig.ts` selects the
  `helpinus-dev` or `helpinus-prod` public browser config. Emulator connections
  require a development build, `VITE_USE_FIREBASE_EMULATORS=true`, and a
  loopback host.
- `src/frontend/src/routes/ProtectedRoute.tsx` denies missing, non-active, or
  wrong-role profiles and redirects signed-out users to `/login`.

## Route inventory

- Public: `/login`, `/register`, `/forgot-password`, `/account-access`.
- Student: `/student/dashboard`, `/student/mentors`, `/student/requests`,
  `/student/conversations`, `/student/consultations`, and
  `/student/study-assistant`.
- Mentor guard completeness: `/mentor/dashboard`.

Auth pages, domain workflows, conversations, bookings, and AI assistance are
scaffolds. The dashboard is the only data-rich page and clearly labels fixture
content. Do not treat the scaffolds as implemented backend workflows.

## Verification and limitations

Frontend lint, typecheck, 17 Vitest checks, and production build passed under
Node `v26.8.1` (the repository specifies Node 22). The build leaves Firebase in
a separate lazy-loaded chunk; Vite emits a chunk-size warning for it. The
desktop dashboard was visually checked at 1280×720; there was no available
mobile viewport override for an equivalent screenshot review. The responsive
mobile navigation and single-column layout are implemented in `App.css`.

## Next integration work

1. Connect sign-in, registration, and password recovery to the approved auth
   flow and initialize Student profiles through the callable contract.
2. Replace mock dashboard and route content with adapter methods backed by
   authorized Firestore reads and callable state transitions.
3. Wire participant messaging only through the approved direct message-write
   path; validate all inputs with `@helpinus/shared`.
4. Implement AI features only in the later SoC LLM sprint; this branch makes no
   model calls.
5. Re-run the frontend gates under Node 22 and complete mobile visual and
   accessibility review before integration approval.
