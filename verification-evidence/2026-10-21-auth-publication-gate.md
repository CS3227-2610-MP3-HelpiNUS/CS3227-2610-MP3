# Dual-role authentication publication gate — 2026-10-21

Branch: `royden/fix-auth-provisioning`. This record preserves the verification history and the human decision to waive further Emulator and Playwright checks before branch publication. It does not assert deployment readiness.

## Recorded verification

- The original two-cycle verification ended at 2/2 failed. Subsequent repairs and verification were separately authorized by the human owner; the original failure was not reset or erased.
- The later recorded unit suites passed 367/367 tests; the Firestore Rules suite passed 25/25; lint, typecheck, and both builds passed.
- The corrected Auth/Firestore/Functions Emulator integration suite passed 98/98 tests across 30 files. Local sanitized evidence: `.verify-app/integration-8180-final-attempt.sanitized.log` (ignored by Git).
- The preceding browser run passed 3/5 journeys. Seeded Mentor login and same-UID Student/Mentor registration and switching did not pass. Local sanitized evidence: `.verify-app/browser-final-attempt.sanitized.log` (ignored by Git).
- A test-only popup readiness wait was added after trace diagnosis. The next launcher attempts stopped before Playwright: first on a port 8080 conflict, then on a Windows esbuild `src/index.ts` resolution error with a temporary 8180 configuration. No browser journey ran in those attempts. The temporary port configuration was restored. Local sanitized evidence: `.verify-app/browser-popup-readiness-final.sanitized.log` and `.verify-app/browser-popup-readiness-8180.sanitized.log` (ignored by Git).
- On 2026-10-21 the human owner explicitly ended further Firebase Emulator and Playwright verification, retaining the 3/5 browser result and the two unverified journeys as limitations.

## Independent security review

The configured Developer 2 `security_reviewer` performed a read-only review of the implementation, Firestore Rules, approved role architecture, and recorded evidence. Verdict: **PASS for controlled development integration**. No material authorization bypass, cross-user disclosure, or privilege escalation was found. This verdict does not convert the waived browser journeys into passes.

Nonblocking finding: a dual-role UID can create and accept a help request addressed to itself, while conversation callable checks and Rules reject same-UID participants. The resulting conversation is unusable; the review found no cross-user access. A later fix should reject `mentorId === actor.uid` before writing the request. The human owner's publication criteria permit documenting nonblocking findings; deployment and live-site validation remain separate decisions.
