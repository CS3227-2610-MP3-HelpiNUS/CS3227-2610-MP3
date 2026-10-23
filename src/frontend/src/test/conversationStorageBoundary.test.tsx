import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest, F02SavedMessage, SendMessageInput } from '@helpinus/shared'
import { ConversationDetailPage } from '../pages/ConversationPages'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices } from '../services/contracts'
import { createMockCallableClient, mockDashboard, mockServices } from '../services/mockServices'
import { loadChatRetries, saveChatRetry, type ChatRetry } from '../services/chatRetryStore'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0].user
const request: F01HelpRequest = {
  id: 'f02-storage-parent', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Storage boundary', description: 'Earlier intentions', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const keyFor = (messageId: string) => `f02-send:${encodeURIComponent(student.id)}:${messageId}`
const record = (body: string, sequence: number): ChatRetry => ({
  version: 1, uid: student.id, requestId: request.id, messageId: crypto.randomUUID(),
  normalizedBody: body, localSequence: sequence, state: 'uncertain',
})
const saved = (input: SendMessageInput): F02SavedMessage => ({
  id: input.messageId, conversationId: input.requestId, senderId: student.id,
  body: input.body, createdAt: '2026-10-16T09:01:00.000Z', readAt: null,
})

function mount(server: HelpiNUSServices['conversations']['getMessageFromServer'], send: (input: SendMessageInput) => Promise<{ message: F02SavedMessage }>) {
  const services: HelpiNUSServices = {
    ...mockServices,
    session: {
      ...mockServices.session,
      getCurrent: async () => ({ user: student }),
      subscribe(listener) { listener({ user: student }); return () => {} },
    },
    conversations: {
      ...mockServices.conversations,
      subscribeDetail(_id, onData) { onData({ request }); return () => {} },
      subscribeMessages(_id, _cursor, onData) { onData([], null); return () => {} },
      getMessageFromServer: server,
    },
    callables: createMockCallableClient({ sendMessage: send }),
  }
  const router = createMemoryRouter([
    { path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> },
  ], { initialEntries: [`/student/conversations/${request.id}`] })
  return render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
}

describe('F02 storage fault preservation (TC-035)', () => {
  beforeEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })

  it.each(['write', 'readback', 'collision'] as const)(
    'blocks a %s fault, preserves every earlier byte, and restores only earlier IDs', async (fault) => {
      const earlier = [record('First unresolved', 1), record('Second unresolved', 2)]
      earlier.forEach(saveChatRetry)
      const priorBytes = earlier.map((item) => sessionStorage.getItem(keyFor(item.messageId)))
      const server = vi.fn(async () => { throw { code: 'unavailable' } })
      const send = vi.fn(async (input: SendMessageInput) => ({ message: saved(input) }))
      const view = mount(server, send)
      await waitFor(() => expect(screen.getAllByText('? Save uncertain')).toHaveLength(2))
      const input = screen.getByRole('textbox', { name: 'Message' })
      fireEvent.change(input, { target: { value: 'Third unsaved intention' } })

      const storagePrototype = Object.getPrototypeOf(sessionStorage) as Storage
      const originalSet = storagePrototype.setItem
      const originalGet = storagePrototype.getItem
      let newKey = ''
      let newReads = 0
      if (fault === 'write') {
        vi.spyOn(storagePrototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
          if (key.startsWith('f02-send:') && !earlier.some((item) => key.endsWith(item.messageId))) throw new Error('write failed')
          return originalSet.call(this, key, value)
        })
      } else if (fault === 'readback') {
        vi.spyOn(storagePrototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
          if (key.startsWith('f02-send:') && !earlier.some((item) => key.endsWith(item.messageId))) newKey = key
          return originalSet.call(this, key, value)
        })
        vi.spyOn(storagePrototype, 'getItem').mockImplementation(function (this: Storage, key) {
          if (key === newKey && ++newReads === 1) return 'unreadable'
          return originalGet.call(this, key)
        })
      } else {
        vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(earlier[0]!.messageId as `${string}-${string}-${string}-${string}-${string}`)
      }

      await userEvent.setup().click(screen.getByRole('button', { name: 'Send message' }))
      expect(await screen.findByText(/This message cannot be saved for recovery/)).toBeInTheDocument()
      expect(input).toHaveValue('Third unsaved intention')
      expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
      expect(send).not.toHaveBeenCalled()
      expect(earlier.map((item) => sessionStorage.getItem(keyFor(item.messageId)))).toEqual(priorBytes)
      expect(loadChatRetries(student.id, request.id)).toEqual(earlier)
      if (newKey) expect(sessionStorage.getItem(newKey)).toBeNull()

      view.unmount()
      vi.restoreAllMocks()
      const recoveredServer = vi.fn(async () => null)
      mount(recoveredServer, send)
      await waitFor(() => expect(send).toHaveBeenCalledTimes(earlier.length))
      expect(send.mock.calls.map(([item]) => item)).toEqual(earlier.map((item) => ({
        requestId: request.id, messageId: item.messageId, body: item.normalizedBody,
      })))
      await waitFor(() => expect(screen.getAllByText('✓✓ Sent')).toHaveLength(earlier.length))
      await waitFor(() => expect(loadChatRetries(student.id, request.id)).toEqual([]))
    },
  )

  it('keeps 128 distinct unresolved records in order without evicting the oldest', () => {
    const items = Array.from({ length: 128 }, (_, index) => record(`Unresolved ${index}`, index + 1))
    items.forEach(saveChatRetry)
    expect(loadChatRetries(student.id, request.id)).toEqual(items)
    expect(sessionStorage.getItem(keyFor(items[0]!.messageId))).toBe(JSON.stringify(items[0]))
    expect(sessionStorage.getItem(keyFor(items.at(-1)!.messageId))).toBe(JSON.stringify(items.at(-1)))
  })
})
