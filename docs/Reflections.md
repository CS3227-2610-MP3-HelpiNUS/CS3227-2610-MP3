# HelpiNUS Reflections

This is the living reflection record. Sprint 1 examples concern architecture,
authentication, contracts, and the development process. Later sprints must add
evidence from the implemented SoC LLM features and production deployment.

## AI security

### What attack surfaces have we identified?

The future AI features accept Student study questions and Mentor consultation
notes. Both can contain direct prompt injection, instructions hidden in quoted
course material, adversarial Unicode, requests to reveal system prompts, or
attempts to retrieve another user's information. Model output is also untrusted:
it may hallucinate academic facts, reproduce sensitive notes, generate unsafe
instructions, or contain content that becomes an injection when rendered or
passed into another tool.

Sprint 1 therefore exposes AI features only as backend callable contracts. The
browser has no model credential, AI audit records are backend-only, input
lengths are bounded, and role checks occur before the deliberately unavailable
handler. This does not make the future AI feature secure, but it prevents an
unfinished client-to-model path from silently becoming public.

### What controls and tests are needed next?

- Treat user content and retrieved documents as data, never privileged
  instructions.
- Use a fixed server-side system prompt and an explicit allowed task for each
  role.
- Minimize data sent to the model and prohibit cross-user retrieval.
- Apply role, ownership, ACTIVE-status, verified-email, size, and rate checks
  before every model call.
- Escape output as text and validate any structured response before use.
- Record outcome and prompt hash without storing raw sensitive prompts in the
  AI audit event.
- Enforce SoC LLM rate and concurrency limits with bounded retries, timeouts,
  and a safe provider-unavailable response.
- Test direct, indirect, multilingual, encoded, and multi-turn prompt injection;
  authorization bypass; data exfiltration; quota exhaustion; and unsafe output.

The model must not receive Firebase Admin credentials, deploy credentials, or
an unrestricted tool. A human approval gate is appropriate before sending
high-impact or externally visible AI output. The approval UI must display the
actual content and destination and must not let model-generated text redefine
what approval means.

### Sprint 1 security lesson

Security boundaries need tests at the boundary, not only inside helper
functions. For example, the shared `User` type used an ISO timestamp while
Firestore returned a native `Timestamp`. Unit tests remained green until the
real adapter boundary was inspected. We added normalization and regression
tests so a valid account no longer fails as malformed. Similarly, a test of a
single Mentor document was insufficient evidence for a collection query; the
Rules suite now exercises discovery behaviour.

## Specification-driven development

### What must a good specification make clear?

Before implementation, the HelpiNUS Sprint 1 specification fixed the complete
role and status sets, authoritative profile location, registration recovery
strategy, direct-access matrix, callable names, state transitions, project IDs,
branch promotion path, emulator exception, and deployment approval gate. These
decisions prevented frontend and backend work from inventing conflicting role
stores or API names.

A specification is precise enough for an agent when two independent
implementers can produce compatible code and tests without choosing a different
security policy. Prose such as “secure the profile” is insufficient; specifying
`users/{uid}`, Admin-only writes, token/profile email equality, ACTIVE status,
and verified email gives observable acceptance criteria.

### How should changes flow?

1. Update and reapprove the requirement or ADR.
2. Update the shared schema or callable contract.
3. Update implementation and both positive and negative tests.
4. Update the User and Developer Guides so they describe the shipped product.
5. Record the change, evidence, and unresolved risk in the handoff and log.

Tests should demonstrate intent, not merely repeat wording. The rule that public
registration cannot create a Mentor is represented structurally by omitting
role/status from the input schema, assigning constants in trusted code, denying
client profile writes, and testing retry against an existing privileged
profile. Several independent controls express the security intent.

### Sprint 1 specification lesson

The original code could build while Cloud Functions deployment still failed
because a workspace dependency escaped the uploaded Functions directory. The
specification's reproducibility requirement needed a deployment-level
acceptance test, not just a TypeScript build. The self-contained deploy package,
isolated installation, and deterministic verifier now make that requirement
measurable.

## Basic multi-agent software engineering

### Where did specialization help?

Sprint 1 separated frontend/auth-security and Firebase packaging/CI work into
two worktrees created from one approved baseline. The first specialist focused
on browser sessions, accessible UI, authorization Rules, and emulator cases.
The second focused on dependency resolution, deploy boundaries, lockfiles, and
environment-specific CI. Integration and documentation remained centralized so
the final guide and acceptance evidence described one coherent system.

### What information must pass between agents?

Each handoff records the baseline, branch, exact scope, files changed, commit
SHAs, commands and results, unresolved risks, and human setup. Contract names,
environment IDs, security decisions, and what remains a scaffold are especially
important; losing any of them can create code that compiles but violates the
approved product boundary.

### Where can errors or malicious instructions enter?

An analyst can misstate a requirement, an implementer can trust repository text
as an instruction, a reviewer can inspect only tests that mirror the bug, and
an integration agent can hide a conflict in a large commit. External logs,
issues, dependency metadata, model output, and generated documentation are all
untrusted evidence. They do not override the approved human specification or
authorization scope.

We reduce this risk through human-approved ADRs, no more than two concurrent
jobs, isolated worktrees, focused commits, shared runtime schemas, negative
security tests, deterministic structural checks, a separate human code review,
and manual production approval. Structural graders and green builds remain
evidence of checked invariants, not proof of semantic correctness.

### Sprint 1 process lesson

Agent interruption did not lose work because each specialist used a managed
worktree and resumed from the visible diff. However, uncommitted work remained
harder to audit during the interruption. Future agents should reach a small
validated commit as soon as one concern is coherent, rather than waiting to
commit an entire multi-layer workstream.
