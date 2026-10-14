# Repository agent notes

Developer 2 feature work uses the two-root, local-only SDD procedure in `workflow/agents/README.md`. Read that runbook and the feature ledger before continuing a Developer 2 feature; do not add local SDD files to a feature PR.

## Getting better

- Firebase `emulators:exec` runs its command from the configured project context. Avoid nested `npm --workspace` invocations there; use package-local commands with explicit paths and verify the documented command end to end.
- In this monorepo, pass Impeccable targets relative to the repository root so context resolves the intended child app and source file.
- Keep Firestore list authorization equivalent to direct-document authorization, and test stale denormalized flags plus multiline content explicitly.
- Treat identity creation as partial until display-name recovery, email verification, and password onboarding are actionable; discard async session reads after the Auth identity changes.
- Pin every third-party GitHub Action to a reviewed full commit SHA, with the release version retained as a comment.
- CI jobs that run Firebase emulators must explicitly install JDK 21 or newer; never rely on the hosted runner's changing Java default.
- The macOS system Ruby may ship an older Psych API; use basic `YAML.load_file(path)` for a lightweight workflow syntax check instead of newer keyword arguments.
