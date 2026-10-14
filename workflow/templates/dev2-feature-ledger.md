# Developer 2 feature ledger — template

Copy this file to `workflow/handoffs/royden/<feature-id>.md` for a feature. Approved SDD snapshots and the ledger travel with the feature branch and PR. The local folder keeps drafts and verified recovery copies.

## Identity and roots

- Feature ID/name:
- Contributor and branch:
- Code worktree (absolute path):
- Local SDD draft/backup root: `C:\Users\royde\Desktop\NUS\Sem 5\CS3227\MP3\Dev2-local-SDD\`
- Parent branch and exact parent commit:
- Approved SDD commit and feature PR target:

## Approval and hash record

Record the human reply reference, not just an artifact header. Add a row after approval and after verifying the exact bytes with SHA-256. Material edits require new review, approval, and hash.

| Artifact (repository path, mirrored in local draft/backup) | Status | SHA-256 | Human approval reference and date | Reviewer evidence |
| --- | --- | --- | --- | --- |
| `docs/mission-brief/<feature-id>-<name>.md` | Draft | — | — | — |
| `docs/features/<feature-id>/GrillingDecisions.md` (if used) | Draft | — | — | — |
| `docs/features/<feature-id>/PRD.md` | Draft | — | — | — |
| `docs/features/<feature-id>/TDD.md` | Draft | — | — | — |
| `docs/features/<feature-id>/RequirementsToTests.md` | Draft | — | — | — |

- Separate implementation authorization (human reply reference, date, scope):
- Local backup path, date, and hash-verification result:
- Changed or superseded package / renewed approval:
- Repository copy hash check and SDD commit SHA:

## Code and verification handoff

- Owned source/test paths and Developer 1 contract requests:
- Applicable automated checks (command, runtime, result):
- Incremental implementation commits (slice, assigned paths, focused checks, SHA):
- Manual RTT observations and outstanding cases:
- Node 22 CI run or pending status:
- Independent spec, code/test, and risk-triggered security review:
- Critical findings, at most two targeted fix rounds, accepted minor follow-ups:
- Guide/log paths and evidence:
- Child branch readiness and outstanding merge blockers:
- Implementation authorization covers incremental local code/test commits; push authorization and PR target (leave blank until given):
- Actual contribution and unresolved assignment-compliance question:

## Feature PR SDD gate

- Approved hashes equal committed bytes and local backup; status labels and links accurate:
- Completeness, secret scan, and documentation consistency:
- Push authorization and Developer 2-opened feature PR:
- Developer 1 agent access follows `AGENTS.md`; merge before `master` promotion:
