import { describe, expect, it } from 'vitest'
import type { UserRecord } from 'firebase-admin/auth'
import { assertGoogleMentorIdentity } from './googleMentorProvisioning.js'

function identity(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    uid: 'mentor-1',
    email: 'mentor@example.test',
    emailVerified: true,
    disabled: false,
    providerData: [{ providerId: 'google.com', uid: 'google-mentor', email: 'mentor@example.test' }],
    ...overrides,
  } as UserRecord
}

describe('Google Mentor provisioning', () => {
  it('accepts the matching verified Google identity', () => {
    expect(() => assertGoogleMentorIdentity(identity(), 'mentor@example.test')).not.toThrow()
  })

  it('rejects an identity without Google sign-in', () => {
    expect(() => assertGoogleMentorIdentity(identity({ providerData: [] }), 'mentor@example.test')).toThrow(/first sign in/i)
  })

  it('rejects disabled, unverified, or email-mismatched identities', () => {
    expect(() => assertGoogleMentorIdentity(identity({ disabled: true }), 'mentor@example.test')).toThrow(/first sign in/i)
    expect(() => assertGoogleMentorIdentity(identity({ emailVerified: false }), 'mentor@example.test')).toThrow(/first sign in/i)
    expect(() => assertGoogleMentorIdentity(identity(), 'other@example.test')).toThrow(/first sign in/i)
  })
})
