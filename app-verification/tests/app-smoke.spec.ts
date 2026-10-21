import { expect, test as base, type Page, type TestInfo } from '@playwright/test'

type Diagnostics = {
  consoleErrors: Array<{ message: string; url: string }>
  pageErrors: string[]
  failedRequests: string[]
}

function collectDiagnostics(page: Page): Diagnostics {
  const diagnostics: Diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [] }
  page.on('console', (message) => { if (message.type() === 'error') diagnostics.consoleErrors.push({ message: message.text(), url: message.location().url }) })
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

function unexpectedConsoleErrors(diagnostics: Diagnostics) {
  return diagnostics.consoleErrors.filter((error) => {
    if (error.message !== 'Failed to load resource: the server responded with a status of 400 (Bad Request)') return true
    try {
      const url = new URL(error.url)
      // The local Firestore transport may already have closed this Listen SID.
      // Preserve the diagnostic; exempt only that emulator termination response.
      return !(url.origin === 'http://127.0.0.1:8080' && url.pathname === '/google.firestore.v1.Firestore/Listen/channel' && url.searchParams.get('TYPE') === 'terminate')
    } catch { return true }
  })
}

const test = base.extend<{ diagnostics: Diagnostics }>({
  diagnostics: async ({ page }, use, testInfo) => {
    const diagnostics = collectDiagnostics(page)
    try { await use(diagnostics) } finally { await attachDiagnostics(testInfo, diagnostics) }
  },
})

async function signInWithSeededGoogleAccount(page: Page, email: string, role: 'Student' | 'Mentor') {
  if (await page.getByRole('link', { name: 'Yes, sign in' }).isVisible()) await page.getByRole('link', { name: 'Yes, sign in' }).click()
  const popupReady = page.waitForEvent('popup')
  await page.getByRole('button', { name: `Continue as ${role}` }).click()
  const popup = await popupReady
  await expect(popup.locator('#title .js-provider-id')).toHaveText('Google.com')
  await popup.getByText(email, { exact: true }).click()
}

async function callAsCurrentIdentity(page: Page, name: string) {
  const token = await page.evaluate(async () => {
    const moduleUrl = new URL('/src/services/firebase.ts', location.origin).href
    const { firebase } = await import(moduleUrl)
    return firebase.auth.currentUser.getIdToken()
  })
  return page.request.post(`http://127.0.0.1:5001/helpinus-dev/asia-southeast1/${name}`, {
    headers: { Authorization: `Bearer ${token}` }, data: { data: { displayName: 'Cross-role attempt' } },
  })
}

test('Google authentication public journey reaches account recovery', async ({ page, diagnostics }, testInfo) => {
  await page.goto('/login')
  if (!page.url().endsWith('/login')) {
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
  }
  await expect(page.getByRole('heading', { name: 'Welcome to HelpiNUS' })).toBeVisible()
  await expect(page.getByText('Do you already have a HelpiNUS account?')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue as Student' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('account-choice-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('account-choice-mobile.png'), fullPage: true })
  await page.getByRole('link', { name: 'Yes, sign in' }).click()
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
  expect(unexpectedConsoleErrors(diagnostics), 'unexpected browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})

test('seeded Student signs in with Google through the local Firebase stack', async ({ page, diagnostics }, testInfo) => {
  await page.goto('/login')
  await signInWithSeededGoogleAccount(page, 'student@example.test', 'Student')

  await expect(page).toHaveURL(/\/student\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Welcome back, Demo' })).toBeVisible()
  await expect(page.getByText('Demo Student', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(/\/student\/dashboard$/)
  await expect(page.getByRole('button', { name: /Switch to/ })).toHaveCount(0)
  await expect(page.locator('#main-content').getByRole('link', { name: 'Find a mentor', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('student-dashboard.png'), fullPage: true })
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/student/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(unexpectedConsoleErrors(diagnostics), 'unexpected browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})

test('seeded Mentor signs in with Google and keeps the trusted Mentor role', async ({ page, diagnostics }, testInfo) => {
  await page.goto('/login')
  await signInWithSeededGoogleAccount(page, 'mentor@example.test', 'Mentor')

  await expect(page).toHaveURL(/\/mentor\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Welcome to your Mentor space' })).toBeVisible()
  await expect(page.getByText('Demo Mentor', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Switch to/ })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: /Switch to/ })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('mentor-dashboard.png'), fullPage: true })
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(unexpectedConsoleErrors(diagnostics), 'unexpected browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})

test('new Google identity registers only as a Student', async ({ page, diagnostics }, testInfo) => {
  const email = `google-student-${Date.now()}@example.test`
  await page.goto('/login')
  await page.getByRole('link', { name: 'No, create an account' }).click()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled()
  await page.getByLabel('Account type').selectOption('STUDENT')
  await expect(page.getByRole('heading', { name: 'Create your Student account' })).toBeVisible()
  await expect(page.getByLabel('Account type')).toHaveValue('STUDENT')
  await expect(page.getByLabel(/status|password/i)).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('registration-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('registration-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 800 })

  const popupReady = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
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
  const crossRole = await callAsCurrentIdentity(page, 'initializeMentorProfile')
  expect(crossRole.status()).toBe(409)
  expect(await crossRole.json()).toMatchObject({ error: { status: 'ALREADY_EXISTS' } })
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(unexpectedConsoleErrors(diagnostics), 'unexpected browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})

test('Google authentication keeps one role and rejects cross-role registration', async ({ page, diagnostics }, testInfo) => {
  const email = `google-dual-${Date.now()}@example.test`
  await page.goto('/register?role=MENTOR')
  await expect(page.getByRole('heading', { name: 'Create your Mentor account' })).toBeVisible()
  const popupReady = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
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
  await expect(page.getByRole('button', { name: /Switch to/ })).toHaveCount(0)
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.getByRole('button', { name: /Switch to/ })).toHaveCount(0)
  const forbidden = await callAsCurrentIdentity(page, 'initializeStudentProfile')
  expect(forbidden.status()).toBe(409)
  expect(await forbidden.json()).toMatchObject({ error: { status: 'ALREADY_EXISTS' } })
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/login?existing=1')
  await signInWithSeededGoogleAccount(page, email, 'Student')
  await expect(page.getByRole('alert')).toContainText('registered with another role')
  await expect(page.getByRole('link', { name: 'Create Student account', exact: true })).toHaveCount(0)
  await page.goto('/register?role=STUDENT')
  const rejectedPopup = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  const rejected = await rejectedPopup
  await rejected.getByText(email, { exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('registered with another role')
  await page.screenshot({ path: testInfo.outputPath('cross-role-registration-rejected.png'), fullPage: true })
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(unexpectedConsoleErrors(diagnostics), 'unexpected browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})

test('Google authentication recovers partial registration after cancellation and refresh', async ({ page, diagnostics }, testInfo) => {
  const email = `google-recovery-${Date.now()}@example.test`
  await page.goto('/register?role=STUDENT')
  const cancelledPopup = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  const cancelled = await cancelledPopup
  await expect(cancelled.locator('#title .js-provider-id')).toHaveText('Google.com')
  await cancelled.close()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0)

  const popupReady = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  const popup = await popupReady
  await popup.getByRole('button', { name: 'Add new account' }).click()
  await popup.locator('#email-input').fill(email)
  await popup.locator('#display-name-input').fill('')
  await popup.getByRole('button', { name: 'Sign in with Google.com' }).click()
  await expect(page.getByText(email, { exact: true })).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()

  const recoveryPopup = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await (await recoveryPopup).getByText(email, { exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Recovered Student')
  await page.getByRole('button', { name: 'Finish Student profile setup' }).click()
  await expect(page).toHaveURL(/\/student\/dashboard$/)
  await expect(page.getByText('Recovered Student', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('google-profile-recovered.png'), fullPage: true })
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(unexpectedConsoleErrors(diagnostics), 'unexpected browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})

test('Google authentication guides an unregistered returning user to explicit registration', async ({ page, diagnostics }, testInfo) => {
  const email = `google-unregistered-${Date.now()}@example.test`
  await page.goto('/login?existing=1')
  const popupReady = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Continue as Student' }).click()
  const popup = await popupReady
  await popup.getByRole('button', { name: 'Add new account' }).click()
  await popup.locator('#email-input').fill(email)
  await popup.locator('#display-name-input').fill('New Student')
  await popup.getByRole('button', { name: 'Sign in with Google.com' }).click()
  await expect(page.getByRole('alert')).toContainText('No Student profile is linked')
  await page.getByRole('link', { name: 'Create Student account', exact: true }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0)
  const registrationPopup = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await (await registrationPopup).getByText(email, { exact: true }).click()
  await expect(page).toHaveURL(/\/student\/dashboard$/)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/login?existing=1')
  await signInWithSeededGoogleAccount(page, email, 'Student')
  await expect(page).toHaveURL(/\/student\/dashboard$/)
  await expect(page.getByText('New Student', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('google-returning-account.png'), fullPage: true })
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(unexpectedConsoleErrors(diagnostics), 'unexpected browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})
