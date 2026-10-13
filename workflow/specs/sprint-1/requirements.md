# Sprint 1 approved requirements

**Approval date:** 13 October 2026  
**Implementation owner:** ZhengHao  
**Status:** Approved for implementation

## Scope

Sprint 1 establishes the React frontend, Firebase client and backend,
authentication and role routing, shared domain contracts, Firestore access
policy, emulator tests, continuous integration, and reproducible documentation.

The complete role set is `STUDENT` and `MENTOR`. Public registration is
restricted to Students. Mentors are provisioned only by a trusted Admin SDK
utility. Account statuses are `ACTIVE`, `SUSPENDED`, and `DISABLED`.

## Approved environment decisions

- Product name: HelpiNUS.
- Development Firebase project: `helpinus-dev`.
- Production Firebase project: `helpinus-prod`.
- Both projects use the Blaze plan.
- Firebase resources use a Singapore region where the service supports it.
- Production requires verified email; the emulator may bypass verification only
  for documented synthetic test users.
- Emulator-only demo Student and Mentor accounts are required.
- Firebase Hosting serves the application; GitHub Pages serves the product site.
- Laptop and mobile browser layouts have equal priority.
- WCAG 2.1 AA is the accessibility target.

## Approved delivery decisions

- Feature branches use `zh/<type>-<short-kebab-case-name>`.
- Feature branches merge into `dev-staging` for integration testing.
- A successful merge into `dev-staging` deploys to `helpinus-dev`.
- Production promotion is a pull request from `dev-staging` to `master`.
- Deployment from `master` to `helpinus-prod` requires manual approval.
- Commits separate concerns and keep behavioral tests with their implementation.
- At most two implementation agents run concurrently.

## Approval gates

No feature branch may merge until automated checks, an independent Codex review,
and the human code review are complete. Production deployment always remains a
human approval action.
