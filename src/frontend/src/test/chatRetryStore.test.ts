import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearChatRetriesForSession, loadChatRetries, removeChatRetry, saveChatRetry, type ChatRetry } from '../services/chatRetryStore'

const record = (messageId = crypto.randomUUID()): ChatRetry => ({ version: 1, uid: 'student', requestId: 'request', messageId, normalizedBody: 'A message', localSequence: 1, state: 'sending' })

describe('F02 private send recovery', () => {
  beforeEach(() => sessionStorage.clear())
  it('retains multiple intentions and refuses a changed body under an old ID', () => {
    const first = record()
    const second = { ...record(), localSequence: 2 }
    saveChatRetry(first); saveChatRetry(second)
    expect(loadChatRetries('student', 'request')).toEqual([first, second])
    expect(() => saveChatRetry({ ...first, normalizedBody: 'Changed' })).toThrow()
    expect(loadChatRetries('student', 'request')).toEqual([first, second])
    removeChatRetry(first)
    expect(loadChatRetries('student', 'request')).toEqual([second])
  })
  it('clears private records on account switch and sign-out', () => {
    saveChatRetry(record())
    clearChatRetriesForSession('student', 'other', true)
    expect(loadChatRetries('student', 'request')).toEqual([])
    saveChatRetry(record())
    clearChatRetriesForSession('student', null, false)
    expect(loadChatRetries('student', 'request')).toEqual([])
  })
  it('pauses when storage cannot safely retain the record', () => {
    const existing = record()
    saveChatRetry(existing)
    const original = Storage.prototype.setItem
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.includes('f02-send:') && !key.includes(existing.messageId)) throw new Error('Quota exceeded')
      return original.call(this, key, value)
    })
    expect(() => saveChatRetry(record())).toThrow('Quota exceeded')
    expect(loadChatRetries('student', 'request')).toEqual([existing])
    spy.mockRestore()
  })
  it('does not restore a tampered record whose body is not normalized', () => {
    const item = record()
    saveChatRetry(item)
    sessionStorage.setItem(`f02-send:${encodeURIComponent(item.uid)}:${item.messageId}`, JSON.stringify({ ...item, normalizedBody: '  A message  ' }))
    expect(loadChatRetries('student', 'request')).toEqual([])
  })
})
