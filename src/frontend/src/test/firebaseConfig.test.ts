import { describe, expect, it } from 'vitest'
import { isEmulatorConnectionAllowed } from '../services/firebaseConfig'

describe('Firebase emulator connection guard', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('allows explicit emulator use on %s during a development build', (hostname) => {
    expect(isEmulatorConnectionAllowed({ isDevelopment: true, isDevBuild: true, enabled: true, hostname })).toBe(true)
  })

  it.each([
    { isDevelopment: false, isDevBuild: true, enabled: true, hostname: 'localhost' },
    { isDevelopment: true, isDevBuild: false, enabled: true, hostname: 'localhost' },
    { isDevelopment: true, isDevBuild: true, enabled: false, hostname: 'localhost' },
    { isDevelopment: true, isDevBuild: true, enabled: true, hostname: 'helpinus.example.com' },
  ])('denies emulator use unless every local development condition holds', (options) => {
    expect(isEmulatorConnectionAllowed(options)).toBe(false)
  })
})
