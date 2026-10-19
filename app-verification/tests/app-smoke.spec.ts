import { expect, test as base, type Page, type TestInfo } from '@playwright/test'

type Diagnostics = {
  consoleErrors: string[]
  pageErrors: string[]
  failedRequests: string[]
}

function collectDiagnostics(page: Page): Diagnostics {
  const diagnostics: Diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [] }
  page.on('console', (message) => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message))
  page.on('requestfailed', (request) => diagnostics.failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'unknown failure'}`))
  return diagnostics
}

async function attachDiagnostics(testInfo: TestInfo, diagnostics: Diagnostics) {
  await testInfo.attach('browser-diagnostics', {
    body: Buffer.from(`${JSON.stringify(diagnostics, null, 2)}\n`),
    contentType: 'application/json',
  })
}

function unexpectedFailedRequests(diagnostics: Diagnostics) {
  return diagnostics.failedRequests.filter((failure) => !(
    failure.includes('/google.firestore.v1.Firestore/Listen/channel?') && failure.endsWith('net::ERR_ABORTED')
  ))
}

const test = base.extend<{ diagnostics: Diagnostics }>({
  diagnostics: async ({ page }, use, testInfo) => {
    const diagnostics = collectDiagnostics(page)
    try { await use(diagnostics) } finally { await attachDiagnostics(testInfo, diagnostics) }
  },
})

test('public sign-in journey reaches password recovery', async ({ page, diagnostics }, testInfo) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome to HelpiNUS' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeEditable()
  await expect(page.getByLabel('Password')).toBeEditable()

  await page.getByRole('link', { name: 'Forgot your password?' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('password-recovery.png'), fullPage: true })
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(diagnostics.consoleErrors, 'browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})

test('seeded Student signs in through the local Firebase stack', async ({ page, diagnostics }, testInfo) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('student@example.test')
  await page.getByLabel('Password').fill('Student-demo-123!')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/student\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Welcome back, Demo' })).toBeVisible()
  await expect(page.getByText('Demo Student', { exact: true })).toBeVisible()
  await expect(page.locator('#main-content').getByRole('link', { name: 'Find a mentor', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('student-dashboard.png'), fullPage: true })
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(diagnostics.consoleErrors, 'browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})
