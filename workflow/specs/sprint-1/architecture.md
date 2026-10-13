# Sprint 1 architecture decisions

## ADR-001: authoritative user role and status

**Decision:** `users/{uid}` is the single authoritative role and account-status
record. Only trusted Admin SDK code may create the record or change its `role`,
`status`, ownership, or other privileged fields.

**Rationale:** HelpiNUS has two roles and needs role, status, and profile data to
remain consistent. A simpler single source of truth is worth more in this stage
than avoiding an authorization document lookup. It also makes registration,
emulator fixtures, suspension behavior, and tests easier to reason about.

**Consequences:**

- Protected functions read `users/{uid}` and fail closed if it is absent.
- Firestore Rules use the same record for authorization where direct access is
  permitted.
- Backend code using the Admin SDK must enforce authorization explicitly because
  the Admin SDK bypasses Firestore Rules.
- Firebase custom claims are not an authoritative role store in Sprint 1.

## ADR-002: recoverable registration

Firebase Authentication creates the identity before the authenticated
`initializeStudentProfile` callable creates the trusted profile. The callable is
idempotent and always assigns `STUDENT`, `ACTIVE`, and the authenticated user's
email. Client-supplied roles and statuses are ignored because they are not part
of the contract.

Until the profile exists, protected routes and operations are denied and the
user sees a retry path. Retrying cannot increase privilege. Mentor provisioning
uses a separate trusted administrative utility.

## ADR-003: Firestore direct-access matrix

| Resource | Direct client reads | Direct client writes |
| --- | --- | --- |
| Own user profile | Own record only | None |
| Mentor profiles | Direct get for an active profile; collection discovery uses `discoverMentors` | None |
| Help requests | Student-owned or assigned Mentor records | None; callable transitions only |
| Conversations | Participants only | None |
| Messages | Participants only | Participant may create with self as sender; immutable afterwards |
| Availability slots | Authenticated reads of available slots | None; callable operations only |
| Appointments | Involved Student or Mentor only | None; callable transitions only |
| AI audit events | None | None; backend only |

Clients never directly modify role, account status, ownership, or workflow
status fields. Firestore cannot safely enforce the cross-document owner check
for this collection query, so `discoverMentors` joins active profiles to the
authoritative user records in trusted backend code.

## ADR-004: application boundaries

- React components depend on frontend service adapters, not Firebase SDK calls.
- Runtime validation and TypeScript contracts live in `src/shared`.
- Privileged state transitions are Firebase callable functions.
- Safe, high-volume participant chat-message creation is the only approved
  direct domain write in Sprint 1.
- AI callables are contract-only seams until SoC LLM constraints are reviewed in
  the AI implementation sprint.
