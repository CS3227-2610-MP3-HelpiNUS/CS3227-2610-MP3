import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'

const actor = vi.hoisted(() => ({ uid: 'synthetic-student', email: 'synthetic@example.test', displayName: 'Synthetic Student', role: 'STUDENT' as const, status: 'ACTIVE' as const }))
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getProfile: vi.fn() }))
vi.mock('firebase-admin/firestore', async (importOriginal) => ({
  ...await importOriginal<typeof import('firebase-admin/firestore')>(),
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: mocks.getProfile }) }) }),
}))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ getUser: mocks.getUser }) }))

import { createHelpRequestHandler } from './helpRequests.js'

const input = { operationId: crypto.randomUUID(), mentorId: 'eligible-mentor', moduleId: 'module-a', title: 'Question', description: 'Details' }
const call = { auth: { uid: actor.uid, token: { email: actor.email, email_verified: true } } } as CallableRequest<unknown>

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('F01 create production-mode verification gate (TC-005)', () => {
  it('does not apply the synthetic-email exception unless the Functions emulator flag is exactly true', async () => {
    mocks.getProfile.mockResolvedValue({ exists: true, data: () => ({ id: actor.uid, email: actor.email, displayName: actor.displayName, role: actor.role, status: actor.status, createdAt: '2026-10-18T00:00:00.000Z' }) })
    mocks.getUser.mockResolvedValue({ email: actor.email, disabled: false, emailVerified: false })
    const reachedTransaction = new Error('transaction reached')
    const runTransaction = vi.fn(async () => { throw reachedTransaction })
    const docRef = { collection: () => ({ doc: () => ({}) }) }
    const db = { collection: () => ({ doc: () => docRef }), runTransaction } as unknown as Firestore
    for (const flag of [undefined, 'false', 'TRUE']) {
      if (flag === undefined) delete process.env.FUNCTIONS_EMULATOR
      else vi.stubEnv('FUNCTIONS_EMULATOR', flag)
      await expect(createHelpRequestHandler(input, call, db)).rejects.toMatchObject({ code: 'permission-denied' })
      expect(runTransaction).not.toHaveBeenCalled()
    }
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true')
    await expect(createHelpRequestHandler(input, call, db)).rejects.toBe(reachedTransaction)
    expect(runTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.getUser).toHaveBeenCalledWith(actor.uid)
  })
})
