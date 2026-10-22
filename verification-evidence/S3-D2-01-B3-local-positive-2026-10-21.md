# S3-D2-01 B3 local-preview positive path — 2026-10-21

## Scope and state

- Project: `helpinus-dev`; Function: `mentorConsultationSummary`, Cloud Run revision `mentorconsultationsummary-00009-xet`.
- The test used the user-confirmed synthetic accepted Student–Mentor conversation through the local branch preview at `localhost`. The hosted frontend did not contain the Summarise button at test time.
- One manual click was made by the signed-in designated Mentor. No automatic retry or additional inference was made.
- The deployed Function used the approved single Mentor UID allowlist, model `qwen3.5:9b`, output budget 2,048 tokens, 25-second provider deadline, 40-second Function timeout, bound secret, and public Cloud Run invoker. Runtime max instances/concurrency were 5/1.

## Sanitized outcome

- At 2026-10-21 16:29 Singapore time, Cloud Run logged HTTP `200` with 4.537-second request latency; the callable logged outcome `success` and total `4,454 ms`.
- Stages (ms): handler pre-provider `951`, capacity admission `92`, provider headers `3,024`, provider body `2`, capacity settlement `67`, handler post-provider `316`.
- Provider finish reason: `stop`; completion length: 504 characters / 504 UTF-8 bytes. The Mentor parser reported bare JSON parse success, zero unknown fields, and string types for `summary`, `unresolvedQuestions`, `teachingApproaches`, and `limitations`.
- The user observed all four sections and successfully edited a field without saving. No raw provider text, conversation body, account email, or secret was recorded here.
- Durable capacity changed from `5/10` to `6/10`; the lease was idle afterward.
- The help-request and conversation update timestamps remained `2026-10-21T08:02:32.836355Z`; message count remained one. Neither document acquired a brief, summary, or draft field. The intended capacity update was the only observed persistent change.

## Acceptance boundary

The deployed callable's real-provider positive path, four-field validation, local UI rendering/editing, and capacity cleanup passed. Full B3 acceptance remains open until the feature is present on the hosted UI and the separate direct signed-in Mentor B authorization check is completed. This success does not identify the exact malformed shape of the two earlier `AI_RESPONSE` completions; those responses were intentionally not logged.
