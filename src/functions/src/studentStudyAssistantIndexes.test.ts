import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type FieldOverride = {
  collectionGroup: string
  fieldPath: string
  indexes: Array<{ order?: string; queryScope?: string }>
}

describe('Student Study Assistant Firestore indexes', () => {
  const configuration = JSON.parse(readFileSync(new URL('../../../firestore.indexes.json', import.meta.url), 'utf8')) as {
    indexes?: Array<{ collectionGroup: string; queryScope: string; fields: Array<{ fieldPath: string; order: string }> }>
    fieldOverrides?: FieldOverride[]
  }

  it('declares the ascending collection-group index for delete-operation expiry', () => {
    expect(configuration.fieldOverrides).toContainEqual(expect.objectContaining({
      collectionGroup: 'studentStudyAssistantDeleteOperations',
      fieldPath: 'expiresAt',
      indexes: expect.arrayContaining([
        expect.objectContaining({ order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' }),
      ]),
    }))
  })

  it('declares the pending-state and lease-expiry collection-group index for abandoned claims', () => {
    expect(configuration.indexes).toContainEqual(expect.objectContaining({
      collectionGroup: 'studentStudyAssistantSendOperations',
      queryScope: 'COLLECTION_GROUP',
      fields: [
        { fieldPath: 'state', order: 'ASCENDING' },
        { fieldPath: 'leaseExpiresAt', order: 'ASCENDING' },
      ],
    }))
  })
})
