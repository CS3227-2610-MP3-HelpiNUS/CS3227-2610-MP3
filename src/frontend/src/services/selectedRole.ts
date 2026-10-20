import type { UserRole } from '@helpinus/shared'

const key = 'helpinus:selected-role'
let selectedRole: UserRole | null = null

export function getSelectedRole(): UserRole | null {
  try {
    const stored = sessionStorage.getItem(key)
    selectedRole = stored === 'STUDENT' || stored === 'MENTOR' ? stored : null
  } catch { /* Private browsing may disable storage. */ }
  return selectedRole
}

export function setSelectedRole(role: UserRole | null): void {
  selectedRole = role
  try {
    if (role) sessionStorage.setItem(key, role)
    else sessionStorage.removeItem(key)
  } catch { /* The in-memory role still protects this tab. */ }
}
