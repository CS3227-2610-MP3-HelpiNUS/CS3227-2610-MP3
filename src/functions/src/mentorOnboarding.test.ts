import { describe, expect, it, vi } from 'vitest'
import type { Auth, UserRecord } from 'firebase-admin/auth'
import { createMentorOnboardingLinks } from './mentorOnboarding.js'

function authWithLinks() {
  return {
    generatePasswordResetLink: vi.fn().mockResolvedValue('https://example.test/set-password'),
    generateEmailVerificationLink: vi.fn().mockResolvedValue('https://example.test/verify-email'),
  } as unknown as Pick<Auth, 'generateEmailVerificationLink' | 'generatePasswordResetLink'>
}

describe('Mentor onboarding links', () => {
  it('creates password-setup and verification links for a new passwordless identity', async () => {
    const auth = authWithLinks()
    const links = await createMentorOnboardingLinks(auth, {
      email: 'mentor@example.com',
      emailVerified: false,
      providerData: [],
    } as Pick<UserRecord, 'email' | 'emailVerified' | 'providerData'>)

    expect(links).toEqual({
      passwordSetupLink: 'https://example.test/set-password',
      emailVerificationLink: 'https://example.test/verify-email',
    })
    expect(auth.generatePasswordResetLink).toHaveBeenCalledWith('mentor@example.com')
    expect(auth.generateEmailVerificationLink).toHaveBeenCalledWith('mentor@example.com')
  })

  it('does not generate onboarding links for a verified password identity', async () => {
    const auth = authWithLinks()
    const links = await createMentorOnboardingLinks(auth, {
      email: 'mentor@example.com',
      emailVerified: true,
      providerData: [{ providerId: 'password' }],
    } as Pick<UserRecord, 'email' | 'emailVerified' | 'providerData'>)

    expect(links).toEqual({ passwordSetupLink: undefined, emailVerificationLink: undefined })
    expect(auth.generatePasswordResetLink).not.toHaveBeenCalled()
    expect(auth.generateEmailVerificationLink).not.toHaveBeenCalled()
  })
})
