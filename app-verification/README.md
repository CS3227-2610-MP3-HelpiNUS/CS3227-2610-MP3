# HelpiNUS application verification

This directory is a standalone runtime-verification subsystem. It does not share ledgers, evaluations, or artifacts with `workflow/agents/`.

## Commands

```bash
npm run verify:app:install
npm run verify:app
npm run verify:app -- --grep "seeded Student"
npm run verify:app -- --port 5180 --headed
npm run verify:app:grade
npm run verify:app:grade -- --self-test
```

`verify:app` starts the existing `npm run dev:emulators` stack with the `helpinus-dev` project, strips inherited cloud credential and production-web-config variables, waits for the selected loopback URL, runs the Playwright config in this directory, and cleans up its own process group. It refuses to reuse or stop listeners it did not start. The frontend port is configurable; Firebase emulator ports remain those reviewed in `firebase.json`.

Each run writes an application log, HTML report, screenshots, diagnostics, and failure traces under `.verify-app/runs/<timestamp>/`. This directory and its isolated emulator export are ignored by Git.

See [FEATURE_MAP.md](FEATURE_MAP.md) for journeys and synthetic accounts. See [EVALUATION.md](EVALUATION.md) for the skill evaluation contract.
