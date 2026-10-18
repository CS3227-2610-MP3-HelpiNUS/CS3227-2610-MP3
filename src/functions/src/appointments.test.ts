import { describe, expect, it } from 'vitest'
import { availabilityWindowIssue } from './appointments.js'

const now = Date.parse('2026-10-18T00:00:00.000Z')

describe('consultation availability windows', () => {
  it.each([
    ['30-minute slot', '2026-10-18T01:00:00.000Z', '2026-10-18T01:30:00.000Z'],
    ['adjacent 60-minute slot', '2026-10-18T01:30:00.000Z', '2026-10-18T02:30:00.000Z'],
    ['maximum 120-minute slot', '2026-10-18T03:00:00.000Z', '2026-10-18T05:00:00.000Z'],
  ])('accepts a %s', (_label, startsAt, endsAt) => {
    expect(availabilityWindowIssue(startsAt, endsAt, now)).toBeNull()
  })

  it.each([
    ['elapsed start', '2026-10-18T00:00:00.000Z', '2026-10-18T00:30:00.000Z', 'PAST_SLOT'],
    ['inverted window', '2026-10-18T02:00:00.000Z', '2026-10-18T01:30:00.000Z', 'INVALID_WINDOW'],
    ['unaligned boundary', '2026-10-18T01:15:00.000Z', '2026-10-18T01:45:00.000Z', 'UNALIGNED_SLOT'],
    ['too long', '2026-10-18T01:00:00.000Z', '2026-10-18T03:30:00.000Z', 'INVALID_DURATION'],
  ])('rejects an %s', (_label, startsAt, endsAt, issue) => {
    expect(availabilityWindowIssue(startsAt, endsAt, now)).toBe(issue)
  })
})
