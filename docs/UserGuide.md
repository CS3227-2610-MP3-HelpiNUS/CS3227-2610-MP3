# HelpiNUS User Guide

## Create a Student account

Choose **Create a Student account** on the sign-in page. Enter your name,
email, and password. Public registration always creates a Student profile;
there is no role selector. In a configured Firebase project, HelpiNUS sends an
email verification message. Verify the address before using protected pages.

Authentication creates the sign-in identity first, then HelpiNUS creates the
trusted Student profile. If setup is interrupted, sign in again and choose
**Retry Student profile setup**. A missing or invalid profile cannot enter the
application. Suspended or disabled accounts should contact HelpiNUS support.

## Sign in and navigate

Use your email and password to sign in. HelpiNUS checks your account profile
and opens the dashboard for its trusted role: Students go to the Student
dashboard and provisioned Mentors go to the Mentor dashboard. The navigation
shows the pages available to that role. Use **Sign out** in the sidebar to end
the session.

The mentor, requests, conversations, consultations, and study assistant pages
are Sprint 1 interface scaffolds. The Student dashboard uses clearly labelled
sample data; these pages do not yet perform their complete domain workflows.

## Local demo accounts

The following synthetic accounts are for the Firebase emulators only:

| Role | Email | Password |
| --- | --- | --- |
| Student | `student@example.test` | `Student-demo-123!` |
| Mentor | `mentor@example.test` | `Mentor-demo-123!` |

Start Auth, Firestore, and Functions emulators, then seed the demo users with
the command in the Developer Guide. These addresses bypass email verification
only in the local emulator setup. Do not use them in production.
