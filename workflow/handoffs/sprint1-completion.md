# Sprint 1 completion handoff

**Owner:** ZhengHao  
**Branch:** `zh/feat-auth-role-routing`  
**Baseline:** `161cd6f`  
**Status:** Locally implemented; human review and development deployment pending

## Integrated scope

- Firebase Web SDK versions aligned across workspaces.
- Self-contained Cloud Functions deploy source with its own lockfile and
  deterministic verification.
- Development and production Web App values injected by environment-specific
  GitHub Actions jobs.
- Firestore timestamps normalized at the frontend contract boundary.
- Stale emulator identities recover to signed-out state.
- Trusted profile, email verification, role, and direct-access checks hardened.
- Auth pages, role-aware branding, mobile sign-out, focus, labels, and recovery
  actions improved.
- Typed mock callable adapter and fixtures added.
- Developer Guide, User Guide, reflection, architecture diagram, and interaction
  evidence completed for Sprint 1.

## Source commits

- `23eabc1` — align Firebase Web SDK version.
- `14b8f69` — package Functions inside deploy source.
- `d664ef3` — configure Firebase Web deploy environments.
- `05b74b7` — harden sessions, trusted profiles, Rules, and tests.
- `aaffbfb` — accessible responsive authentication UI.
- `f0563b3` — record Impeccable monorepo target lesson.
- `ea01a0a` — add typed callable adapters and safe auth error handling.

Documentation is committed separately after the combined integration gate.

## Human actions before development deployment

1. Review and push the feature branch, then open a pull request into
   `dev-staging`.
2. Configure the five `VITE_FIREBASE_DEV_*` repository variables.
3. Configure `FIREBASE_SERVICE_ACCOUNT_HELPINUS_DEV` as a repository secret.
4. Confirm Email/Password Authentication, the `asia-southeast1` Firestore
   database, and the default Hosting site exist for `helpinus-dev`.
5. Merge only after the human code review; observe the automatic development
   deployment and run the User Guide smoke test.
6. Configure the corresponding production variables, protected secret, and
   required reviewer before later promotion to `master`.

No remote push, pull request, Firebase deployment, or production mutation was
performed by Codex in this implementation round.
