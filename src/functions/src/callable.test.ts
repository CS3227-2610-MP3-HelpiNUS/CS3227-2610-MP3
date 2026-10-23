import { describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import { createHelpRequestInputSchema, initializeStudentProfileInputSchema } from '@helpinus/shared'
import { parseRequest } from './callable.js'

describe('shared callable parsing', () => {
  it('accepts a valid contract input', () => {
    expect(parseRequest(initializeStudentProfileInputSchema, { displayName: 'Student' })).toEqual({ displayName: 'Student' })
  })
  it('maps invalid contract input to INVALID_ARGUMENT-compatible callable error details', () => {
    try {
      parseRequest(initializeStudentProfileInputSchema, { displayName: '' })
      throw new Error('expected parsing to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(HttpsError)
      expect(error).toMatchObject({ code: 'invalid-argument', details: { fieldErrors: { displayName: expect.any(Array) } } })
    }
  })
  it('maps F01 content and forged identity faults to field errors before the handler', () => {
    const base = { operationId: 'b70f16a0-5010-4a53-95d7-718e396090a5', mentorId: 'mentor-1', moduleId: 'cs2103t', title: 'Question', description: 'Explain the topic' }
    const invalid: Array<[string, Record<string, unknown>]> = [
      ['title', { ...base, title: undefined }],
      ['title', { ...base, title: null }],
      ['title', { ...base, title: ' \t\n ' }],
      ['title', { ...base, title: { text: 'Question' } }],
      ['title', { ...base, title: `  ${'x'.repeat(121)}  ` }],
      ['description', { ...base, description: undefined }],
      ['description', { ...base, description: null }],
      ['description', { ...base, description: ' \n\t ' }],
      ['description', { ...base, description: ['Line one'] }],
      ['description', { ...base, description: `  ${'x'.repeat(2001)}  ` }],
      ['_root', { ...base, studentId: 'forged' }],
    ]
    for (const [field, value] of invalid) {
      try {
        parseRequest(createHelpRequestInputSchema, value)
        throw new Error(`Expected ${field} validation to fail`)
      } catch (error) {
        expect(error).toBeInstanceOf(HttpsError)
        expect(error).toMatchObject({ code: 'invalid-argument', details: { fieldErrors: { [field]: expect.any(Array) } } })
      }
    }
    expect(parseRequest(createHelpRequestInputSchema, { ...base, title: '  Question  ', description: '  Line one\nLine two <b>literal</b>  ' })).toEqual({
      ...base, title: 'Question', description: 'Line one\nLine two <b>literal</b>',
    })
  })
})
