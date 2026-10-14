# Specialized-agent workflow

## Existing foundation

Sprint 1's foundation used an approved contract baseline, separate frontend and Firebase worktrees, integration checks, independent review, and human review before merge. The requirements, architecture, and shared contracts under `workflow/specs/sprint-1/` remain authoritative. Developer 1 owns the shared architecture, accepted feature PR merges into `dev-staging`, sprint-end promotion to `master`, and production approval. A Developer 2 feature that needs a Developer 1-owned or shared-file change supplies a contract request with the exact file, interface, reason, and required tests; it does not silently take over that ownership. Record a rejected or no-change response in the ledger and leave that file untouched; revise the feature plan if the requested change was required.

## Developer 2 SDD drafting and publication

| Purpose | Location | Git policy |
| --- | --- | --- |
| Draft Mission Briefs, Grilling Decisions, PRDs, TDDs, and Requirements-to-Tests; dated backups | `C:\Users\royde\Desktop\NUS\Sem 5\CS3227\MP3\Dev2-local-SDD\` and `Dev2-local-SDD-backups\` | Developer 2-only drafting and recovery, outside Git worktrees |
| Approved SDD snapshots, feature code, tests, guides, logs, reviews, ledger, and workflow configuration | The assigned feature worktree | Versioned on the feature branch and included in its PR |

The draft tree mirrors repository paths: `docs/mission-brief/<feature-id>-<name>.md` and `docs/features/<feature-id>/{GrillingDecisions,PRD,TDD,RequirementsToTests}.md` as applicable. Keep the artifacts complete; do not shorten them to save review tokens. After package approval and secret/link checks, copy the exact approved bytes into the feature worktree, verify matching SHA-256, and make a separate SDD commit before dependent implementation. The repository copy is the approved implementation source of truth; the local copy and dated backup are recovery snapshots. A feature ledger under `workflow/handoffs/royden/` records each approved artifact's SHA-256 and human approval reference. Developer 1 agents follow the access guardrail in `AGENTS.md`; the concise PR summary lets them review code without loading SDD contents.

After each approved package, make a dated local backup outside Git and verify that its file hashes match the approved repository copy. A status header is a handoff signal added only after a human reply approves that exact version. Keep the approval reference and hash in the ledger. A material edit changes the hash and reopens review and approval; commit the new approved snapshot separately after reconciling the local backup. Never infer approval from a header alone when the approval provenance is unavailable; record the evidence gap. Resolve draft relative links against the current code worktree and validate them at their repository location before the SDD commit.

## Planning and authorization gates

Use fresh SDD conversations for Mission Brief, Grill-Me/PRD, TDD, and RTT. Give each the feature ID, code worktree path, local draft path, feature ledger, previous artifacts, and current governing contracts. Their writable scope is only the assigned local draft file. The sequence is:

1. Developer 2 approves the Mission Brief scope after reviewing it.
2. A separate spec reviewer checks decisions, contradictions, shared contracts, security assumptions, and PRD-to-RTT coverage. Developer 2 then approves the complete reviewed package.
3. Developer 2 separately authorizes implementation of that exact feature and scope.

Missing, contradictory, or changed approvals block implementation. Resolve open decisions before treating the package as approved. The coordinator reads the complete draft package, confirms hashes against the ledger, imports approved bytes into the feature branch, and records the spec commit and separate implementation authorization in the handoff. The coordinator does not write ordinary application code. One implementation agent normally builds the feature and automated tests within assigned source/test paths. An independent code/test verifier reviews the integrated diff and RTT evidence. Trigger an independent security review for AI, authorization, privacy-sensitive data flow, persistence, shared-contract, or comparable sensitive changes. Read-only TOML role instructions are behavioral boundaries, not filesystem sandbox enforcement. For critical security or release review, use a fresh Plan mode conversation if named selection fails and record the actual general-agent fallback. A reviewer cannot approve its own implementation.

Guide specialists update `docs/UserGuide.md` and `docs/DeveloperGuide.md` from verified behavior; the logger updates `logs/royden/` at meaningful gates using actual interactions and evidence. Keep one chronological feature ledger and log, including command, environment, result, limitations, approval reference, handoff, and unresolved work. Never invent missing conversations or label planned checks passed.

## Getting current code and approved SDD

Inspect `git status --short`, current branch, and parent commit in both active checkouts. Run `git fetch origin` to inspect new remote commits; do not `git pull` in a dirty checkout. For a new sprint, review and record the exact `origin/master` commit and create a clean feature branch/worktree from it. Within a sprint, use the latest committed parent feature checkpoint. Approved SDD committed on a parent branch comes with that commit; no artifact copying between feature worktrees is needed. Give Developer 2 agents the code worktree and local draft/backup paths, and give Developer 1 agents only the permitted code/handoff scope. A coordinator may create the approved branch/worktree from the recorded parent SHA without resetting either existing checkout.

From a PowerShell prompt, use this sequence after checking the existing worktrees. Replace placeholders with reviewed exact paths and commits; the new worktree path must be outside the SDD folder.

```powershell
git -C <existing-code-checkout> status --short
git -C <existing-code-checkout> fetch origin
git -C <existing-code-checkout> rev-parse origin/master
git -C <existing-code-checkout> worktree add -b <approved-feature-branch> <new-code-worktree> <reviewed-parent-sha>
```

For a within-sprint child, substitute the reviewed committed parent feature SHA for `origin/master`. Existing dirty worktrees remain untouched. `git fetch` only updates remote-tracking references; it does not combine files. The new worktree contains the selected code and any approved SDD snapshots already committed by the parent; the local draft/backup tree remains separate.

Fetch during active work for visibility. Update an active feature only at a clean, approved code checkpoint: fast-forward a parent where possible or merge its new commit into the child, then rerun affected checks. Preserve uncommitted changes. Do not reset, overwrite, rebase away work, or silently decide a contract conflict. If remote changes affect an approved requirement or interface, revise the local documents, re-review, reapprove, and update hashes before dependent implementation continues. Apply the `resolving-merge-conflicts` skill to an in-progress merge or rebase conflict.

## Implementation, checks, and stacked handoffs

Implement in small feature slices against existing services and contracts. React components call services rather than Firebase SDKs; backend transitions enforce authorization because Admin SDK bypasses Rules. Use synthetic data and local emulators. The feature's implementation authorization permits its assigned implementation agent to make **incremental local commits during implementation**: after each coherent, focused-test-verified slice, inspect status and diff, stage only that agent's assigned code/test paths, inspect the staged path list and diff, run `git diff --cached --check`, then commit with a feature-specific message. Record the commit SHA, scope, and checks in the ledger/log. Do not collect all slices into a single end-of-feature commit, include another agent's edits, commit broken partial work, amend/reset existing commits, or push without the separate push authorization. If agents work in parallel, use disjoint worktrees/branches and integrate their commits at a clean checkpoint.

Record the commands and actual results for relevant focused tests, root checks, rules/integration emulators, accessibility and responsive manual RTT observations, and Node 22 CI. A child can branch from a committed parent after applicable local automation and independent review, with all outstanding evidence named in the handoff. Approved manual RTT observations and Node 22 CI evidence block merge while absent. A planned or skipped check is not a pass.

For a role-specific AI feature, TDD and RTT must cover prompt injection, authorization before retrieval, data minimization, output handling, SoC LLM limits and failures, and development-agent exposure to untrusted files/tool output. Verify numerical SoC limits before encoding them. Include repeatable adversarial tests and a controlled development smoke test of the real LLM path; a placeholder does not satisfy that requirement. No production credentials or real user data belong in tests or reviews.

Give independent reviewers the approved package, hashes, diff, actual test output, and assigned scope. Permit at most two targeted fix-and-review rounds per finding. Critical gaps block integration. A minor finding needs explicit owner acceptance and a tracked follow-up. Guide and log updates follow verified behavior. Record time, defects, retries, scope adherence, and handoff quality in the evaluation record; label simulations separately from actual named-role runs.

## Feature PR and SDD publication

Before any Git write, inspect `git status --short` and `git diff`. Stage **explicit paths**; never use `git add -A`. For an SDD commit, stage only the approved `docs/mission-brief/` and `docs/features/<feature-id>/` paths plus the matching ledger if needed, then inspect `git diff --cached --name-only`, the staged diff, hashes, links, status, and secret scan. For each implementation slice, the assigned agent commits only its own verified code/test paths. A push still needs Developer 2's bounded authorization. Developer 2 personally opens or retargets each parent-targeted feature PR. Its concise summary includes delivered behavior, requirement IDs, interface changes, test results, security findings, and limitations. Developer 1 agents do not ingest the SDD diff unless Developer 1 explicitly directs them to do so. Developer 1 merges accepted stacked PRs parent before child when available. Developer 1 owns sprint-end `dev-staging` to `master` promotion and production approval; Developer 2 verifies deployed features and guide accuracy. Record actual contributions without claiming the unresolved sprint-allocation versus role-ownership compliance question is settled.

Approved SDD is published with its feature branch and PR, not held for a final docs-only PR. If a document is unfinished or superseded, its repository status must say so truthfully. Keep dated local backups and approval hashes so the exact package can be recovered or audited. Before a material revision, repeat review and approval, then commit the revised snapshot with its updated ledger hash.

See `workflow/templates/dev2-feature-ledger.md` for the ledger format and `workflow/evaluations/dev2-workflow-pilot.md` for the workflow rehearsal and first-feature pilot record.
