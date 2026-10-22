import { describe, expect, it } from 'vitest'
import { parseBrief } from './mentorConsultationSummary.js'

describe('Mentor brief output from the live model', () => {
  it('converts bounded list-style draft sections to display text', () => {
    const diagnostics: Record<string, unknown>[] = []
    const value = {
      summary: 'The Student asked about retrying message sends.',
      unresolvedQuestions: ['Does the same ID survive an app restart?'],
      teachingApproaches: ['Use one UUID for each composed message.', 'Test a retry after timeout.'],
      limitations: null,
    }
    expect(parseBrief(JSON.stringify(value), (item) => { diagnostics.push(item) })).toEqual({
      summary: value.summary,
      unresolvedQuestions: value.unresolvedQuestions[0],
      teachingApproaches: value.teachingApproaches.join('\n\n'),
      limitations: 'None identified from the selected messages.',
    })
    expect(diagnostics).toContainEqual({
      mentorFields: { summary: 'string', unresolvedQuestions: 'array', teachingApproaches: 'array', limitations: 'null' },
      mentorUnknownFieldCount: 0,
    })
  })

  it('accepts four headed paragraphs without requiring JSON', () => {
    expect(parseBrief([
      '## Conversation summary',
      'The Student asked about retrying message sends.',
      '',
      '## Unresolved Student questions',
      'Does the same ID survive an app restart?',
      '',
      '## Suggested teaching approaches',
      'Use a small retry example.',
      '',
      '## Limitations or missing context',
      'None identified from the selected messages.',
    ].join('\n'))).toEqual({
      summary: 'The Student asked about retrying message sends.',
      unresolvedQuestions: 'Does the same ID survive an app restart?',
      teachingApproaches: 'Use a small retry example.',
      limitations: 'None identified from the selected messages.',
    })
  })

  it('trims section whitespace and accepts list-style summary paragraphs', () => {
    expect(parseBrief(JSON.stringify({
      summary: [' First paragraph ', ' Second paragraph '], unresolvedQuestions: [' Question '],
      teachingApproaches: 'Approach', limitations: null,
    }))).toEqual({
      summary: 'First paragraph\n\nSecond paragraph', unresolvedQuestions: 'Question', teachingApproaches: 'Approach',
      limitations: 'None identified from the selected messages.',
    })
  })

  it('still rejects arbitrary nested values and invalid section boundaries', () => {
    for (const value of [
      { summary: 'Summary', unresolvedQuestions: [], teachingApproaches: [], limitations: [], extra: 'leak' },
      { summary: 'Summary', unresolvedQuestions: { private: 'value' }, teachingApproaches: [], limitations: [] },
      { summary: [], unresolvedQuestions: [], teachingApproaches: [], limitations: [] },
      { summary: 'Summary', unresolvedQuestions: ['Question', 7], teachingApproaches: [], limitations: [] },
    ]) {
      expect(() => parseBrief(JSON.stringify(value))).toThrowError(/consultation draft is unavailable/u)
    }
    expect(() => parseBrief('Preface\nSummary\nSafe\nUnresolved questions\nNone\nTeaching approaches\nDiscuss\nLimitations\nNone')).toThrowError(/consultation draft is unavailable/u)
    expect(() => parseBrief('Summary\nSafe\nUnresolved questions\nNone')).toThrowError(/consultation draft is unavailable/u)
  })
})
