import { describe, expect, it } from 'vitest'
import { isStaleAuthIdentityError, normalizeFirestoreTimestamp } from '../services/firestoreData'

describe('Firestore data normalization', () => {
  it('converts Firestore Timestamp values into the shared ISO string boundary', () => {
    const value = new Date('2026-10-13T02:00:00.000Z')
    expect(normalizeFirestoreTimestamp({ toDate: () => value })).toBe('2026-10-13T02:00:00.000Z')
  })

  it('normalizes Date values and leaves unsupported values for schema validation', () => {
    expect(normalizeFirestoreTimestamp(new Date('2026-10-13T02:00:00.000Z'))).toBe('2026-10-13T02:00:00.000Z')
    expect(normalizeFirestoreTimestamp('not-a-timestamp')).toBe('not-a-timestamp')
  })

  it('recognizes invalid Firebase identities that should be signed out', () => {
    expect(isStaleAuthIdentityError({ code: 'auth/user-not-found' })).toBe(true)
    expect(isStaleAuthIdentityError({ code: 'auth/invalid-user-token' })).toBe(true)
    expect(isStaleAuthIdentityError({ code: 'auth/network-request-failed' })).toBe(false)
  })
})
