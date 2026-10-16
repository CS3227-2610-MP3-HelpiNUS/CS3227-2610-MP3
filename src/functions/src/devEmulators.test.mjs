import { expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [])
vi.mock('node:child_process', () => ({
  spawn(command, args, options) {
    calls.push({ command, args, options })
    return { once(event, callback) { if (event === 'exit') queueMicrotask(() => callback(0, null)) } }
  },
}))

it('starts the frontend against the seeded Firebase emulators', async () => {
  const originalArgv = process.argv
  const originalExitCode = process.exitCode
  try {
    process.argv = ['node', 'scripts/dev-emulators.mjs', '--inside-emulators']
    await import('../../../scripts/dev-emulators.mjs')
    const vite = calls.find(({ args }) => args.some((arg) => arg.endsWith('vite.js')))
    expect(vite).toBeDefined()
    expect(vite.options.env).toMatchObject({
      VITE_FIREBASE_ENV: 'development',
      VITE_USE_FIREBASE_EMULATORS: 'true',
      VITE_FIREBASE_DEV_PROJECT_ID: 'helpinus-dev',
    })
    expect(vite.options.env.VITE_FIREBASE_DEV_API_KEY).toBeTruthy()
    expect(vite.options.env.VITE_FIREBASE_DEV_AUTH_DOMAIN).toBeTruthy()
    expect(vite.options.env.VITE_FIREBASE_DEV_APP_ID).toBeTruthy()
  } finally {
    process.argv = originalArgv
    process.exitCode = originalExitCode
  }
})
