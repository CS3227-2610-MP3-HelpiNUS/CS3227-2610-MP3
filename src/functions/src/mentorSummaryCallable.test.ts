import { describe, expect, it } from 'vitest'
import { assertB3TestScope } from './mentorSummaryCallable.js'

const configuredEnvironment = (projectId: string): NodeJS.ProcessEnv => ({
  GCLOUD_PROJECT: projectId,
  SOCLAAS_B3_APPROVED_PROJECT_ID: projectId,
  SOCLAAS_B3_ENABLED: 'true',
  SOCLAAS_B3_ISOLATION_VERIFIED: 'true',
  SOCLAAS_B3_ALLOWED_UIDS: 'approved-uid',
})

describe('Mentor summary deployment project scope', () => {
  it.each(['helpinus-dev', 'helpinus-prod'])('accepts configured project %s', (projectId) => {
    expect(() => assertB3TestScope('approved-uid', configuredEnvironment(projectId))).not.toThrow()
  })

  it('rejects an unsupported deployment project before provider access', () => {
    expect(() => assertB3TestScope('approved-uid', configuredEnvironment('other-project')))
      .toThrow(expect.objectContaining({ code: 'unavailable' }))
  })

  it('rejects a mismatched approved project', () => {
    expect(() => assertB3TestScope('approved-uid', {
      ...configuredEnvironment('helpinus-prod'),
      SOCLAAS_B3_APPROVED_PROJECT_ID: 'helpinus-dev',
    })).toThrow(expect.objectContaining({ code: 'unavailable' }))
  })
})
