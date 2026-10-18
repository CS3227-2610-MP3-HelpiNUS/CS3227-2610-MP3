import { messageBodySchema, messageIdSchema } from '@helpinus/shared'

export type ChatRetry = { version: 1; uid: string; requestId: string; messageId: string; normalizedBody: string; localSequence: number; state: 'sending' | 'uncertain' | 'failed' }
const ownerKey = 'f02-send-owner'
const prefix = 'f02-send:'
const keyFor = (item: ChatRetry) => `${prefix}${encodeURIComponent(item.uid)}:${item.messageId}`

export function clearChatRetries() {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index)
      if (key?.startsWith(prefix) || key === ownerKey) sessionStorage.removeItem(key)
    }
  } catch { /* Best effort when the browser has disabled storage. */ }
}

export function clearChatRetriesForSession(previousUid: string | null, nextUid: string | null, active: boolean) {
  let owner: string | null = null
  try { owner = sessionStorage.getItem(ownerKey) } catch { /* Treat unavailable storage as empty. */ }
  if ((previousUid && (!active || previousUid !== nextUid)) || (owner && (!active || owner !== nextUid))) clearChatRetries()
}

export function saveChatRetry(item: ChatRetry) {
  const key = keyFor(item)
  const currentOwner = sessionStorage.getItem(ownerKey)
  if (currentOwner && currentOwner !== item.uid) throw new Error('Chat recovery belongs to another account.')
  const existing = sessionStorage.getItem(key)
  if (existing) {
    const prior = JSON.parse(existing) as Partial<ChatRetry>
    if (prior.requestId !== item.requestId || prior.normalizedBody !== item.normalizedBody || prior.uid !== item.uid) throw new Error('Message ID is already used for different text.')
  }
  sessionStorage.setItem(ownerKey, item.uid)
  const serialized = JSON.stringify(item)
  sessionStorage.setItem(key, serialized)
  try {
    if (sessionStorage.getItem(key) !== serialized) throw new Error('Message recovery could not be saved.')
  } catch (error) {
    try {
      if (existing === null) sessionStorage.removeItem(key)
      else sessionStorage.setItem(key, existing)
    } catch { /* The caller still blocks dispatch when storage cannot be verified. */ }
    throw error
  }
}

export function removeChatRetry(item: ChatRetry) {
  sessionStorage.removeItem(keyFor(item))
}

export function loadChatRetries(uid: string, requestId: string): ChatRetry[] {
  const items: ChatRetry[] = []
  if (sessionStorage.getItem(ownerKey) !== uid) return items
  for (let index = 0; index < sessionStorage.length; index++) {
    const key = sessionStorage.key(index)
    if (!key?.startsWith(`${prefix}${encodeURIComponent(uid)}:`)) continue
    try {
      const value = JSON.parse(sessionStorage.getItem(key) ?? '') as ChatRetry
      const parsedBody = messageBodySchema.safeParse(value.normalizedBody)
      if (value.version !== 1 || value.uid !== uid || value.requestId !== requestId ||
          !messageIdSchema.safeParse(value.messageId).success ||
          !parsedBody.success || parsedBody.data !== value.normalizedBody ||
          !Number.isSafeInteger(value.localSequence) || value.localSequence < 0 ||
          !['sending', 'uncertain', 'failed'].includes(value.state) || key !== keyFor(value)) continue
      items.push(value)
    } catch { /* Corrupt private records are not sent. */ }
  }
  return items.sort((a, b) => a.localSequence - b.localSequence)
}
