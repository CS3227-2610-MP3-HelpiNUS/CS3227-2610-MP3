import { describe, expect, it } from 'vitest'
import { mockServices } from '../services/mockServices'

describe('mock preview sign-in', () => {
  it('does not turn a Mentor credential into Jamie Tan', async () => {
    await mockServices.session.signOut()
    try {
      await expect(mockServices.session.signIn({ email: 'aisha@example.test', password: 'Aisha-demo-123!' }))
        .rejects.toThrow(/emulator/i)
      expect((await mockServices.session.getCurrent())?.user).toBeNull()
    } finally {
      await mockServices.session.registerStudent({ displayName: 'Jamie Tan', email: 'jamie.tan@example.edu', password: 'unused-preview-password' })
    }
  })
})
