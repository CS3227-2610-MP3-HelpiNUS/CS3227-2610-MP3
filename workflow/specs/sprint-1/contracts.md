# Shared contract catalogue

Runtime schemas and inferred TypeScript types are defined once in
`src/shared/src`. Frontend adapters and Cloud Functions must consume that package
rather than recreate domain types.

## Collections

- `users`
- `mentorProfiles`
- `modules`
- `helpRequests`
- `conversations`, with `messages` subcollections
- `availabilitySlots`
- `appointments`
- `aiAuditEvents`

## Callable functions

- `initializeStudentProfile(input)`
- `discoverMentors(input)`
- `createHelpRequest(input)`
- `respondToHelpRequest(input)`
- `closeHelpRequest(input)`
- `createAvailabilitySlot(input)`
- `withdrawAvailabilitySlot(input)`
- `reserveAppointment(input)`
- `respondToAppointment(input)`
- `cancelAppointment(input)`
- `completeAppointment(input)`
- `studentStudyAssist(input)`
- `mentorConsultationSummary(input)`

All state-changing domain inputs except profile initialization carry a UUID
`requestId` for idempotency. Inputs are validated at runtime before authorization
or persistence. Errors use the shared application error codes.

## State transitions

Help request:

```text
PENDING -> ACCEPTED -> CLOSED
        -> REJECTED
```

Appointment:

```text
PENDING -> CONFIRMED -> COMPLETED
        -> REJECTED
PENDING or CONFIRMED -> CANCELLED
```

Every transition is owned by a callable function and must verify the actor,
current state, target state, and involved resource ownership atomically.
