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

async function signInWithSeededGoogleAccount(page: Page, email: string, role: 'Student' | 'Mentor') {
  const popupReady = page.waitForEvent('popup')
  await page.getByRole('button', { name: `Continue as ${role}` }).click()
  const popup = await popupReady
  await expect(popup.locator('#title .js-provider-id')).toHaveText('Google.com')
  await popup.getByText(email, { exact: true }).click()
}

test('Google authentication public journey reaches account recovery', async ({ page, diagnostics }, testInfo) => {
  await page.goto('/login')
  if (!page.url().endsWith('/login')) {
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
  }
  await expect(page.getByRole('heading', { name: 'Welcome to HelpiNUS' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue as Student' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue as Mentor' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue with Google as/ })).toHaveCount(0)
  await expect(page.getByLabel(/email|password/i)).toHaveCount(0)

  await page.getByRole('link', { name: 'Need help with your Google password?' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
  await expect(page.getByRole('heading', { name: 'Recover your Google account' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Google Account Recovery' })).toHaveAttribute('href', 'https://accounts.google.com/signin/recovery')
  await page.screenshot({ path: testInfo.outputPath('google-account-recovery.png'), fullPage: true })
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(diagnostics.consoleErrors, 'browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})

test('seeded Student signs in with Google through the local Firebase stack', async ({ page, diagnostics }, testInfo) => {
  await page.goto('/login')
  await signInWithSeededGoogleAccount(page, 'student@example.test', 'Student')

  await expect(page).toHaveURL(/\/student\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Welcome back, Demo' })).toBeVisible()
  await expect(page.getByText('Demo Student', { exact: true })).toBeVisible()
  await expect(page.locator('#main-content').getByRole('link', { name: 'Find a mentor', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('student-dashboard.png'), fullPage: true })
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(diagnostics.consoleErrors, 'browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})

test('seeded Mentor signs in with Google and keeps the trusted Mentor role', async ({ page, diagnostics }, testInfo) => {
  await page.goto('/login')
  await signInWithSeededGoogleAccount(page, 'mentor@example.test', 'Mentor')

  await expect(page).toHaveURL(/\/mentor\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Welcome to your Mentor space' })).toBeVisible()
  await expect(page.getByText('Demo Mentor', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('mentor-dashboard.png'), fullPage: true })
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(diagnostics.consoleErrors, 'browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})

test('new Google identity registers only as a Student', async ({ page, diagnostics }, testInfo) => {
  const email = `google-student-${Date.now()}@example.test`
  await page.goto('/register')
  await expect(page.getByRole('heading', { name: 'Create your Student account' })).toBeVisible()
  await expect(page.getByLabel(/role|status|password/i)).toHaveCount(0)

  const popupReady = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Create Student account with Google' }).click()
  const popup = await popupReady
  await expect(popup.locator('#title .js-provider-id')).toHaveText('Google.com')
  await popup.getByRole('button', { name: 'Add new account' }).click()
  await popup.locator('#email-input').fill(email)
  await popup.locator('#display-name-input').fill('Google Student')
  await popup.getByRole('button', { name: 'Sign in with Google.com' }).click()

  await expect(page).toHaveURL(/\/student\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Welcome back, Google' })).toBeVisible()
  await expect(page.getByText('Google Student', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('google-student-registration.png'), fullPage: true })
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(diagnostics.consoleErrors, 'browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})

test('one Google identity registers as Mentor and Student and switches roles', async ({ page, diagnostics }, testInfo) => {
  const email = `google-dual-${Date.now()}@example.test`
  await page.goto('/register?role=MENTOR')
  await expect(page.getByRole('heading', { name: 'Create your Mentor account' })).toBeVisible()
  const popupReady = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Create Mentor account with Google' }).click()
  const popup = await popupReady
  await expect(popup.locator('#title .js-provider-id')).toHaveText('Google.com')
  await popup.getByRole('button', { name: 'Add new account' }).click()
  await popup.locator('#email-input').fill(email)
  await popup.locator('#display-name-input').fill('Dual Role Account')
  await popup.getByRole('button', { name: 'Sign in with Google.com' }).click()

  await expect(page).toHaveURL(/\/mentor\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Welcome to your Mentor space' })).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(/\/mentor\/dashboard$/)
  await page.goto('/student/dashboard')
  await expect(page).toHaveURL(/\/mentor\/dashboard$/)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Switch to Student' })).toBeVisible()
  await page.getByRole('button', { name: 'Switch to Student' }).click()
  await expect(page).toHaveURL(/\/register\?role=STUDENT$/)
  await page.getByRole('button', { name: 'Create Student account with Google' }).click()
  await expect(page).toHaveURL(/\/student\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Welcome back, Dual' })).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('button', { name: 'Switch to Mentor' }).click()
  await expect(page).toHaveURL(/\/mentor\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Welcome to your Mentor space' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('dual-role-mentor-dashboard.png'), fullPage: true })
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(diagnostics.consoleErrors, 'browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})
