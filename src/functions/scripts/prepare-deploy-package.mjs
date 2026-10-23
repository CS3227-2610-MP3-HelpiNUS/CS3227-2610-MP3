import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const functionsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceManifest = JSON.parse(readFileSync(resolve(functionsDir, 'package.json'), 'utf8'))
const deployDir = resolve(functionsDir, 'deploy')
const deployManifest = {
  name: '@helpinus/functions-deploy',
  private: true,
  type: 'module',
  main: 'index.js',
  engines: { node: '22' },
  dependencies: {
    'firebase-admin': sourceManifest.dependencies['firebase-admin'],
    'firebase-functions': sourceManifest.dependencies['firebase-functions'],
  },
}

mkdirSync(deployDir, { recursive: true })
writeFileSync(resolve(deployDir, 'package.json'), `${JSON.stringify(deployManifest, null, 2)}\n`)
copyFileSync(resolve(functionsDir, 'lib/index.js'), resolve(deployDir, 'index.js'))
