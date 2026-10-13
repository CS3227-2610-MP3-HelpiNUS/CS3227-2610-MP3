# Sprint 1 review remediation — 13 October 2026

## Scope

ZhengHao validated and remediated eight review findings before the Sprint 1
integration pull request. The work remained on `zh/feat-auth-role-routing`.

## Confirmed findings and resolutions

1. Mentor discovery list access did not check the authoritative Mentor account.
   Direct collection queries are now denied; `discoverMentors` joins profiles
   to authoritative active Mentor records in trusted backend code, with a
   suspended-owner integration regression.
2. Trusted Mentor provisioning could create a passwordless identity without an
   onboarding path. It now generates the missing password-setup and email
   verification links and reports success only after those actions are ready.
3. A failed Auth display-name update could strand Student registration. Recovery
   now accepts the name again and retries the Auth update before profile setup.
4. Delayed Firestore profile reads could publish a previous identity. Session
   reads are identity-bound, and stale listener results are discarded.
5. Successful account-access recovery did not navigate away. It now redirects
   immediately to the trusted role dashboard.
6. Restored unverified sessions lacked resend and refresh actions. Both controls
   are now available from login, registration recovery, and account access.
7. The message rule rejected multiline content. The rule is newline-aware and
   has positive multiline and negative blank-message tests.
8. Third-party Actions used mutable major tags. Checkout, Node setup, and Google
   authentication are pinned to reviewed full commit SHAs.

## Verification intent

The remediation adds focused frontend, provisioning, and Firestore Rules
regressions. The full lint, type-check, build, unit, Rules, integration, deploy
package, and UI detector gates are run before remote push.
