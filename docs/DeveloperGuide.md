# HelpiNUS Developer Guide

This guide will be expanded alongside the Sprint 1 implementation. The approved
requirements and architecture records live in `workflow/specs/sprint-1`.

## Technology baseline

- Node.js 22
- React, TypeScript, and Vite
- Tailwind CSS
- Firebase Authentication, Firestore, Cloud Functions, Hosting, and Emulator
  Suite
- Zod runtime validation
- Vitest and React Testing Library

## Authorization design

The Firestore document `users/{uid}` is the single authoritative record for a
user's `STUDENT` or `MENTOR` role and `ACTIVE`, `SUSPENDED`, or `DISABLED`
status. It is writable only by trusted Admin SDK code.

The simpler single-source-of-truth design is worth more for HelpiNUS than
avoiding an authorization document lookup. It keeps trusted profile creation,
account suspension, emulator fixtures, and authorization tests aligned while
avoiding drift between custom claims and Firestore.

Protected operations deny access until the authenticated user's profile exists.
Student profile initialization is idempotent and can be retried without allowing
the caller to select a privileged role. See the architecture record for the
approved direct-access matrix.

## Branch flow

Feature branches use `zh/<type>-<short-kebab-case-name>` and target
`dev-staging`. Development deployment and integration testing happen there.
Promotion to `master` requires a reviewed pull request, and production deployment
requires manual approval.
