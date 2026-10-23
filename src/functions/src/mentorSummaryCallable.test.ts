import { describe, expect, it } from 'vitest'
import { assertB3TestScope } from './mentorSummaryCallable.js'

const configuredEnvironment = (projectId: string): NodeJS.ProcessEnv => ({
  GCLOUD_PROJECT: projectId,
})

describe('Mentor summary deployment project scope', () => {
  it.each(['helpinus-dev', 'helpinus-prod'])('accepts any signed-in UID in configured project %s', (projectId) => {
    expect(() => assertB3TestScope('first-mentor', configuredEnvironment(projectId))).not.toThrow()
    expect(() => assertB3TestScope('another-mentor', configuredEnvironment(projectId))).not.toThrow()
  })

  it('rejects signed-out callers', () => {
    expect(() => assertB3TestScope(undefined, configuredEnvironment('helpinus-prod')))
      .toThrow(expect.objectContaining({ code: 'unauthenticated' }))
  })

  it('rejects an unsupported deployment project before provider access', () => {
    expect(() => assertB3TestScope('approved-uid', configuredEnvironment('other-project')))
      .toThrow(expect.objectContaining({ code: 'unavailable' }))
  })

  it('rejects a mismatched runtime project', () => {
    expect(() => assertB3TestScope('approved-uid', configuredEnvironment('helpinus-prod'), 'helpinus-dev'))
      .toThrow(expect.objectContaining({ code: 'unavailable' }))
  })
})
