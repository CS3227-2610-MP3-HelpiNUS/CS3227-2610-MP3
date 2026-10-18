import { cp, mkdir, mkdtemp, readFile, rm, unlink } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const repositoryRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

const requiredFiles = [
  '.agents/skills/verify-app/SKILL.md',
  '.agents/skills/verify-app/agents/openai.yaml',
  'app-verification/README.md',
  'app-verification/FEATURE_MAP.md',
  'app-verification/EVALUATION.md',
  'app-verification/playwright.config.ts',
  'app-verification/scripts/verify-app.mjs',
  'app-verification/tests/app-smoke.spec.ts',
  'scripts/dev-emulators.mjs',
  'src/frontend/src/routes/appRoutes.tsx',
]

async function readable(path) {
  try { await readFile(path); return true } catch { return false }
}

function commandResult(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:5173' } })
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() }
}

async function grade(root, { runCommands = true } = {}) {
  const failures = []
  for (const relative of requiredFiles) {
    if (!await readable(join(root, relative))) failures.push(`missing required file: ${relative}`)
  }
  if (failures.length) return failures

  let packageJson
  try { packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) } catch (error) { return [`invalid package.json: ${error.message}`] }
  const scripts = packageJson.scripts ?? {}
  if (scripts['verify:app'] !== 'node app-verification/scripts/verify-app.mjs') failures.push('verify:app does not point to the segregated launcher')
  if (scripts['verify:app:grade'] !== 'node app-verification/scripts/grade-workflow.mjs') failures.push('verify:app:grade does not point to the segregated grader')
  if (!scripts['verify:app:install']?.includes('playwright install chromium')) failures.push('verify:app:install does not install Chromium')

  const gitignore = await readFile(join(root, '.gitignore'), 'utf8')
  if (!gitignore.split(/\r?\n/).includes('.verify-app/')) failures.push('.verify-app/ is not ignored')

  const launcher = await readFile(join(root, 'app-verification/scripts/verify-app.mjs'), 'utf8')
  if (!launcher.includes("'dev:emulators'")) failures.push('launcher does not reuse the reviewed emulator command')
  if (!launcher.includes('HELPINUS_EMULATOR_DATA_DIR')) failures.push('launcher does not isolate verification emulator data')
  if (!launcher.includes('stopOwnedProcess')) failures.push('launcher has no owned-process cleanup path')
  if (!launcher.includes("delete environment[name]") || !launcher.includes("'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN'")) failures.push('launcher does not strip inherited cloud credentials')

  const emulatorLauncher = await readFile(join(root, 'scripts/dev-emulators.mjs'), 'utf8')
  if (!emulatorLauncher.includes("'--project', 'helpinus-dev'")) failures.push('emulator launcher is not pinned to helpinus-dev')
  if (!emulatorLauncher.includes('HELPINUS_FRONTEND_PORT')) failures.push('frontend verification port is not configurable')

  const routeSource = await readFile(join(root, 'src/frontend/src/routes/appRoutes.tsx'), 'utf8')
  const featureMap = await readFile(join(root, 'app-verification/FEATURE_MAP.md'), 'utf8')
  const routes = [...routeSource.matchAll(/path:\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((route) => route !== '*')
  for (const route of routes) {
    if (!featureMap.includes(`\`${route}\``)) failures.push(`feature map omits route: ${route}`)
  }

  if (runCommands) {
    const syntax = commandResult(process.execPath, ['--check', 'app-verification/scripts/verify-app.mjs'], root)
    if (!syntax.ok) failures.push(`launcher syntax check failed: ${syntax.output}`)
    const playwrightCli = join(root, 'node_modules', '@playwright', 'test', 'cli.js')
    const discovery = commandResult(process.execPath, [playwrightCli, 'test', '--config', 'app-verification/playwright.config.ts', '--list'], root)
    if (!discovery.ok) failures.push(`Playwright discovery failed: ${discovery.output}`)
    else if (!discovery.output.includes('Total: 2 tests')) failures.push(`Playwright discovery did not find the maintained two-test smoke set: ${discovery.output}`)
  }
  return failures
}

async function copyFixture(source, destination) {
  for (const relative of [...requiredFiles, 'package.json', '.gitignore']) {
    const target = join(destination, relative)
    await mkdir(dirname(target), { recursive: true })
    await cp(join(source, relative), target, { recursive: true })
  }
}

async function selfTest() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'verify-app-grader-'))
  const passing = join(temporaryRoot, 'passing')
  const failing = join(temporaryRoot, 'failing')
  try {
    await copyFixture(repositoryRoot, passing)
    await copyFixture(repositoryRoot, failing)
    const passingFailures = await grade(passing, { runCommands: false })
    await unlink(join(failing, 'app-verification/scripts/verify-app.mjs'))
    const failingFailures = await grade(failing, { runCommands: false })
    const acceptedPass = passingFailures.length === 0
    const rejectedFailure = failingFailures.some((message) => message.includes('missing required file: app-verification/scripts/verify-app.mjs'))
    console.info(`${acceptedPass ? 'PASS' : 'FAIL'}: isolated complete fixture ${acceptedPass ? 'accepted' : passingFailures.join('; ')}`)
    console.info(`${rejectedFailure ? 'PASS' : 'FAIL'}: isolated missing-launcher fixture ${rejectedFailure ? 'rejected' : 'was incorrectly accepted'}`)
    return acceptedPass && rejectedFailure
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

if (process.argv.includes('--self-test')) {
  process.exitCode = await selfTest() ? 0 : 1
} else {
  const failures = await grade(repositoryRoot)
  if (failures.length) {
    console.error(`FAIL: verify-app structural grade (${failures.length} finding${failures.length === 1 ? '' : 's'})`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
  } else {
    console.info('PASS: verify-app structural grade (required files, package wiring, local-safety invariants, route coverage, syntax, and Playwright discovery).')
  }
}
