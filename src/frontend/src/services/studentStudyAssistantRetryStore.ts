import { studentStudyAssistInputSchema, type StudentStudyAssistInput } from '@helpinus/shared'

export type StudentStudyAssistantRetry = {
  version: 1
  uid: string
  request: StudentStudyAssistInput
}

const ownerKey = 'student-study-assistant-send-owner'
const retryKey = 'student-study-assistant-send'

export function clearStudentStudyAssistantRetry() {
  try {
    sessionStorage.removeItem(ownerKey)
    sessionStorage.removeItem(retryKey)
  } catch { /* Best effort when private browser storage is unavailable. */ }
}

export function saveStudentStudyAssistantRetry(item: StudentStudyAssistantRetry) {
  const currentOwner = sessionStorage.getItem(ownerKey)
  if (currentOwner && currentOwner !== item.uid) {
    clearStudentStudyAssistantRetry()
  }
  const existing = loadStudentStudyAssistantRetry(item.uid)
  if (existing && existing.request.requestId === item.request.requestId
      && JSON.stringify(existing.request) !== JSON.stringify(item.request)) {
    throw new Error('This request ID is already associated with different text.')
  }
  const serialized = JSON.stringify(item)
  sessionStorage.setItem(ownerKey, item.uid)
  sessionStorage.setItem(retryKey, serialized)
  if (sessionStorage.getItem(retryKey) !== serialized) {
    throw new Error('Message recovery could not be saved.')
  }
}

export function loadStudentStudyAssistantRetry(uid: string): StudentStudyAssistantRetry | null {
  try {
    if (sessionStorage.getItem(ownerKey) !== uid) return null
    const raw = sessionStorage.getItem(retryKey)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<StudentStudyAssistantRetry>
    const parsed = studentStudyAssistInputSchema.safeParse(value.request)
    if (value.version !== 1 || value.uid !== uid || !parsed.success) return null
    return { version: 1, uid, request: parsed.data }
  } catch {
    return null
  }
}

