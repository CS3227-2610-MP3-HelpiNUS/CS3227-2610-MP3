import { describe, expect, it } from 'vitest'
import { mockServices } from '../services/mockServices'

describe('mock preview Google sign-in', () => {
  it('does not silently authenticate a preview user', async () => {
    await mockServices.session.signOut()
    await expect(mockServices.session.signInWithGoogle()).rejects.toThrow(/emulator/i)
    expect((await mockServices.session.getCurrent())?.user).toBeNull()
  })
})
