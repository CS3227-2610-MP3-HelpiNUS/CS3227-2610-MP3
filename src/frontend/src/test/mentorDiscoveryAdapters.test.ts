import { beforeEach, describe, expect, it, vi } from 'vitest'
import { discoverMentorsOutputSchema } from '@helpinus/shared'

const sdk = vi.hoisted(() => ({
  doc: vi.fn((_firestore: unknown, collection: string, id: string) => `${collection}/${id}`),
  getDoc: vi.fn(),
  httpsCallable: vi.fn(),
}))

vi.mock('../services/firebase', () => ({ firebase: { auth: {}, firestore: {}, functions: {} } }))
vi.mock('../services/firebaseConfig', () => ({ firebaseEnvironment: 'development', isEmulatorConnectionAllowed: () => false }))
vi.mock('firebase/firestore', () => ({ doc: sdk.doc, getDoc: sdk.getDoc }))
vi.mock('firebase/functions', () => ({ httpsCallable: sdk.httpsCallable }))

import { firebaseServices } from '../services/firebaseServices'
import { createMockModuleLookup, mockServices } from '../services/mockServices'

describe('Mentor discovery service adapters', () => {
  beforeEach(() => vi.clearAllMocks())

  it('F02-TC-029 reads an authorized module document, parses its canonical ID, and returns null only for absence', async () => {
    sdk.getDoc.mockResolvedValueOnce({
      id: 'cs2040s', exists: () => true,
      data: () => ({ code: 'CS2040S', title: 'Data Structures and Algorithms', active: true }),
    }).mockResolvedValueOnce({ id: 'missing', exists: () => false })

    await expect(firebaseServices.modules.getById('cs2040s')).resolves.toEqual({
      id: 'cs2040s', code: 'CS2040S', title: 'Data Structures and Algorithms', active: true,
    })
    await expect(firebaseServices.modules.getById('missing')).resolves.toBeNull()
    expect(sdk.doc).toHaveBeenNthCalledWith(1, expect.anything(), 'modules', 'cs2040s')
    expect(sdk.doc).toHaveBeenNthCalledWith(2, expect.anything(), 'modules', 'missing')
    expect(sdk.getDoc).toHaveBeenCalledWith('modules/cs2040s')
    expect(sdk.getDoc).toHaveBeenCalledWith('modules/missing')
  })

  it('F02-TC-030 rejects invalid, mismatched, and failed module reads', async () => {
    sdk.getDoc.mockResolvedValueOnce({
      id: 'cs2040s', exists: () => true,
      data: () => ({ code: '', title: 'Invalid module', active: true }),
    }).mockResolvedValueOnce({
      id: 'cs2040s', exists: () => true,
      data: () => ({ id: 'other-module', code: 'CS2040S', title: 'Valid title', active: true }),
    }).mockRejectedValueOnce(new Error('permission denied'))

    await expect(firebaseServices.modules.getById('cs2040s')).rejects.toThrow()
    await expect(firebaseServices.modules.getById('cs2040s')).rejects.toThrow('does not match')
    await expect(firebaseServices.modules.getById('cs2040s')).rejects.toThrow('permission denied')
  })

  it('F02-TC-031 validates public discovery output and rejects malformed or private fields', async () => {
    const publicOutput = {
      mentors: [{ userId: 'mentor-1', displayName: 'Sample Mentor', biography: '', moduleIds: [] }],
      nextCursor: null,
    }
    const invoke = vi.fn().mockResolvedValueOnce({ data: publicOutput })
      .mockResolvedValueOnce({ data: { mentors: 'invalid', nextCursor: null } })
      .mockResolvedValueOnce({ data: {
        mentors: [{ ...publicOutput.mentors[0], email: 'private@example.test' }], nextCursor: null,
      } })
    sdk.httpsCallable.mockReturnValue(invoke)

    await expect(firebaseServices.callables.invoke('discoverMentors', { limit: 20 })).resolves.toEqual(publicOutput)
    await expect(firebaseServices.callables.invoke('discoverMentors', { limit: 20 })).rejects.toThrow()
    await expect(firebaseServices.callables.invoke('discoverMentors', { limit: 20 })).rejects.toThrow()
    expect(sdk.httpsCallable).toHaveBeenCalledWith(expect.anything(), 'discoverMentors')
    expect(invoke).toHaveBeenCalledWith({ limit: 20 })
  })

  it('F02-TC-032 selects schema-valid mock pages by exact cursor and rejects unexpected inputs', async () => {
    const first = await mockServices.callables.invoke('discoverMentors', { limit: 20 })
    const second = await mockServices.callables.invoke('discoverMentors', { cursor: first.nextCursor!, limit: 20 })

    expect(discoverMentorsOutputSchema.parse(first)).toEqual(first)
    expect(discoverMentorsOutputSchema.parse(second)).toEqual(second)
    expect(first.mentors).toHaveLength(4)
    expect(first.nextCursor).toBe('sample-page-2')
    expect(second.mentors).toHaveLength(1)
    expect(second.nextCursor).toBeNull()
    expect(first.mentors[0]).toEqual({
      userId: 'sample-mentor-01', displayName: 'Sample Aisha',
      biography: 'I enjoy explaining software design with examples.', moduleIds: ['cs2103t', 'cs2040s'],
    })
    await expect(mockServices.callables.invoke('discoverMentors', { cursor: 'unrecognized', limit: 20 })).rejects.toThrow('Unknown')
    await expect(mockServices.callables.invoke('discoverMentors', { limit: 5 })).rejects.toThrow('page size')
  })

  it('F02-TC-032 parses mock module records and distinguishes absence, invalid data, and read failures', async () => {
    await expect(mockServices.modules.getById('cs2040s')).resolves.toMatchObject({ code: 'CS2040S', active: true })
    await expect(mockServices.modules.getById('cs3230')).resolves.toMatchObject({ code: 'CS3230', active: false })
    await expect(mockServices.modules.getById('missing-module')).resolves.toBeNull()

    const lookup = createMockModuleLookup(new Map<string, unknown>([
      ['invalid', { id: 'invalid', code: '', title: 'Invalid', active: true }],
      ['mismatched', { id: 'other', code: 'CS1234', title: 'Wrong ID', active: true }],
      ['failed', new Error('offline')],
    ]))
    await expect(lookup.getById('invalid')).rejects.toThrow()
    await expect(lookup.getById('mismatched')).rejects.toThrow('does not match')
    await expect(lookup.getById('failed')).rejects.toThrow('offline')
    await expect(lookup.getById('absent')).resolves.toBeNull()
  })
})
