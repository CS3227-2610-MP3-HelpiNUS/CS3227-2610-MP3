import { createHash } from 'node:crypto'
import { HttpsError } from 'firebase-functions/v2/https'
import type { StudentStudyAssistantCitation } from '@helpinus/shared'
import { nusComputingStudentStudyAssistantGeneration } from './studentStudyAssistantCorpus.js'

export type StudentStudyAssistantAccessClassification = 'ALL_ACTIVE_STUDENTS'
export type StudentStudyAssistantReviewState = 'APPROVED' | 'QUARANTINED'

export interface StudentStudyAssistantChunk {
  chunkId: string
  sourceId: string
  title: string
  canonicalUrl: string
  version: string
  section: string | null
  content: string
  contentHash: string
  approvedBy: string
  approvedAt: string
  accessClassification: StudentStudyAssistantAccessClassification
  reviewState: StudentStudyAssistantReviewState
  keywords: ReadonlyArray<string>
}

export interface StudentStudyAssistantCorpusGeneration {
  generation: string
  allowedUrlPrefixes: ReadonlyArray<string>
  chunks: ReadonlyArray<StudentStudyAssistantChunk>
}

export interface StudentStudyAssistantRetrievalResult {
  chunks: ReadonlyArray<StudentStudyAssistantChunk>
  corpusGeneration: string
}

export interface StudentStudyAssistantRetriever {
  retrieve(query: string, limit: number): Promise<StudentStudyAssistantRetrievalResult>
}

export const studentStudyAssistantContentHash = (content: string) =>
  createHash('sha256').update(content.normalize('NFKC'), 'utf8').digest('hex')

const bfsContent = 'Breadth-first search explores a graph level by level using a queue and marks vertices as visited.'
const recursionContent = 'A recursive function needs a base case and a recursive step that makes progress toward that base case.'

const syntheticGeneration: StudentStudyAssistantCorpusGeneration = {
  generation: 'synthetic-v1',
  allowedUrlPrefixes: ['https://example.test/helpinus-synthetic/'],
  chunks: [
    {
      chunkId: 'synthetic-bfs-1', sourceId: 'synthetic-algorithms-notes', title: 'Synthetic Algorithms Notes',
      canonicalUrl: 'https://example.test/helpinus-synthetic/algorithms', version: 'synthetic-v1', section: 'Breadth-first search',
      content: bfsContent, contentHash: studentStudyAssistantContentHash(bfsContent), approvedBy: 'SYNTHETIC_TEST_FIXTURE',
      approvedAt: '2026-10-21T00:00:00.000Z', accessClassification: 'ALL_ACTIVE_STUDENTS', reviewState: 'APPROVED',
      keywords: ['bfs', 'breadth', 'first', 'search', 'graph', 'queue', 'vertex', 'vertices'],
    },
    {
      chunkId: 'synthetic-recursion-1', sourceId: 'synthetic-programming-notes', title: 'Synthetic Programming Notes',
      canonicalUrl: 'https://example.test/helpinus-synthetic/programming', version: 'synthetic-v1', section: 'Recursion',
      content: recursionContent, contentHash: studentStudyAssistantContentHash(recursionContent), approvedBy: 'SYNTHETIC_TEST_FIXTURE',
      approvedAt: '2026-10-21T00:00:00.000Z', accessClassification: 'ALL_ACTIVE_STUDENTS', reviewState: 'APPROVED',
      keywords: ['recursion', 'recursive', 'function', 'base', 'case'],
    },
  ],
}

const normalize = (value: string) => Array.from(value.normalize('NFKC'), (character) => {
  const codePoint = character.codePointAt(0) ?? 0
  const unsafe = codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) || (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2060 && codePoint <= 0x206f) || codePoint === 0xfeff
  return unsafe ? ' ' : character
}).join('').toLocaleLowerCase('en').match(/[\p{L}\p{N}]+/gu) ?? []

const hasCorpusInvisibleControl = (value: string) => Array.from(value).some((character) => {
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint <= 0x08 || codePoint === 0x0b || codePoint === 0x0c ||
    (codePoint >= 0x0e && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) || (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2060 && codePoint <= 0x206f) || codePoint === 0xfeff
})
const corpusInjectionPattern = /(?:ignore|disregard|override).{0,48}(?:instruction|system|prompt)|(?:reveal|repeat).{0,32}system prompt|<\s*(?:script|img|iframe)\b|javascript\s*:/iu
const boundedText = (value: unknown, maximum: number): value is string => typeof value === 'string' &&
  value.trim().length > 0 && value.length <= maximum && !hasCorpusInvisibleControl(value) && !corpusInjectionPattern.test(value)

function isPrivateOrInternalHost(hostname: string): boolean {
  const host = hostname.toLocaleLowerCase('en').replace(/^\[|\]$/gu, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host === '::1' || host === '0.0.0.0' || host === 'metadata.google.internal') return true
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(host)
  if (!match) return false
  const octets = match.slice(1).map(Number)
  if (octets.some((octet) => octet > 255)) return true
  const first = octets[0]!
  const second = octets[1]!
  return first === 10 || first === 127 || first === 0 ||
    (first === 169 && second === 254) || (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 100 && second >= 64 && second <= 127)
}

function parseApprovedPrefix(value: string): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new HttpsError('failed-precondition', 'The Study assistant corpus generation is invalid.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || isPrivateOrInternalHost(url.hostname)) {
    throw new HttpsError('failed-precondition', 'The Study assistant corpus generation is invalid.')
  }
  return url
}

function urlMatchesPrefix(url: URL, prefix: URL): boolean {
  const basePath = prefix.pathname.endsWith('/') ? prefix.pathname : `${prefix.pathname}/`
  return url.origin === prefix.origin &&
    (url.pathname === prefix.pathname || url.pathname.startsWith(basePath))
}

function validateGeneration(candidate: StudentStudyAssistantCorpusGeneration): void {
  if (!boundedText(candidate.generation, 128) || candidate.chunks.length > 5000 || candidate.allowedUrlPrefixes.length > 100 ||
      candidate.allowedUrlPrefixes.some((prefix) => prefix.length > 2048)) {
    throw new HttpsError('failed-precondition', 'The Study assistant corpus generation is invalid.')
  }
  const allowedPrefixes = candidate.allowedUrlPrefixes.map(parseApprovedPrefix)
  const chunkIds = new Set<string>()
  for (const chunk of candidate.chunks) {
    let url: URL
    try { url = new URL(chunk.canonicalUrl) } catch { throw new HttpsError('failed-precondition', 'The Study assistant corpus generation is invalid.') }
    const modelBoundMetadata = [chunk.chunkId, chunk.sourceId, chunk.title, chunk.version, chunk.section ?? '']
    if (!boundedText(chunk.chunkId, 128) || !boundedText(chunk.sourceId, 128) || !boundedText(chunk.title, 200) ||
        !boundedText(chunk.version, 100) || (chunk.section !== null && !boundedText(chunk.section, 160)) ||
        modelBoundMetadata.some((value) => value && (hasCorpusInvisibleControl(value) || corpusInjectionPattern.test(value))) ||
        !boundedText(chunk.approvedBy, 128) || chunkIds.has(chunk.chunkId) || chunk.canonicalUrl.length > 2048 || url.protocol !== 'https:' ||
        url.username || url.password || url.search || url.hash || isPrivateOrInternalHost(url.hostname) ||
        !allowedPrefixes.some((prefix) => urlMatchesPrefix(url, prefix)) ||
        chunk.content.length < 1 || chunk.content.length > 4000 || chunk.keywords.length > 100 ||
        hasCorpusInvisibleControl(chunk.content) || corpusInjectionPattern.test(chunk.content) ||
        chunk.contentHash !== studentStudyAssistantContentHash(chunk.content) || !chunk.approvedBy ||
        !Number.isFinite(Date.parse(chunk.approvedAt)) || chunk.accessClassification !== 'ALL_ACTIVE_STUDENTS' ||
        (chunk.reviewState !== 'APPROVED' && chunk.reviewState !== 'QUARANTINED') ||
        chunk.keywords.some((keyword) => typeof keyword !== 'string' || keyword.length > 64 ||
          normalize(keyword).length !== 1 || normalize(keyword)[0] !== keyword)) {
      throw new HttpsError('failed-precondition', 'The Study assistant corpus generation is invalid.')
    }
    chunkIds.add(chunk.chunkId)
  }
}

/** In-memory registry boundary; a reviewed importer can supply immutable generations later. */
export class VersionedStudentStudyAssistantCorpus implements StudentStudyAssistantRetriever {
  private readonly generations = new Map<string, StudentStudyAssistantCorpusGeneration>()
  private readonly quarantinedSourceIds = new Set<string>()
  private activeGeneration: string

  constructor(generations: ReadonlyArray<StudentStudyAssistantCorpusGeneration>, activeGeneration: string) {
    for (const generation of generations) {
      validateGeneration(generation)
      if (this.generations.has(generation.generation)) throw new HttpsError('failed-precondition', 'Duplicate corpus generation.')
      const snapshot: StudentStudyAssistantCorpusGeneration = Object.freeze({
        generation: generation.generation,
        allowedUrlPrefixes: Object.freeze([...generation.allowedUrlPrefixes]),
        chunks: Object.freeze(generation.chunks.map((chunk) => Object.freeze({
          ...chunk,
          keywords: Object.freeze([...chunk.keywords]),
        }))),
      })
      this.generations.set(snapshot.generation, snapshot)
    }
    if (!this.generations.has(activeGeneration)) throw new HttpsError('failed-precondition', 'The active corpus generation is unavailable.')
    this.activeGeneration = activeGeneration
  }

  activate(generation: string): void {
    if (!this.generations.has(generation)) throw new HttpsError('failed-precondition', 'The requested corpus generation is unavailable.')
    this.activeGeneration = generation
  }

  rollback(generation: string): void { this.activate(generation) }

  quarantineSource(sourceId: string): void { this.quarantinedSourceIds.add(sourceId) }

  async retrieve(query: string, limit: number): Promise<StudentStudyAssistantRetrievalResult> {
    const selected = this.generations.get(this.activeGeneration)
    if (!selected) throw new HttpsError('failed-precondition', 'The active corpus generation is unavailable.')
    validateGeneration(selected)
    const tokens = new Set(normalize(query))
    const chunks = selected.chunks
      .filter((chunk) => chunk.reviewState === 'APPROVED' && !this.quarantinedSourceIds.has(chunk.sourceId))
      .map((chunk) => ({ chunk, score: chunk.keywords.reduce((total, keyword) => total + (tokens.has(keyword) ? 1 : 0), 0) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.chunk.chunkId.localeCompare(right.chunk.chunkId))
      .slice(0, Math.max(0, Math.min(limit, 8)))
      .map(({ chunk }) => chunk)
    return { chunks, corpusGeneration: selected.generation }
  }
}

export class EmptyStudentStudyAssistantRetriever implements StudentStudyAssistantRetriever {
  async retrieve(query: string, limit: number): Promise<StudentStudyAssistantRetrievalResult> {
    void query
    void limit
    return { chunks: [], corpusGeneration: 'disabled' }
  }
}

export class SyntheticStudentStudyAssistantRetriever extends VersionedStudentStudyAssistantCorpus {
  constructor() { super([syntheticGeneration], syntheticGeneration.generation) }
}

export class ApprovedNusStudentStudyAssistantRetriever extends VersionedStudentStudyAssistantCorpus {
  constructor() {
    super([nusComputingStudentStudyAssistantGeneration], nusComputingStudentStudyAssistantGeneration.generation)
  }
}

export const citationFromChunk = (chunk: StudentStudyAssistantChunk): StudentStudyAssistantCitation => ({
  sourceId: chunk.sourceId, title: chunk.title, canonicalUrl: chunk.canonicalUrl,
  version: chunk.version, section: chunk.section,
})

export function createStudentStudyAssistantRetriever(emulator: boolean): StudentStudyAssistantRetriever {
  void emulator
  return new ApprovedNusStudentStudyAssistantRetriever()
}
