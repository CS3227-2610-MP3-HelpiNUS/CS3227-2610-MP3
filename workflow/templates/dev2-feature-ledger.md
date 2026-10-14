# Developer 2 feature ledger — template

Copy this file to `workflow/handoffs/royden/<feature-id>.md` for a feature. The ledger may travel with code; the full SDD package stays in the canonical local folder until the final docs-only import.

## Identity and roots

- Feature ID/name:
- Contributor and branch:
- Code worktree (absolute path):
- Canonical SDD root: `C:\Users\royde\Desktop\NUS\Sem 5\CS3227\MP3\Dev2-local-SDD\`
- Parent branch and exact parent commit:
- SDD publication state: **local-only until final submission**

## Approval and hash record

Record the human reply reference, not just an artifact header. Add a row after approval and after verifying the exact bytes with SHA-256. Material edits require new review, approval, and hash.

| Artifact (path relative to local SDD root) | Status | SHA-256 | Human approval reference and date | Reviewer evidence |
| --- | --- | --- | --- | --- |
| `docs/mission-brief/<feature-id>-<name>.md` | Draft | — | — | — |
| `docs/features/<feature-id>/GrillingDecisions.md` (if used) | Draft | — | — | — |
| `docs/features/<feature-id>/PRD.md` | Draft | — | — | — |
| `docs/features/<feature-id>/TDD.md` | Draft | — | — | — |
| `docs/features/<feature-id>/RequirementsToTests.md` | Draft | — | — | — |

- Separate implementation authorization (human reply reference, date, scope):
- Local backup path, date, and hash-verification result:
- Changed or superseded package / renewed approval:

## Code and verification handoff

- Owned source/test paths and Developer 1 contract requests:
- Applicable automated checks (command, runtime, result):
- Manual RTT observations and outstanding cases:
- Node 22 CI run or pending status:
- Independent spec, code/test, and risk-triggered security review:
- Critical findings, at most two targeted fix rounds, accepted minor follow-ups:
- Guide/log paths and evidence:
- Child branch readiness and outstanding merge blockers:
- Commit/push authorization and PR target (leave blank until given):
- Actual contribution and unresolved assignment-compliance question:

## Final import gate

- Latest reviewed `origin/dev-staging` commit:
- Approved hashes equal imported bytes; status labels and links accurate:
- Completeness, secret scan, and documentation consistency:
- Separate commit/push authorization and Developer 2-opened docs-only PR:
- Developer 1 merge before `master` promotion:
