import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => {
  class Timestamp {
    seconds: number
    nanoseconds: number
    constructor(seconds: number, nanoseconds: number) { this.seconds = seconds; this.nanoseconds = nanoseconds }
    toDate() { return new Date(this.seconds * 1000 + this.nanoseconds / 1_000_000) }
  }
  return { Timestamp, onSnapshot: vi.fn(), unsubscribe: vi.fn() }
})

vi.mock('../services/firebase', () => ({ firebase: { firestore: {} } }))
vi.mock('firebase/firestore', () => ({
  Timestamp: sdk.Timestamp,
  collection: vi.fn(() => ({})), doc: vi.fn(() => ({})), documentId: vi.fn(() => ({})),
  getDocFromServer: vi.fn(), getDocs: vi.fn(), limit: vi.fn(() => ({})),
  onSnapshot: sdk.onSnapshot, orderBy: vi.fn(() => ({})), query: vi.fn(() => ({})),
  startAfter: vi.fn(() => ({})), where: vi.fn(() => ({})),
}))

import { firebaseConversations } from '../services/firebaseConversations'

describe('F02 production listener offline signal (TC-029)', () => {
  beforeEach(() => { sdk.onSnapshot.mockReset(); sdk.unsubscribe.mockReset() })

  it('reports a cached disconnect as stale and resumes saved history on a server snapshot', async () => {
    const requestId = 'f02-offline-parent'
    const messageId = crypto.randomUUID()
    const createdAt = new sdk.Timestamp(1_760_000_000, 0)
    const row = { id: messageId, data: () => ({ senderId: 'student-01', body: 'Persisted before offline', createdAt, readAt: null }) }
    let emit: ((snapshot: unknown) => void) | undefined
    sdk.onSnapshot.mockImplementation((...args: unknown[]) => {
      emit = args.find((value): value is (snapshot: unknown) => void => typeof value === 'function')
      return sdk.unsubscribe
    })
    const onData = vi.fn()
    const onError = vi.fn()
    const unsubscribe = firebaseConversations.subscribeMessages(requestId, null, onData, onError)
    expect(emit).toBeDefined()
    emit?.({ docs: [row], metadata: { fromCache: true } })
    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1))
    expect(onData.mock.calls[0]![0]).toEqual([{
      id: messageId, conversationId: requestId, senderId: 'student-01',
      body: 'Persisted before offline', createdAt: createdAt.toDate().toISOString(), readAt: null,
    }])
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'unavailable' }))

    emit?.({ docs: [row], metadata: { fromCache: false } })
    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(2))
    expect(onError).toHaveBeenCalledTimes(1)
    unsubscribe()
    expect(sdk.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('does not confirm a locally pending write as a saved listener message', async () => {
    const requestId = 'f02-offline-parent'
    const messageId = crypto.randomUUID()
    const createdAt = new sdk.Timestamp(1_760_000_000, 0)
    let emit: ((snapshot: unknown) => void) | undefined
    sdk.onSnapshot.mockImplementation((...args: unknown[]) => {
      emit = args.find((value): value is (snapshot: unknown) => void => typeof value === 'function')
      return sdk.unsubscribe
    })
    const onData = vi.fn()
    const onError = vi.fn()
    firebaseConversations.subscribeMessages(requestId, null, onData, onError)
    emit?.({ docs: [{ id: messageId, data: () => ({ senderId: 'student-01', body: 'Local only', createdAt, readAt: null }) }],
      metadata: { fromCache: true, hasPendingWrites: true } })
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'unavailable' })))
    expect(onData).not.toHaveBeenCalled()
  })
})
