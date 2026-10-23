export function normalizeFirestoreTimestamp(value: unknown): unknown {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? value : value.toISOString()
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const toDate = (value as { toDate?: unknown }).toDate
    if (typeof toDate === 'function') {
      const date = toDate.call(value)
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString()
    }
  }
  return value
}

export function isStaleAuthIdentityError(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code
  return code === 'auth/user-not-found'
    || code === 'auth/user-disabled'
    || code === 'auth/invalid-user-token'
    || code === 'auth/user-token-expired'
}
