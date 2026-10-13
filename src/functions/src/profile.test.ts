import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { initializeStudentProfileInputSchema } from '@helpinus/shared'

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}))
import { initializeStudentProfileHandler } from './profile.js'

const request = (auth: CallableRequest<unknown>['auth'] | null) => ({ auth }) as unknown as CallableRequest<unknown>
const input = initializeStudentProfileInputSchema.parse({ displayName: 'Student', role: 'MENTOR', status: 'ACTIVE' })

function fakeDb(existing?: Record<string, unknown>) {
  const create = vi.fn()
  const get = vi.fn().mockResolvedValue({ exists: Boolean(existing), data: () => existing })
  const db = {
    collection: () => ({ doc: () => ({ id: 'u1' }) }),
    runTransaction: async (work: (transaction: { get: typeof get; create: typeof create }) => unknown) => work({ get, create }),
  }
  return { db: db as never, create, get }
}

describe('initializeStudentProfile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects unauthenticated requests', async () => {
    const { db } = fakeDb()
    await expect(initializeStudentProfileHandler(input, request(null), db, true))
      .rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('creates only a STUDENT ACTIVE profile from authenticated identity data', async () => {
    const { db, create } = fakeDb()
    const auth = { uid: 'u1', token: { email: 'u1@example.test', email_verified: false } } as never
    const result = await initializeStudentProfileHandler(input, request(auth), db, true)
    expect(result.user).toMatchObject({ id: 'u1', displayName: 'Student', email: 'u1@example.test', role: 'STUDENT', status: 'ACTIVE' })
    expect(create).toHaveBeenCalledWith({ id: 'u1' }, expect.objectContaining({ role: 'STUDENT', status: 'ACTIVE' }))
  })

  it('requires verified email outside the emulator', async () => {
    const { db } = fakeDb()
    const auth = { uid: 'u1', token: { email: 'u1@example.test', email_verified: false } } as never
    await expect(initializeStudentProfileHandler(input, request(auth), db, false))
      .rejects.toMatchObject({ code: 'failed-precondition' })
  })

  it('returns an existing matching student profile without changing it', async () => {
    const existing = { id: 'u1', displayName: 'Original', email: 'u1@example.test', role: 'STUDENT', status: 'ACTIVE', createdAt: new Date('2026-10-13T02:00:00.000Z') }
    const { db, create } = fakeDb(existing)
    const auth = { uid: 'u1', token: { email: 'u1@example.test', email_verified: true } } as never
    const result = await initializeStudentProfileHandler(input, request(auth), db, false)
    expect(result.user).toMatchObject({ displayName: 'Original', role: 'STUDENT' })
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses to convert an existing mentor profile', async () => {
    const { db, create } = fakeDb({ email: 'u1@example.test', role: 'MENTOR', status: 'ACTIVE' })
    const auth = { uid: 'u1', token: { email: 'u1@example.test', email_verified: true } } as never
    await expect(initializeStudentProfileHandler(input, request(auth), db, false))
      .rejects.toBeInstanceOf(HttpsError)
    expect(create).not.toHaveBeenCalled()
  })
})
