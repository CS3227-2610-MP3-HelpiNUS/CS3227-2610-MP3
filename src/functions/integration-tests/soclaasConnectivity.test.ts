import { afterAll, describe, expect, it } from 'vitest'
import { deleteApp as deleteClientApp, initializeApp as initializeClientApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { firestoreAMarker } from '../src/soclaasConnectivityPrivate.js'
import type { AEvidence } from '../src/soclaasConnectivity.js'

const app = initializeApp({ projectId: 'helpinus-integration-test' }, 'soclaas-a-marker-test')
const db = getFirestore(app)
const ref = db.collection('soclaasVerification').doc('milestoneA')
const client = initializeClientApp({ apiKey: 'synthetic-api-key', appId: 'soclaas-a-test', projectId: 'helpinus-integration-test' }, 'soclaas-a-client')
const auth = getAuth(client)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
const functions = getFunctions(client, 'asia-southeast1')
connectFunctionsEmulator(functions, '127.0.0.1', 5001)
const callable = httpsCallable<{ action: 'models' }, unknown>(functions, 'soclaasConnectivityCheck')
const evidence: AEvidence = {
  operator: 'synthetic-operator', projectId: 'helpinus-integration-test', modelId: 'synthetic-catalog-model',
  at: '2026-10-20T00:00:00.000Z', attemptsUsed: 1, outcome: 'attempted',
}

afterAll(async () => { await signOut(auth); await deleteClientApp(client); await deleteApp(app) })

describe('Milestone A Firestore one-attempt marker', () => {
  it('admits exactly one racing instance and stays consumed after reconstruction', async () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
    const [first, second] = await Promise.all([
      firestoreAMarker(db).consume(evidence),
      firestoreAMarker(db).consume(evidence),
    ])
    expect([first, second].sort()).toEqual([false, true])
    expect((await ref.get()).data()).toEqual(evidence)
    expect(await firestoreAMarker(db).consume(evidence)).toBe(false)
    await firestoreAMarker(db).recordOutcome('timeout')
    expect((await ref.get()).data()).toEqual({ ...evidence, outcome: 'timeout' })
  }, 30000)
})

describe('Milestone A exported callable gate', () => {
  it('denies signed-out callers and fails closed in a non-development project', async () => {
    const before = (await ref.get()).data() ?? null
    await signOut(auth)
    await expect(callable({ action: 'models' })).rejects.toMatchObject({ code: 'functions/unauthenticated' })
    await createUserWithEmailAndPassword(auth, `soclaas-a-${crypto.randomUUID()}@example.test`, 'Synthetic-123!')
    await expect(callable({ action: 'models' })).rejects.toMatchObject({ code: 'functions/failed-precondition' })
    expect((await ref.get()).data() ?? null).toEqual(before)
  }, 30000)
})
