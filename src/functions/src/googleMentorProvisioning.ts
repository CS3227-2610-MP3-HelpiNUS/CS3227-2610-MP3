import type { UserRecord } from 'firebase-admin/auth'

export function assertGoogleMentorIdentity(identity: UserRecord, expectedEmail: string): void {
  const google = identity.providerData.find((provider) => provider.providerId === 'google.com')
  if (identity.disabled || !identity.emailVerified || identity.email !== expectedEmail || google?.email !== expectedEmail) {
    throw new Error('The Mentor must first sign in with the same verified Google account in this Firebase project.')
  }
}
