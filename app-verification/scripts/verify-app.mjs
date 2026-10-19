import { spawn, spawnSync } from 'node:child_process'
import { createConnection } from 'node:net'
import { appendFile, mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const runtimeDirectory = join(root, '.verify-app')
const statePath = join(runtimeDirectory, 'active.json')
const npmCli = process.env.npm_execpath
const playwrightCli = join(root, 'node_modules', '@playwright', 'test', 'cli.js')

function usage() {
  console.info(`Usage: npm run verify:app -- [launcher options] [Playwright options]

Launcher options:
  --port <number>                 Frontend port (default: VERIFY_APP_PORT or 5173)
  --startup-timeout-ms <number>   Readiness deadline (default: 120000)
  --help                          Show this help

All other options are forwarded to Playwright, for example --grep "sign-in" or --headed.`)
}

function takeOption(args, name, fallback) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`)
  args.splice(index, 2)
  return value
}

function integerOption(name, value, minimum, maximum) {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer.`)
  const parsed = Number(value)
  if (parsed < minimum || parsed > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}.`)
  return parsed
}

function localVerificationEnvironment() {
  const environment = { ...process.env }
  for (const name of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN']) delete environment[name]
  for (const name of Object.keys(environment)) if (name.startsWith('VITE_FIREBASE_PROD_')) delete environment[name]
  return {
    ...environment,
    GCLOUD_PROJECT: 'helpinus-dev',
    GOOGLE_CLOUD_PROJECT: 'helpinus-dev',
  }
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function portIsListening(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.setTimeout(750)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
    socket.once('error', () => resolve(false))
  })
}

async function claimState(state) {
  await mkdir(runtimeDirectory, { recursive: true })
  try {
    const handle = await open(statePath, 'wx')
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`)
    await handle.close()
    return
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }

  let existing = null
  try { existing = JSON.parse(await readFile(statePath, 'utf8')) } catch { /* Stale or partial metadata is replaced below. */ }
  if (processIsRunning(existing?.pid)) {
    throw new Error(`A managed verification stack is already running as PID ${existing.pid} at ${existing.baseURL ?? 'an unknown URL'}. Refusing to launch a duplicate.`)
  }
  await unlink(statePath)
  return claimState(state)
}

async function releaseState(ownerToken) {
  try {
    const current = JSON.parse(await readFile(statePath, 'utf8'))
    if (current.ownerToken === ownerToken) await unlink(statePath)
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn(`Could not remove verification state: ${error.message}`)
  }
}

async function tail(path, maximumLines = 60) {
  try {
    const lines = (await readFile(path, 'utf8')).trimEnd().split('\n')
    return lines.slice(-maximumLines).join('\n')
  } catch {
    return '(startup log unavailable)'
  }
}

async function waitForReady(url, child, logPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastFailure = 'no response received'
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`The application exited before becoming ready (code ${child.exitCode}).\n${await tail(logPath)}`)
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'manual' })
      if (response.status >= 200 && response.status < 500) return
      lastFailure = `HTTP ${response.status}`
    } catch (error) {
      lastFailure = error.message
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Application readiness timed out after ${timeoutMs} ms (${lastFailure}).\n${await tail(logPath)}`)
}

async function stopOwnedProcess(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T'], { stdio: 'ignore' })
  } else {
    try { process.kill(-child.pid, 'SIGTERM') } catch (error) { if (error?.code !== 'ESRCH') throw error }
  }
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 8000)),
  ])
  if (!exited && process.platform !== 'win32') {
    try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error?.code !== 'ESRCH') throw error }
  }
}

const forwarded = process.argv.slice(2)
if (forwarded.includes('--help')) { usage(); process.exit(0) }

let app = null
let ownerToken = null
let stopping = false
let exitCode = 1

async function cleanup() {
  if (stopping) return
  stopping = true
  await stopOwnedProcess(app)
  if (ownerToken) await releaseState(ownerToken)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { exitCode = signal === 'SIGINT' ? 130 : 143; void cleanup().finally(() => process.exit(exitCode)) })
}

try {
  if (!npmCli) throw new Error('npm_execpath is unavailable. Start this workflow with npm run verify:app.')
  const port = integerOption('--port', takeOption(forwarded, '--port', process.env.VERIFY_APP_PORT ?? '5173'), 1024, 65535)
  const startupTimeout = integerOption('--startup-timeout-ms', takeOption(forwarded, '--startup-timeout-ms', process.env.VERIFY_APP_STARTUP_TIMEOUT_MS ?? '120000'), 1000, 600000)
  const firebase = JSON.parse(await readFile(join(root, 'firebase.json'), 'utf8'))
  const requiredPorts = [port, ...['auth', 'firestore', 'functions'].map((name) => firebase.emulators?.[name]?.port).filter(Number.isInteger)]
  const occupied = []
  for (const requiredPort of new Set(requiredPorts)) if (await portIsListening(requiredPort)) occupied.push(requiredPort)
  if (occupied.length) throw new Error(`Required local port${occupied.length === 1 ? '' : 's'} ${occupied.join(', ')} already ${occupied.length === 1 ? 'has' : 'have'} a listener. Stop it or choose another frontend port with --port; the workflow will not reuse or stop an unmanaged process.`)

  const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const runDirectory = join(runtimeDirectory, 'runs', runId)
  const artifactDirectory = join(runDirectory, 'playwright')
  const logPath = join(runDirectory, 'application.log')
  const baseURL = `http://127.0.0.1:${port}`
  ownerToken = randomUUID()
  await mkdir(artifactDirectory, { recursive: true })
  await writeFile(logPath, '')

  await claimState({ ownerToken, pid: process.pid, startedAt: new Date().toISOString(), baseURL, logPath })
  app = spawn(process.execPath, [npmCli, 'run', 'dev:emulators'], {
    cwd: root,
    detached: process.platform !== 'win32',
    env: {
      ...localVerificationEnvironment(),
      HELPINUS_FRONTEND_PORT: String(port),
      HELPINUS_EMULATOR_DATA_DIR: join('.verify-app', 'emulator-data'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await writeFile(statePath, `${JSON.stringify({ ownerToken, pid: process.pid, appPid: app.pid, startedAt: new Date().toISOString(), baseURL, logPath }, null, 2)}\n`)
  for (const stream of [app.stdout, app.stderr]) stream.on('data', (chunk) => { process.stdout.write(chunk); void appendFile(logPath, chunk) })

  console.info(`Waiting for ${baseURL}/login (startup log: ${logPath})`)
  await waitForReady(`${baseURL}/login`, app, logPath, startupTimeout)
  console.info(`Application ready. Running Playwright; artifacts: ${artifactDirectory}`)

  const test = spawn(process.execPath, [playwrightCli, 'test', '--config', join('app-verification', 'playwright.config.ts'), ...forwarded], {
    cwd: root,
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseURL,
      PLAYWRIGHT_ARTIFACT_DIR: artifactDirectory,
      VERIFY_APP_MANAGED: 'true',
    },
    stdio: 'inherit',
  })
  exitCode = await new Promise((resolve, reject) => {
    test.once('error', reject)
    test.once('exit', (code, signal) => resolve(code ?? (signal ? 130 : 1)))
  })
  console.info(`${exitCode === 0 ? 'PASS' : 'FAIL'}: Playwright exited with code ${exitCode}. Evidence: ${runDirectory}`)
} catch (error) {
  console.error(`FAIL: ${error.message}`)
  exitCode = 1
} finally {
  await cleanup()
}

process.exitCode = exitCode
