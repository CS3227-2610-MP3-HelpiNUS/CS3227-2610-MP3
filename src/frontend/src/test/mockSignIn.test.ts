import { describe, expect, it } from 'vitest'
import { mockServices } from '../services/mockServices'

describe('mock preview Google sign-in', () => {
  it('does not silently authenticate or register a preview user', async () => {
    await mockServices.session.signOut()
    await expect(mockServices.session.signInWithGoogle('STUDENT')).rejects.toThrow(/emulator/i)
    await expect(mockServices.session.registerStudentWithGoogle()).rejects.toThrow(/emulator/i)
    expect((await mockServices.session.getCurrent())?.user).toBeNull()
  })
})
