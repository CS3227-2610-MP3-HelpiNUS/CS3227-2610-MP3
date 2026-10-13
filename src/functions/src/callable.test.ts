import { describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import { initializeStudentProfileInputSchema } from '@helpinus/shared'
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
})
