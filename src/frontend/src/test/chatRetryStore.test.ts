import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearChatRetriesForSession, loadChatRetries, removeChatRetry, saveChatRetry, type ChatRetry } from '../services/chatRetryStore'

const record = (messageId: string, normalizedBody: string, localSequence: number): ChatRetry => ({
  version: 1, uid: 'student-one', requestId: 'request-one', messageId, normalizedBody, localSequence, state: 'uncertain',
})

describe('F02 private retry storage (F02-TC-035)', () => {
  beforeEach(() => sessionStorage.clear())

  it('retains multiple intentions and refuses a changed body under an old ID', () => {
    const first = record(crypto.randomUUID(), 'A message', 1)
    const second = record(crypto.randomUUID(), 'A message', 2)
    saveChatRetry(first); saveChatRetry(second)
    expect(loadChatRetries(first.uid, first.requestId)).toEqual([first, second])
    expect(() => saveChatRetry({ ...first, normalizedBody: 'Changed' })).toThrow()
    expect(loadChatRetries(first.uid, first.requestId)).toEqual([first, second])
    removeChatRetry(first)
    expect(loadChatRetries(first.uid, first.requestId)).toEqual([second])
  })

  it('clears private records on account switch and sign-out', () => {
    const first = record(crypto.randomUUID(), 'A message', 1)
    saveChatRetry(first)
    clearChatRetriesForSession(first.uid, 'other', true)
    expect(loadChatRetries(first.uid, first.requestId)).toEqual([])
    saveChatRetry(first)
    clearChatRetriesForSession(first.uid, null, false)
    expect(loadChatRetries(first.uid, first.requestId)).toEqual([])
  })

  it('pauses when storage cannot safely retain the record', () => {
    const existing = record(crypto.randomUUID(), 'A message', 1)
    saveChatRetry(existing)
    const storagePrototype = Object.getPrototypeOf(sessionStorage) as Storage
    const original = storagePrototype.setItem
    const spy = vi.spyOn(storagePrototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.includes('f02-send:') && !key.includes(existing.messageId)) throw new Error('Quota exceeded')
      return original.call(this, key, value)
    })
    expect(() => saveChatRetry(record(crypto.randomUUID(), 'A message', 2))).toThrow('Quota exceeded')
    expect(loadChatRetries(existing.uid, existing.requestId)).toEqual([existing])
    spy.mockRestore()
  })

  it('does not restore a tampered record whose body is not normalized', () => {
    const item = record(crypto.randomUUID(), 'A message', 1)
    saveChatRetry(item)
    sessionStorage.setItem(`f02-send:${encodeURIComponent(item.uid)}:${item.messageId}`, JSON.stringify({ ...item, normalizedBody: '  A message  ' }))
    expect(loadChatRetries(item.uid, item.requestId)).toEqual([])
  })

  it('rejects a changed-body collision without destroying the earlier intention', () => {
    const first = record(crypto.randomUUID(), 'Original message', 1)
    const independent = record(crypto.randomUUID(), 'Another message', 2)
    saveChatRetry(first)
    saveChatRetry(independent)
    expect(() => saveChatRetry({ ...first, normalizedBody: 'Changed message' })).toThrow('Message ID is already used for different text.')
    expect(loadChatRetries(first.uid, first.requestId)).toEqual([first, independent])
  })

  it('reports readback failure while retaining previously saved intentions', () => {
    const first = record(crypto.randomUUID(), 'Keep this saved', 1)
    const later = record(crypto.randomUUID(), 'Readback may fail', 2)
    saveChatRetry(first)
    const storagePrototype = Object.getPrototypeOf(sessionStorage) as Storage
    const original = storagePrototype.getItem
    let laterReads = 0
    const read = vi.spyOn(storagePrototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (key.endsWith(later.messageId) && ++laterReads === 2) return 'corrupt readback'
      return original.call(this, key)
    })
    try { expect(() => saveChatRetry(later)).toThrow('Message recovery could not be saved.') }
    finally { read.mockRestore() }
    expect(loadChatRetries(first.uid, first.requestId)).toContainEqual(first)
  })
})
