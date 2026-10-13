# HelpiNUS User Guide

## 1. About HelpiNUS

HelpiNUS helps NUS Students find suitable Mentors, request academic help,
communicate, book consultations, and receive role-specific AI assistance.
Mentors manage requests, availability, consultations, and AI-supported
summaries.

Sprint 1 provides account creation, sign-in, sign-out, session restoration,
role-based access, a Student dashboard with clearly labelled sample data, and
the navigation structure for upcoming features. Mentor discovery, help-request
management, conversations, consultation booking, and AI actions are currently
scaffolds and do not yet complete their domain workflows.

## 2. Supported users and devices

HelpiNUS has two roles:

- **Student** — may register publicly and access Student pages.
- **Mentor** — must be provisioned by a trusted administrator.

Laptop and mobile browsers are equally supported. The application targets WCAG
2.1 AA, including keyboard access, visible focus, semantic form labels,
sufficient contrast, and reduced-motion support.

## 3. Create a Student account

1. Open HelpiNUS and choose **Create a Student account**.
2. Enter your display name, email address, and password.
3. Select **Create Student account**.
4. Open the verification email from Firebase and verify the address.
5. Return to HelpiNUS and select **I’ve verified my email**. If the original
   message is unavailable, select **Send verification email** first.
6. If prompted, enter your name and select **Retry Student profile setup**.

Public registration always creates an `ACTIVE` Student profile. The form does
not accept a role or account status, so it cannot create a Mentor account or
elevate privileges.

Firebase creates the sign-in identity before HelpiNUS creates the authoritative
profile. If the second step is interrupted, the account remains unable to open
protected pages until the safe retry succeeds. The retry never changes an
existing role.

## 4. Sign in and restore a session

1. Enter the registered email and password.
2. Choose **Sign in**.
3. HelpiNUS verifies the identity and authoritative profile.
4. Students are sent to `/student/dashboard`; provisioned Mentors are sent to
   `/mentor/dashboard`.

Reloading the page restores a valid session. A missing, malformed, suspended,
disabled, email-mismatched, or unverified account fails closed and displays a
recovery explanation. If a local Auth emulator is restarted, an identity left
in browser storage is signed out automatically instead of becoming permanently
stuck.

If email verification is still required, use **Send verification email** (or
**Resend verification email** after the first request), complete verification,
then select **I’ve verified my email**. These controls remain available after a
page reload.

## 5. Student navigation

Desktop navigation appears in the left sidebar. On smaller screens, primary
destinations move to the bottom navigation and sign-out remains available in
the header.

| Destination | Current Sprint 1 behaviour |
| --- | --- |
| Dashboard | Shows representative, clearly labelled sample data |
| Find a mentor | Route and interface scaffold |
| Help requests | Route and interface scaffold |
| Conversations | Route and interface scaffold |
| Consultations | Route and interface scaffold |
| Study assistant | Route and interface scaffold; no live LLM call |

Use **Skip to content** when navigating by keyboard to bypass repeated
navigation. The HelpiNUS brand returns to the dashboard for the authenticated
role.

## 6. Mentor access

Mentors cannot register through the public form. An administrator provisions a
Mentor with a trusted backend script. After provisioning, the Mentor signs in
with the supplied Firebase Authentication identity and is routed to the Mentor
dashboard. Student URLs redirect back to the Mentor dashboard.

The Mentor dashboard and future Mentor workflows are scaffolds in Sprint 1.

## 7. Sign out

On a laptop, choose **Sign out** at the bottom of the sidebar. On mobile, choose
**Sign out** in the top header. A successful sign-out returns to the login page.
If the network operation fails, HelpiNUS keeps the current screen and shows a
retryable error instead of pretending the session ended.

## 8. Run HelpiNUS locally with mock data

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run dev --workspace src/frontend
```

If no Firebase Web configuration is present, HelpiNUS intentionally uses its
mock service adapter. Open the URL printed by Vite. This mode demonstrates the
Student dashboard and navigation without contacting Firebase.

## 9. Run with Firebase emulators

Copy and configure the frontend environment:

```bash
cp src/frontend/.env.example src/frontend/.env.local
```

Add the `helpinus-dev` Firebase Web App values and set:

```text
VITE_FIREBASE_ENV=development
VITE_USE_FIREBASE_EMULATORS=true
```

Start Auth, Firestore, and Functions emulators:

```bash
npx firebase-tools emulators:start --only auth,firestore,functions \
  --project helpinus-dev
```

In another terminal, seed the demo users:

```bash
FUNCTIONS_EMULATOR=true \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
npm run seed:emulator --workspace src/functions
```

Then start the frontend:

```bash
npm run dev --workspace src/frontend
```

### Emulator-only accounts

| Role | Email | Password |
| --- | --- | --- |
| Student | `student@example.test` | `Student-demo-123!` |
| Mentor | `mentor@example.test` | `Mentor-demo-123!` |

These synthetic accounts bypass email verification only while the application
is explicitly connected to the local emulators. Do not create or use them in a
real Firebase project.

## 10. Manual Sprint 1 verification

### Mock frontend

1. Remove or temporarily rename `src/frontend/.env.local`.
2. Start the frontend.
3. Confirm the Student dashboard renders sample data.
4. Open every Student navigation destination and confirm it renders its
   accurately labelled scaffold.
5. Narrow the browser to a phone-sized viewport.
6. Confirm bottom navigation, header branding, and mobile sign-out are usable.
7. Use only the keyboard to reach navigation, form controls, and sign-out;
   verify the focus indicator remains visible.

### Emulator Student

1. Start and seed the emulators using Section 9.
2. Sign in as `student@example.test`.
3. Confirm the Student dashboard opens.
4. Reload and confirm the session is restored.
5. Enter `/mentor/dashboard` manually and confirm the app returns to the Student
   dashboard.
6. Sign out and confirm protected URLs return to login.

### Emulator Mentor

1. Sign in as `mentor@example.test`.
2. Confirm the Mentor dashboard opens.
3. Enter `/student/dashboard` manually and confirm the app returns to the Mentor
   dashboard.
4. Confirm both desktop and mobile sign-out work.

### Registration and recovery

1. Register a new `@example.test` Student while using the emulator.
2. Confirm no role selector is shown.
3. Confirm the new account reaches the Student dashboard.
4. Stop and restart the Auth emulator without clearing browser storage.
5. Refresh HelpiNUS and confirm the stale local identity is safely returned to
   signed-out state.
6. In a real development project, repeat registration with a non-synthetic
   address and confirm protected access is denied until email verification and
   profile retry succeed.

## 11. Troubleshooting

### “We couldn’t load your account”

- Confirm all three emulators are running if emulator mode is enabled.
- Confirm the frontend uses loopback emulator hosts.
- Restart the frontend after changing `.env.local`.
- Select **Try again** after connectivity is restored.
- A stale emulator identity should now be removed automatically; if an older
  build is still cached, use a private window or clear the site data once.

### “Verify your email”

Open the Firebase verification message, complete verification, return to
HelpiNUS, and select **I’ve verified my email**. Use **Send verification email**
or **Resend verification email** when needed.

### “Your profile is not ready”

Enter the Student name and choose **Retry Student profile setup**. This also
repairs an Auth identity whose display name could not be saved during initial
registration. If the profile remains unavailable, confirm that the Functions
emulator or deployed `initializeStudentProfile` function is reachable.

### “Firebase is not configured”

Check that every required `VITE_FIREBASE_DEV_*` value is present in
`src/frontend/.env.local`, then restart Vite. Never paste a service-account JSON
key into the frontend configuration.

### Forgot password

The page is currently a Sprint 1 placeholder. Password-reset delivery has not
yet been implemented; use the Firebase console only for authorized development
accounts until that feature is adopted.
