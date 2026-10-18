import { defineConfig, devices } from '@playwright/test'
import { join } from 'node:path'

const repositoryRoot = process.cwd()
const artifactDirectory = process.env.PLAYWRIGHT_ARTIFACT_DIR ?? join(repositoryRoot, '.verify-app', 'playwright')

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: join(artifactDirectory, 'test-results'),
  reporter: [
    ['line'],
    ['html', { outputFolder: join(artifactDirectory, 'html-report'), open: 'never' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
