# HelpiNUS frontend foundation

**Owner:** ZhengHao  
**Base:** `d674f3d4f7f322df58cdeca9d96028e4e614b278`  
**Branch:** `zh/feat-frontend-foundation`  
**Implementation commit:** `6091530` (`feat(frontend): add HelpiNUS app foundation`)

## Scope delivered

- Replaced the Vite starter with a responsive React and TypeScript application
  shell, named navigation, public auth scaffolds, guarded Student routes, a
  Mentor dashboard route, and not-found/error/retry states.
- Added a meaningful mock Student dashboard and service contracts using
  `@helpinus/shared`; no domain types are redefined.
- Added Tailwind CSS, React Router, Firebase Web SDK initialization, separate
  development/production public config, and emulator connections gated by
  development mode, explicit opt-in, and loopback host.
- Added Firebase and mock service adapters. Dashboard data remains visibly
  marked as sample data; auth sign-in, domain workflows, and AI calls are not
  implemented.
- Added Vitest, React Testing Library, lint/typecheck/build scripts, and route,
  role-guard, navigation accessibility, dashboard, error-state, and emulator
  guard checks.

## Verification

- `npm run lint -w src/frontend` — passed.
- `npm run typecheck -w src/frontend` — passed.
- `npm run test -w src/frontend` — passed; 2 files, 17 tests.
- `npm run build -w src/frontend` — passed. Output includes a 335.36 kB initial
  JS bundle (104.90 kB gzip) and a separately loaded 624.04 kB Firebase adapter
  chunk (186.29 kB gzip); Vite reports the Firebase chunk size warning.
- `git diff --check` — passed before commit.
- Impeccable detector: one overused-Inter warning; changed the UI to the native
  system font stack. The detector was run once as instructed.
- Desktop browser visual inspection at 1280×720 showed the dashboard and its
  key content. A separate mobile screenshot was unavailable; responsive rules
  and mobile navigation are implemented, but were not visually inspected at a
  mobile viewport.

## Risks and remaining integration seams

- The host used Node `v26.8.1`; repository guidance requires Node 22. Checks
  passed on the host version, but should be repeated under Node 22.
- Firebase was not configured against a live project or emulator. Auth
  initialization/profile lookup is present, while sign-in and public account
  creation remain adapter/UI seams.
- Dashboard service data and route content are still sample/scaffold behavior,
  including when a Firebase client is configured. Replace these with the
  approved Firestore queries and callable adapters during backend integration.
- The study assistant does not send prompts or call an AI model. WCAG 2.1 AA is
  the target; tests cover accessible names and structure but are not a full
  conformance audit.
- No backend, rules, shared contracts, deployment workflows, PR, push, or merge
  were changed or performed.
