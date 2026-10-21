import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadStudentStudyAssistantRetry,
  saveStudentStudyAssistantRetry,
  type StudentStudyAssistantRetry,
} from '../services/studentStudyAssistantRetryStore'

const retry = (uid = 'student-one'): StudentStudyAssistantRetry => ({
  version: 1,
  uid,
  request: {
    requestId: '00000000-0000-4000-8000-000000000001',
    conversationId: null,
    userMessage: 'Explain breadth-first search.',
  },
})

describe('Student Study Assistant retry storage', () => {
  beforeEach(() => sessionStorage.clear())

  it('restores the exact request only for its owning Student', () => {
    const item = retry()
    saveStudentStudyAssistantRetry(item)
    expect(loadStudentStudyAssistantRetry(item.uid)).toEqual(item)
    expect(loadStudentStudyAssistantRetry('student-two')).toBeNull()
  })

  it('refuses changed text under an existing request ID', () => {
    const item = retry()
    saveStudentStudyAssistantRetry(item)
    expect(() => saveStudentStudyAssistantRetry({ ...item, request: { ...item.request, userMessage: 'Different text' } })).toThrow('already associated')
    expect(loadStudentStudyAssistantRetry(item.uid)).toEqual(item)
  })

  it('does not return tampered or malformed recovery data', () => {
    const item = retry()
    saveStudentStudyAssistantRetry(item)
    sessionStorage.setItem('student-study-assistant-send', JSON.stringify({ ...item, request: { ...item.request, requestId: 'not-a-uuid' } }))
    expect(loadStudentStudyAssistantRetry(item.uid)).toBeNull()
  })

  it('blocks dispatch when exact retry recovery cannot be persisted', () => {
    const original = sessionStorage
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
    const blocked = {
      get length() { return original.length },
      clear: () => original.clear(),
      getItem: (key: string) => original.getItem(key),
      key: (index: number) => original.key(index),
      removeItem: (key: string) => original.removeItem(key),
      setItem: () => { throw new DOMException('Storage is unavailable.', 'QuotaExceededError') },
    } satisfies Storage
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: blocked })
    try {
      expect(() => saveStudentStudyAssistantRetry(retry())).toThrow('Storage is unavailable.')
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor)
    }
    expect(loadStudentStudyAssistantRetry('student-one')).toBeNull()
  })
})

