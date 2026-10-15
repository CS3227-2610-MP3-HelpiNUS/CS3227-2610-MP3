import { describe, expect, it } from 'vitest'
import { activeSearchPrefixes, normalizeModuleQuery } from './moduleSearchKeys.js'

describe('module search keys', () => {
  it('normalizes queries with NFKC, trimming and lowercase', () => {
    expect(normalizeModuleQuery('  ＣＳ2103Ｔ  ')).toBe('cs2103t')
    expect(normalizeModuleQuery('\t  ＡＢ  \n')).toBe('ab')
    expect(normalizeModuleQuery('  SoFtWaRe Engineering  ')).toBe('software engineering')
  })
  it('builds literal unique code and title prefixes for active records only', () => {
    const module = { id: 'm', code: ' ＡＢ ', title: 'Ab X', active: true }
    expect(activeSearchPrefixes(module)).toEqual(['a', 'ab', 'ab ', 'ab x'])
    expect(activeSearchPrefixes({ ...module, active: false })).toEqual([])
  })

  it('caps every indexed prefix at the 160-character query limit', () => {
    const tokens = activeSearchPrefixes({ id: 'long', code: 'CS', title: 'a'.repeat(160), active: true })
    expect(tokens).toHaveLength(162)
    expect(tokens.at(-1)).toBe('a'.repeat(160))
    expect(tokens).not.toContain('a'.repeat(161))
  })
})
