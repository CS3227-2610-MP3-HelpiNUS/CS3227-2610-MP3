# HelpiNUS Developer Guide

The approved requirements and architecture records live in
`workflow/specs/sprint-1`. The initial end-user walkthrough is in
[`UserGuide.md`](UserGuide.md).

## Technology baseline

- Node.js 22
- React, TypeScript, and Vite
- Tailwind CSS
- Firebase Authentication, Firestore, Cloud Functions, Hosting, and Emulator
  Suite
- Zod runtime validation
- Vitest and React Testing Library

## Authorization design

The frontend uses email/password Firebase Authentication through
`src/frontend/src/services/firebaseServices.ts`; React components depend on the
service adapter contract. Registration creates a Firebase identity and invokes
the authenticated `initializeStudentProfile` callable. The public form sends
only a display name, email, and password; the callable assigns `STUDENT` and
`ACTIVE`. A failed profile call leaves a recoverable retry path. The auth-state
listener restores the session after reloads and sign-in/sign-out changes.

The frontend reads `users/{uid}` and validates it with the shared user schema.
The document ID must match the authenticated UID and the profile email must
match the Auth identity. Missing, malformed, mismatched, inactive, or
unverified accounts fail closed. Production and non-emulator accounts must
verify email. Only synthetic `@example.test` users when the frontend is
explicitly connected to the local development Auth emulator bypass that check.
An ACTIVE profile's role alone selects Student or Mentor routes; a wrong-role
route redirects to the profile's dashboard. No public Mentor selector or
client-side privileged profile write exists. Trusted Mentor provisioning
remains the Admin SDK utility described below.

The Firestore document `users/{uid}` is the single authoritative record for a
user's `STUDENT` or `MENTOR` role and `ACTIVE`, `SUSPENDED`, or `DISABLED`
status. It is writable only by trusted Admin SDK code.

The simpler single-source-of-truth design is worth more for HelpiNUS than
avoiding an authorization document lookup. It keeps trusted profile creation,
account suspension, emulator fixtures, and authorization tests aligned while
avoiding drift between custom claims and Firestore.

Protected operations deny access until the authenticated user's profile exists.
Student profile initialization is idempotent and can be retried without allowing
the caller to select a privileged role. See the architecture record for the
approved direct-access matrix.

## Branch flow

Feature branches use `zh/<type>-<short-kebab-case-name>` and target
`dev-staging`. Development deployment and integration testing happen there.
Promotion to `master` requires a reviewed pull request, and production deployment
requires manual approval.

## Firebase backend

The Cloud Functions v2 package lives in `src/functions` and consumes the
schemas from `@helpinus/shared`. Protected callables read `users/{uid}` on each
request; role and status in that document are authoritative. Public profile
initialization accepts only a display name, provisions `STUDENT` / `ACTIVE`,
and can be safely retried. Domain callable entry points that are not implemented
yet validate their shared input, authorize the actor, then return an explicit
unavailable error without writing data.

Use Firebase project aliases `helpinus-dev` and `helpinus-prod`. Before the
first deployment, an administrator must create both Firebase projects on the
approved Blaze plan, enable Email/Password Authentication, and create Firestore
in `asia-southeast1` (Firestore database location is selected at project setup).
Create or confirm each project's default Firebase Hosting site; the deployment
builds the existing frontend into `src/frontend/dist` before publishing it.
Grant each deployment service account the Firebase deploy permissions required
for Hosting, Functions, and Firestore rules/indexes. Configure repository secret
`FIREBASE_SERVICE_ACCOUNT_HELPINUS_DEV`; configure
`FIREBASE_SERVICE_ACCOUNT_HELPINUS_PROD` as a secret on the GitHub `production`
Environment. Add required reviewers to that Environment so master deployments
pause for human approval. These steps are human setup; this implementation does
not create Firebase projects, credentials, GitHub secrets, or deployments.

The emulators use Auth `9099`, Firestore `8080`, and Functions `5001`. Run
`npm run test:rules --workspace src/functions` and
`npm run test:integration --workspace src/functions` after `npm ci` to execute
the Rules suite and callable integration suite. Demo accounts exist only in the
emulators:

| Role | Email | Password |
| --- | --- | --- |
| Student | `student@example.test` | `Student-demo-123!` |
| Mentor | `mentor@example.test` | `Mentor-demo-123!` |

Start both Auth and Firestore emulators first, then run the fixture utility with
both emulator host variables configured:
`FUNCTIONS_EMULATOR=true FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed:emulator --workspace src/functions`.
Synthetic `@example.test` accounts bypass email verification only while the
Functions emulator is running. Production callables require verified email.
For the frontend, copy `src/frontend/.env.example` to a local environment file,
provide the development Web App config, set `VITE_USE_FIREBASE_EMULATORS=true`,
and run `npm run dev --workspace src/frontend`. The frontend emulator bypass is
also limited to a development build explicitly connected to loopback emulators
and the `@example.test` suffix. Run the frontend suite with
`npm run test --workspace src/frontend` to check auth screens, session
restoration, role routing, and account denial states.
Mentors are created with the trusted utility
`npm run provision:mentor --workspace src/functions -- <email> "<display name>"`;
it uses Application Default Credentials and requires an explicit target project
through `GCLOUD_PROJECT` or `FIREBASE_PROJECT_ID`.
