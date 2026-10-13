# Repository agent notes

## Getting better

- Firebase `emulators:exec` runs its command from the configured project context. Avoid nested `npm --workspace` invocations there; use package-local commands with explicit paths and verify the documented command end to end.
- In this monorepo, pass Impeccable targets relative to the repository root so context resolves the intended child app and source file.
- Keep Firestore list authorization equivalent to direct-document authorization, and test stale denormalized flags plus multiline content explicitly.
- Treat identity creation as partial until display-name recovery, email verification, and password onboarding are actionable; discard async session reads after the Auth identity changes.
- Pin every third-party GitHub Action to a reviewed full commit SHA, with the release version retained as a comment.
