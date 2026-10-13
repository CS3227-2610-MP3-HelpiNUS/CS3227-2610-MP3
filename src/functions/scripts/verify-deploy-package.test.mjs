import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const functionsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const deployDir = resolve(functionsDir, 'deploy')
const verifier = resolve(functionsDir, 'scripts/verify-deploy-package.mjs')
const bundle = resolve(functionsDir, 'lib/index.js')
const tempRoot = mkdtempSync(resolve(tmpdir(), 'helpinus-deploy-package-'))

function runVerifier(directory) {
  return spawnSync(process.execPath, [verifier, '--deployment-dir', directory, '--bundle', bundle], {
    encoding: 'utf8',
  })
}

function expectPass(directory, description) {
  const result = runVerifier(directory)
  if (result.status !== 0) throw new Error(`${description} should pass:\n${result.stdout}\n${result.stderr}`)
}

function expectFail(directory, description) {
  const result = runVerifier(directory)
  if (result.status === 0) throw new Error(`${description} unexpectedly passed.`)
}

function isolatedCopy(name) {
  const directory = resolve(tempRoot, name)
  cpSync(deployDir, directory, { recursive: true })
  return directory
}

try {
  expectPass(deployDir, 'the generated deployment package')

  const staleBundleDir = isolatedCopy('stale-bundle')
  writeFileSync(resolve(staleBundleDir, 'index.js'), `${readFileSync(resolve(staleBundleDir, 'index.js'), 'utf8')}\n// stale\n`)
  expectFail(staleBundleDir, 'a stale bundle')

  const outOfBoundDir = isolatedCopy('out-of-bound-dependency')
  const manifestPath = resolve(outOfBoundDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.dependencies['@helpinus/shared'] = 'file:../shared'
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  expectFail(outOfBoundDir, 'a file dependency outside the upload boundary')

  const staleLockDir = isolatedCopy('stale-lock')
  const lockPath = resolve(staleLockDir, 'package-lock.json')
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  lock.packages[''].dependencies['firebase-admin'] = '^0.0.0'
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  expectFail(staleLockDir, 'a stale deployment lockfile')

  console.log('Deployment package verification cases passed (valid, stale bundle, out-of-bound dependency, stale lockfile).')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
