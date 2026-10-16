import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const nodeDirectory = dirname(process.execPath)
const npmCli = join(nodeDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js')
const firebaseCli = join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js')
const viteCli = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const seedScript = join(root, 'src', 'functions', 'scripts', 'seed-emulator.ts')
const frontend = join(root, 'src', 'frontend')
const emulatorData = join(root, '.emulator-data')
const env = { ...process.env, PATH: `${nodeDirectory}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}` }

function start(args, options = {}) {
  return spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env, ...options })
}

function completed(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 130 : 1)))
  })
}

async function stopLingeringFirestore() {
  if (process.platform !== 'win32') return
  // Firebase CLI can report a clean shutdown while its Windows Java child still owns 8080.
  // Inspect the listener and its command line so another app's process is never stopped.
  const command = [
    '$connections = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue',
    'foreach ($connection in $connections) {',
    '  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue',
    '  if ($process -and $process.Name -eq "java.exe" -and $process.CommandLine -and',
    '      $process.CommandLine.Contains("cloud-firestore-emulator") -and',
    '      $process.CommandLine.Contains($env:HELPINUS_FIRESTORE_RULES)) {',
    '    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop',
    '    Write-Output "Stopped lingering Firestore emulator on port 8080."',
    '  }',
    '}',
    'exit 0',
  ].join('\n')
  const cleanup = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    cwd: root,
    stdio: 'inherit',
    env: { ...env, HELPINUS_FIRESTORE_RULES: join(root, 'firestore.rules') },
  })
  if (await completed(cleanup) !== 0) console.warn('Could not check for a lingering Firestore emulator on port 8080.')
}

if (process.argv.includes('--inside-emulators')) {
  const seed = start(['--import', 'tsx', seedScript], {
    env: {
      ...env,
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FUNCTIONS_EMULATOR: 'true',
      GCLOUD_PROJECT: 'helpinus-dev',
    },
  })
  const seedResult = await completed(seed)
  if (seedResult !== 0) process.exit(seedResult)

  const vite = start([viteCli, '--host', '127.0.0.1'], {
    cwd: frontend,
    env: {
      ...env,
      VITE_FIREBASE_ENV: 'development',
      VITE_USE_FIREBASE_EMULATORS: 'true',
      VITE_FIREBASE_DEV_API_KEY: 'fake-api-key',
      VITE_FIREBASE_DEV_AUTH_DOMAIN: 'helpinus-dev.firebaseapp.com',
      VITE_FIREBASE_DEV_PROJECT_ID: 'helpinus-dev',
      VITE_FIREBASE_DEV_APP_ID: 'demo-helpinus-dev',
    },
  })
  process.exitCode = await completed(vite)
} else {
  const buildResult = await completed(start([npmCli, 'run', 'build', '--workspace', 'src/functions']))
  if (buildResult !== 0) process.exit(buildResult)

  console.info('To stop and export emulator data, press q then Enter in the Vite terminal.')
  const emulators = start([
    firebaseCli, 'emulators:exec', '--only', 'auth,firestore,functions', '--project', 'helpinus-dev',
    ...(existsSync(join(emulatorData, 'firebase-export-metadata.json')) ? ['--import', emulatorData] : []),
    '--export-on-exit', emulatorData,
    'node scripts/dev-emulators.mjs --inside-emulators',
  ])
  const result = await completed(emulators)
  if (result === 0) await stopLingeringFirestore()
  process.exitCode = result
}
