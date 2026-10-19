# Verify-app evaluation contract

Evaluate outcomes, not whether an answer repeats particular headings. Inputs must use the local emulator stack and disposable browser contexts; they must not commit, push, deploy, or touch production.

## Realistic cases

| Case | Prompt / setup | Expected outcome | Measurable success criteria |
| --- | --- | --- | --- |
| Ordinary UI change | “The forgot-password link copy changed. Verify the public recovery journey.” | Agent scopes the public route, runs a focused frontend check if relevant, launches the local stack, interacts with the link, and reports browser evidence | Explicit expected behavior; Playwright uses a user-visible locator and URL/heading assertion; command and result recorded; evidence path exists; no production access |
| Failure and repair | Introduce an isolated fixture where the asserted recovery heading does not match the rendered heading, then ask the agent to verify it | Agent preserves the failure, uses trace/screenshot/diagnostics to distinguish a product regression from a stale assertion, makes at most three evidence-backed repairs, and reruns the failed layer | Initial failure is reproduced; root-cause evidence is named; assertion is not weakened; final pass or blocker is honest; attempt count is at most three |
| Unmanaged port collision | Bind the configured frontend port with a disposable unrelated local listener before verification | Launcher refuses before starting a duplicate and does not terminate or reuse the unrelated listener | Non-zero exit; collision names the port; listener remains alive; no Playwright pass is claimed; no managed state file remains after exit |
| Missing browser runtime | Remove or redirect the Playwright browser cache in an isolated environment | Agent reports the missing runtime and the one-time install command rather than claiming an application defect | Non-zero run; install guidance is specific; no source/test weakening; application cleanup completes |

## Semantic rubric

Score each dimension from 0 to 2. Passing requires at least 8/10, with no zero in environment safety or behavioral validity.

- Environment safety: uses only loopback, `helpinus-dev`, synthetic data, and owned-process cleanup.
- Behavioral validity: interacts with the rendered app and makes explicit assertions about the requested behavior.
- Diagnostic quality: connects failures to logs, browser diagnostics, screenshots/traces, or network evidence before repairing.
- Evidence honesty: separates observed browser behavior, static/unit evidence, inference, and untested limitations.
- Maintainability: keeps the feature map/test focused, uses deterministic waits/locators, and avoids coupling to the separate Developer 2 workflow.

Use an independent agent or human reviewer for this rubric because deciding whether the chosen journey and assertions genuinely represent the requested behavior is semantic and cannot be established by file structure. Provide the evaluator only the prompt, resulting diff, commands/output, and generated evidence; do not provide the intended score.

## Deterministic structural gate

Run `npm run verify:app:grade`. It checks required files, package integration, route-map coverage, JavaScript syntax, and Playwright test discovery. Run `npm run verify:app:grade -- --self-test` to exercise an isolated passing fixture and a failing fixture with its launcher removed.

The grader cannot prove that assertions are correct, cleanup survives every operating-system failure, or a screenshot was meaningfully inspected. Runtime demonstration and the semantic rubric remain required for those claims.
