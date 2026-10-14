# Specialized-agent workflow

## Existing foundation

Sprint 1's foundation used an approved contract baseline, separate frontend and Firebase worktrees, integration checks, independent review, and human review before merge. The requirements, architecture, and shared contracts under `workflow/specs/sprint-1/` remain authoritative. Developer 1 owns the shared architecture, accepted feature PR merges into `dev-staging`, sprint-end promotion to `master`, and production approval. A Developer 2 feature that needs a Developer 1-owned or shared-file change supplies a contract request with the exact file, interface, reason, and required tests; it does not silently take over that ownership. Record a rejected or no-change response in the ledger and leave that file untouched; revise the feature plan if the requested change was required.

## Developer 2's two roots

| Purpose | Location | Git policy |
| --- | --- | --- |
| Full Mission Briefs, Grilling Decisions, PRDs, TDDs, and Requirements-to-Tests | `C:\Users\royde\Desktop\NUS\Sem 5\CS3227\MP3\Dev2-local-SDD\` | Canonical local source until final submission; outside every Git worktree |
| Feature code, tests, guides, logs, reviews, ledger, and small workflow configuration | The assigned feature worktree | Explicitly staged for a feature PR after authorization |

The local tree mirrors eventual repository paths: `docs/mission-brief/<feature-id>-<name>.md` and `docs/features/<feature-id>/{GrillingDecisions,PRD,TDD,RequirementsToTests}.md` as applicable. Do not shorten these artifacts to save review tokens. Do not copy them into feature worktrees, stage them, commit them, or push them before the final docs-only import. A feature's ledger under `workflow/handoffs/royden/` records each approved artifact's SHA-256 and human approval reference; it marks the paths **local-only until final submission**. The ledger and concise PR summary provide Developer 1 enough context to review code without loading the full local package.

After each approved package, make a dated local backup outside Git and verify that its file hashes match the canonical tree. A status header is a handoff signal added only after a human reply approves that exact version. Keep the approval reference and hash in the ledger. A material edit changes the hash and reopens review and approval. Never infer approval from a header alone when the approval provenance is unavailable; record the evidence gap. Local relative links to repository contracts are resolved against the current code worktree during planning and validated in their final repository location during import.

## Planning and authorization gates

Use fresh SDD conversations for Mission Brief, Grill-Me/PRD, TDD, and RTT. Give each the feature ID, code worktree path, local SDD path, feature ledger, previous artifacts, and current governing contracts. Their writable scope is only the assigned local SDD file. The sequence is:

1. Developer 2 approves the Mission Brief scope after reviewing it.
2. A separate spec reviewer checks decisions, contradictions, shared contracts, security assumptions, and PRD-to-RTT coverage. Developer 2 then approves the complete reviewed package.
3. Developer 2 separately authorizes implementation of that exact feature and scope.

Missing, contradictory, or changed approvals block implementation. Resolve open decisions before treating the package as approved. The coordinator reads the complete local artifacts and confirms their hashes match the ledger, then records the authorization and scope in a handoff. The coordinator does not write ordinary application code. One implementation agent normally builds the feature and automated tests within assigned source/test paths. An independent code/test verifier reviews the integrated diff and RTT evidence. Trigger an independent security review for AI, authorization, privacy-sensitive data flow, persistence, shared-contract, or comparable sensitive changes. Read-only TOML role instructions are behavioral boundaries, not filesystem sandbox enforcement. For critical security or release review, use a fresh Plan mode conversation if named selection fails and record the actual general-agent fallback. A reviewer cannot approve its own implementation.

Guide specialists update `docs/UserGuide.md` and `docs/DeveloperGuide.md` from verified behavior; the logger updates `logs/royden/` at meaningful gates using actual interactions and evidence. Keep one chronological feature ledger and log, including command, environment, result, limitations, approval reference, handoff, and unresolved work. Never invent missing conversations or label planned checks passed.

## Getting current code while keeping local SDD

Inspect `git status --short`, current branch, and parent commit in both active checkouts. Run `git fetch origin` to inspect new remote commits; do not `git pull` in a dirty checkout. For a new sprint, review and record the exact `origin/master` commit and create a clean feature branch/worktree from it. Within a sprint, use the latest committed parent feature checkpoint. Assign agents the code worktree and local SDD paths; no SDD copying between feature worktrees is needed. A coordinator may create the approved branch/worktree from the recorded parent SHA without resetting either existing checkout.

From a PowerShell prompt, use this sequence after checking the existing worktrees. Replace placeholders with reviewed exact paths and commits; the new worktree path must be outside the SDD folder.

```powershell
git -C <existing-code-checkout> status --short
git -C <existing-code-checkout> fetch origin
git -C <existing-code-checkout> rev-parse origin/master
git -C <existing-code-checkout> worktree add -b <approved-feature-branch> <new-code-worktree> <reviewed-parent-sha>
```

For a within-sprint child, substitute the reviewed committed parent feature SHA for `origin/master`. The coordinator gives the agent `<new-code-worktree>` and the fixed `Dev2-local-SDD` path. Existing dirty worktrees remain untouched. `git fetch` only updates remote-tracking references; it does not combine files. The new worktree contains the selected code commit, while the local SDD tree remains readable at its separate path.

Fetch during active work for visibility. Update an active feature only at a clean, approved code checkpoint: fast-forward a parent where possible or merge its new commit into the child, then rerun affected checks. Preserve uncommitted changes. Do not reset, overwrite, rebase away work, or silently decide a contract conflict. If remote changes affect an approved requirement or interface, revise the local documents, re-review, reapprove, and update hashes before dependent implementation continues. Apply the `resolving-merge-conflicts` skill to an in-progress merge or rebase conflict.

## Implementation, checks, and stacked handoffs

Implement in small feature slices against existing services and contracts. React components call services rather than Firebase SDKs; backend transitions enforce authorization because Admin SDK bypasses Rules. Use synthetic data and local emulators. Record the commands and actual results for relevant focused tests, root checks, rules/integration emulators, accessibility and responsive manual RTT observations, and Node 22 CI. A child can branch from a committed parent after applicable local automation and independent review, with all outstanding evidence named in the handoff. Approved manual RTT observations and Node 22 CI evidence block merge while absent. A planned or skipped check is not a pass.

For a role-specific AI feature, TDD and RTT must cover prompt injection, authorization before retrieval, data minimization, output handling, SoC LLM limits and failures, and development-agent exposure to untrusted files/tool output. Verify numerical SoC limits before encoding them. Include repeatable adversarial tests and a controlled development smoke test of the real LLM path; a placeholder does not satisfy that requirement. No production credentials or real user data belong in tests or reviews.

Give independent reviewers the approved package, hashes, diff, actual test output, and assigned scope. Permit at most two targeted fix-and-review rounds per finding. Critical gaps block integration. A minor finding needs explicit owner acceptance and a tracked follow-up. Guide and log updates follow verified behavior. Record time, defects, retries, scope adherence, and handoff quality in the evaluation record; label simulations separately from actual named-role runs.

## Feature PR and final SDD import

Before any Git write, inspect `git status --short` and `git diff`. After Developer 2 authorizes a specific commit and push, stage **explicit paths** for code, tests, guides, logs, ledger, review evidence, and workflow files. Never use `git add -A` for a feature PR. Inspect `git diff --cached --name-only` and reject any `docs/mission-brief/` or `docs/features/` path. Developer 2 personally opens or retargets each parent-targeted feature PR. Its concise summary includes delivered behavior, requirement IDs, interface changes, test results, security findings, and limitations. Developer 1 merges accepted stacked PRs parent before child when available. Developer 1 owns sprint-end `dev-staging` to `master` promotion and production approval; Developer 2 verifies deployed features and guide accuracy. Record actual contributions without claiming the unresolved sprint-allocation versus role-ownership compliance question is settled.

After final code and sprint checks, fetch and review latest `origin/dev-staging`, then create a clean docs-only worktree from that commit. Copy the canonical local SDD tree to its mirrored repository paths once. Verify approval hashes, status accuracy, completeness, relative links, and absence of secrets; run documentation consistency checks. With separate Developer 2 authorization, stage and commit only those SDD paths, push, and have Developer 2 open the docs-only PR. Developer 1 merges that PR into `dev-staging` before final `master` promotion. Unfinished or superseded documents may be imported only with truthful status labels.

See `workflow/templates/dev2-feature-ledger.md` for the ledger format and `workflow/evaluations/dev2-workflow-pilot.md` for the workflow rehearsal and first-feature pilot record.
