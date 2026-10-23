---
name: verify-app
description: Launch and verify HelpiNUS behavior in the isolated local Firebase emulator stack with focused checks, Playwright interaction, diagnostics, and bounded repair. Use after application behavior changes or when asked to reproduce a UI bug; do not use for production smoke tests or deployment.
metadata:
  short-description: Verify HelpiNUS in a real local browser
---

# Verify App

Use the independent `app-verification/` subsystem. Do not add its evidence or evaluation records to the Developer 2 workflow ledger unless that separate workflow explicitly requires a handoff reference.

## Scope the check

Read `AGENTS.md` and [`app-verification/FEATURE_MAP.md`](../../../app-verification/FEATURE_MAP.md). Inspect the changed application paths, nearby tests, and route definitions while respecting the repository's Developer 2 artifact boundary. State the expected observable behavior before selecting checks.

Choose the smallest useful static and unit checks first. Use workspace commands for a local change and `npm run check` for cross-workspace behavior or a delivery gate. A green build or unit suite is not runtime evidence.

## Exercise the application

Run `npm run verify:app -- --grep "<journey>"` for the affected journey, or `npm run verify:app` for the maintained smoke set. The command owns the local stack lifecycle, waits for HTTP readiness, drives Chromium, records application logs and browser artifacts under `.verify-app/runs/`, and cleans up only the processes it started.

Use `npm run verify:app:install` only when Playwright says its Chromium runtime is absent. Never point this workflow at a deployed URL, production Firebase project, real credentials, or real user data. If a required port belongs to an existing process, leave it untouched and report the collision or choose another frontend port with `--port`.

For a new behavior, add or refine a focused Playwright journey with explicit user-visible assertions. Prefer roles, labels, URLs, and state assertions over sleeps or implementation selectors. Capture diagnostics relevant to the failure; do not interpret a screenshot alone as proof of behavior or accessibility.

## Repair loop

When a check fails, preserve the failing assertion and inspect the Playwright trace, screenshot/video, browser diagnostics, and application log. Identify one evidence-backed cause, make one scoped repair, and rerun the failed layer before broader checks. Stop after three meaningful repair attempts for the same failure. Never weaken an assertion, skip a journey, or switch to a mock merely to produce a pass.

## Report

Report the expected behavior, commands and environment, exact pass/fail counts, evidence directory, repairs made, cleanup result, and untested limitations. Clearly separate browser-observed behavior from source inference, unit coverage, and manual follow-up. Do not commit, push, deploy, or merge without explicit authorization.

When substantially changing this skill or its subsystem, follow [`app-verification/EVALUATION.md`](../../../app-verification/EVALUATION.md) and run `npm run verify:app:grade` plus its passing/failing self-test. The grader is a structural gate, not proof that the workflow made correct verification decisions.
