# Repository agent notes

## Getting better

- Firebase `emulators:exec` runs its command from the configured project context. Avoid nested `npm --workspace` invocations there; use package-local commands with explicit paths and verify the documented command end to end.
