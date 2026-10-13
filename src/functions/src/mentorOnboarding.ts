import type { Auth, UserRecord } from 'firebase-admin/auth'

type MentorOnboardingAuth = Pick<Auth, 'generateEmailVerificationLink' | 'generatePasswordResetLink'>

export interface MentorOnboardingLinks {
  emailVerificationLink?: string
  passwordSetupLink?: string
}

export async function createMentorOnboardingLinks(
  auth: MentorOnboardingAuth,
  identity: Pick<UserRecord, 'email' | 'emailVerified' | 'providerData'>,
): Promise<MentorOnboardingLinks> {
  if (!identity.email) throw new Error('The Mentor identity must have an email address.')

  const hasPassword = identity.providerData.some(({ providerId }) => providerId === 'password')
  const [passwordSetupLink, emailVerificationLink] = await Promise.all([
    hasPassword ? undefined : auth.generatePasswordResetLink(identity.email),
    identity.emailVerified ? undefined : auth.generateEmailVerificationLink(identity.email),
  ])

  return { passwordSetupLink, emailVerificationLink }
}
