import { randomUUID } from 'node:crypto'
import type { Firestore } from 'firebase-admin/firestore'
import { AiGatewayError, type AiCapacity } from './aiGateway.js'

export const b3CapacityPath = 'soclaasTestScope/mentorSummary'
export const B3_FUNCTION_TIMEOUT_SECONDS = 40
// The provider deadline is 25 seconds and the Function hard limit is 40 seconds.
// A crashed invocation is reclaimable only after the hard limit plus 30 seconds.
export const B3_LEASE_MS = 70_000

type Lease = { id: string; actorId: string; startedAtMs: number; expiresAtMs: number }
type State = { active: Lease | null }

function stateOf(value: unknown): State {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AiGatewayError('AI_CONFIG')
  const data = value as Record<string, unknown>
  if (data.active === null) return { active: null }
  const active = data.active as Record<string, unknown> | undefined
  if (!active || typeof active !== 'object' || typeof active.id !== 'string' || !active.id ||
    typeof active.actorId !== 'string' || !active.actorId ||
    !Number.isSafeInteger(active.startedAtMs) || !Number.isSafeInteger(active.expiresAtMs) ||
    (active.expiresAtMs as number) - (active.startedAtMs as number) < B3_LEASE_MS ||
    (active.startedAtMs as number) < 0) throw new AiGatewayError('AI_CONFIG')
  return { active: active as Lease }
}

/** The existing attemptsUsed field is historical; only the active lease limits concurrent calls. */
export function createB3TestCapacity(db: Firestore, now = Date.now): AiCapacity {
  const ref = db.doc(b3CapacityPath)
  return {
    async withAiCapacity(actorId, feature, runAttempt) {
      if (feature !== 'MENTOR_CONSULTATION_SUMMARY' || !actorId) throw new AiGatewayError('AI_CONFIG')
      const id = randomUUID()
      try {
        await db.runTransaction(async (tx) => {
          const snapshot = await tx.get(ref)
          if (!snapshot.exists) throw new AiGatewayError('AI_CONFIG')
          const state = stateOf(snapshot.data())
          const at = now()
          if (!Number.isSafeInteger(at) || at < 0) throw new AiGatewayError('AI_CONFIG')
          if (state.active && at < state.active.expiresAtMs) {
            throw new AiGatewayError('AI_CAPACITY')
          }
          tx.update(ref, { active: { id, actorId, startedAtMs: at, expiresAtMs: at + B3_LEASE_MS } })
        })
      } catch (error) {
        if (error instanceof AiGatewayError) throw error
        throw new AiGatewayError('AI_CAPACITY')
      }
      let result: Awaited<ReturnType<typeof runAttempt>> | undefined
      let failed = false
      let failure: unknown
      try { result = await runAttempt() }
      catch (error) { failed = true; failure = error }
      try {
        await db.runTransaction(async (tx) => {
          const snapshot = await tx.get(ref)
          if (!snapshot.exists) throw new AiGatewayError('AI_CONFIG')
          const state = stateOf(snapshot.data())
          if (state.active?.id === id) tx.update(ref, { active: null })
        })
      } catch { throw new AiGatewayError('AI_PROVIDER') }
      if (failed) throw failure
      return result as Awaited<ReturnType<typeof runAttempt>>
    },
  }
}
