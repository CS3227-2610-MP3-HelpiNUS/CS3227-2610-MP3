import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const functionsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : resolve(args[index + 1])
}
const deployDir = option('--deployment-dir', resolve(functionsDir, 'deploy'))
const bundlePath = option('--bundle', resolve(functionsDir, 'lib/index.js'))
const fail = (message) => {
  console.error(`Deployment package verification failed: ${message}`)
  process.exitCode = 1
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const manifest = readJson(resolve(deployDir, 'package.json'))
const lock = readJson(resolve(deployDir, 'package-lock.json'))
const functionsManifest = readJson(resolve(functionsDir, 'package.json'))
const firebaseConfig = readJson(resolve(functionsDir, '../..', 'firebase.json'))
const expectedSource = 'src/functions/deploy'
const bundle = readFileSync(bundlePath, 'utf8')
const deployedBundle = readFileSync(resolve(deployDir, 'index.js'), 'utf8')

if (firebaseConfig.functions?.[0]?.source !== expectedSource) {
  fail(`firebase.json must use ${expectedSource} as its Functions source.`)
}
if (manifest.name !== '@helpinus/functions-deploy' || manifest.main !== 'index.js' || manifest.engines?.node !== '22') {
  fail('the deployment manifest must name the generated Node 22 entry point.')
}
if (Object.keys(manifest.dependencies ?? {}).some((name) => name.startsWith('file:'))) {
  fail('the deployment manifest cannot contain file dependencies.')
}
const expectedDependencies = {
  'firebase-admin': functionsManifest.dependencies['firebase-admin'],
  'firebase-functions': functionsManifest.dependencies['firebase-functions'],
}
if (JSON.stringify(manifest.dependencies) !== JSON.stringify(expectedDependencies)) {
  fail('deployment runtime dependencies must match the Functions workspace runtime dependencies.')
}
if (lock.lockfileVersion !== 3 || lock.packages?.['']?.name !== manifest.name) {
  fail('package-lock.json must be a v3 lockfile for the deployment manifest.')
}
if (JSON.stringify(lock.packages?.['']?.dependencies) !== JSON.stringify(manifest.dependencies)) {
  fail('package-lock.json root dependencies are stale or incomplete.')
}
for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  if (entry.link || entry.resolved?.startsWith('file:') || path.includes('../')) {
    fail(`package-lock.json contains an out-of-bound dependency at ${path}.`)
  }
}
for (const name of Object.keys(manifest.dependencies ?? {})) {
  if (!lock.packages?.[`node_modules/${name}`]) {
    fail(`package-lock.json does not contain runtime dependency ${name}.`)
  }
}
if (bundle !== deployedBundle) fail('deploy/index.js is stale; run the Functions build to refresh it.')

const runtimeNames = new Set(Object.keys(manifest.dependencies ?? {}))
const imports = [...bundle.matchAll(/(?:from\s*|import\s*\(|require\s*\()(['"])([^'"]+)\1/g)].map((match) => match[2])
for (const specifier of imports) {
  if (specifier.startsWith('node:') || specifier.startsWith('.') || specifier.startsWith('/')) continue
  const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
  if (!runtimeNames.has(name)) fail(`bundle imports ${specifier}, which is missing from deployment runtime dependencies.`)
}

if (process.exitCode !== 1) console.log('Deployment package verification passed.')
