import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CallableRequest } from 'firebase-functions/v2/https'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({ collection: (name: string) => ({ doc: () => ({ get: name === 'mentors' ? async () => ({ exists: false }) : mocks.get }) }) }) }))

import { requireActiveUser } from './auth.js'

const uid = 'student-synthetic-test'
const profile = (email: string) => ({ id: uid, email, displayName: 'Synthetic Student', role: 'STUDENT', status: 'ACTIVE', createdAt: new Date('2026-10-16T00:00:00.000Z') })
const call = (email: string) => ({ auth: { uid, token: { email, email_verified: false } } }) as unknown as CallableRequest<unknown>

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('shared current-user production-mode verification gate (TC-005)', () => {
  it('permits an unverified synthetic account only when the Functions emulator flag is true', async () => {
    const email = 'synthetic@example.test'
    mocks.get.mockResolvedValue({ exists: true, data: () => profile(email) })
    for (const flag of [undefined, 'false', 'TRUE']) {
      if (flag === undefined) delete process.env.FUNCTIONS_EMULATOR
      else vi.stubEnv('FUNCTIONS_EMULATOR', flag)
      await expect(requireActiveUser(call(email))).rejects.toMatchObject({ code: 'failed-precondition' })
    }
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true')
    await expect(requireActiveUser(call(email))).resolves.toMatchObject({ uid, email, role: 'STUDENT' })
    const ordinaryEmail = 'student@integration.invalid'
    mocks.get.mockResolvedValue({ exists: true, data: () => profile(ordinaryEmail) })
    await expect(requireActiveUser(call(ordinaryEmail))).rejects.toMatchObject({ code: 'failed-precondition' })
  })
})
