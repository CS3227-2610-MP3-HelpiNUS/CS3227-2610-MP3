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

function unexpectedFailedRequests(diagnostics: Diagnostics) {
  return diagnostics.failedRequests.filter((failure) => !(
    (failure.includes('/google.firestore.v1.Firestore/Listen/channel?') && failure.endsWith('net::ERR_ABORTED')) ||
    // This one aborted response is deliberate: the server completes it before the browser loses it.
    (failure.includes('/studentStudyAssist') && failure.includes('net::ERR_FAILED'))
  ))
}

function unexpectedConsoleErrors(diagnostics: Diagnostics) {
  return diagnostics.consoleErrors.filter((error) => {
    if (error.url.includes('/studentStudyAssist') && error.message.includes('net::ERR_FAILED')) return false
    if (error.message !== 'Failed to load resource: the server responded with a status of 400 (Bad Request)') return true
    try {
      const url = new URL(error.url)
      return !(url.origin === 'http://127.0.0.1:8080' && url.pathname === '/google.firestore.v1.Firestore/Listen/channel' && url.searchParams.get('TYPE') === 'terminate')
    } catch { return true }
  })
}

const test = base.extend<{ diagnostics: Diagnostics }>({
  diagnostics: async ({ page }, use, testInfo) => {
    const diagnostics = collectDiagnostics(page)
    try { await use(diagnostics) } finally {
      await testInfo.attach('browser-diagnostics', {
        body: Buffer.from(`${JSON.stringify(diagnostics, null, 2)}\n`),
        contentType: 'application/json',
      })
    }
  },
})

async function signInWithSeededGoogleAccount(page: Page, email: string, role: 'Student' | 'Mentor') {
  if (await page.getByRole('link', { name: 'Yes, sign in' }).isVisible()) await page.getByRole('link', { name: 'Yes, sign in' }).click()
  const popupReady = page.waitForEvent('popup')
  await page.getByRole('button', { name: `Continue as ${role}` }).click()
  const popup = await popupReady
  await expect(popup.locator('#title .js-provider-id')).toHaveText('Google.com')
  await popup.getByText(email, { exact: true }).click()
  await expect(page).toHaveURL(role === 'Student' ? /\/student\/dashboard$/ : /\/mentor\/dashboard$/)
}

async function callAsCurrentIdentity(page: Page, name: string, data: unknown) {
  const token = await page.evaluate(async () => {
    const moduleUrl = new URL('/src/services/firebase.ts', location.origin).href
    const { firebase } = await import(moduleUrl)
    return firebase.auth.currentUser.getIdToken()
  })
  return page.request.post(`http://127.0.0.1:5001/helpinus-dev/asia-southeast1/${name}`, {
    headers: { Authorization: `Bearer ${token}` }, data: { data },
  })
}

async function clearSavedConversations(page: Page) {
  await expect(page.locator('.study-assistant-history-list, .study-assistant-history-empty')).toBeVisible()
  const historyItems = page.locator('.study-assistant-history-list button')
  while (await historyItems.count()) {
    const countBeforeDelete = await historyItems.count()
    await historyItems.first().click()
    await page.getByRole('button', { name: 'Delete conversation' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(historyItems).toHaveCount(countBeforeDelete - 1)
  }
}

test('Student study assistant completes the grounded local journey', async ({ page, diagnostics }, testInfo) => {
  test.setTimeout(60_000)
  await page.goto('/login')
  await signInWithSeededGoogleAccount(page, 'student@example.test', 'Student')
  await page.goto('/student/study-assistant')
  await expect(page).toHaveURL(/\/student\/study-assistant$/)
  await expect(page.getByRole('heading', { name: 'Study assistant', exact: true })).toBeVisible()
  await expect(page.getByRole('note', { name: 'Supported Study assistant modules' }))
    .toContainText('Available for CS2030S and CS2103')
  await clearSavedConversations(page)

  await expect(page.getByText('Local only until your first message is sent')).toBeVisible()
  await expect(page.getByText('Your saved conversations will appear here after you send your first message.')).toBeVisible()

  let simulateLostResponse = true
  await page.route('**/studentStudyAssist', async (route) => {
    if (!simulateLostResponse || route.request().method() !== 'POST') return route.continue()
    simulateLostResponse = false
    await route.fetch()
    await route.abort('failed')
  })

  await page.getByLabel('Ask a question').fill('In CS2030S, why does immutability help with aliasing?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('We could not confirm whether this message was answered. Retry to safely check the same request.')).toBeVisible()
  await page.getByRole('button', { name: 'Retry message' }).click()

  const messageRegion = page.getByRole('region', { name: 'Study assistant messages' })
  await expect(messageRegion.getByText(/An immutable object has no externally visible state change/)).toBeVisible()
  const cs2030sSource = page.getByRole('link', { name: 'CS2030S Programming Methodology II' })
  await expect(cs2030sSource).toHaveAttribute('href', 'https://nus-cs2030s.github.io/2021-s2/25-immutability.html')
  await expect(messageRegion.getByText('In CS2030S, why does immutability help with aliasing?', { exact: true })).toHaveCount(1)

  await page.getByLabel('Ask a question').fill('In CS2103, what is the difference between functional and non-functional requirements?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(messageRegion.getByText(/A software requirement states a need the product must fulfil/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'CS2103/T Software Engineering Textbook' })).toBeVisible()

  await page.getByLabel('Ask a question').fill('What will the weather be tomorrow?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Not enough approved context')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Study assistant', exact: true })).toBeVisible()
  await page.locator('.study-assistant-history-list button').first().click()
  await expect(page.getByRole('region', { name: 'Study assistant messages' }).getByText(/A software requirement states a need/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'CS2103/T Software Engineering Textbook' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('student-study-assistant-desktop.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByLabel('Ask a question')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('student-study-assistant-mobile.png'), fullPage: true })

  const newConversation = page.getByRole('button', { name: 'New conversation' })
  await newConversation.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Local only until your first message is sent')).toBeVisible()
  await expect(page.getByLabel('Ask a question')).toBeFocused()
  await page.locator('.study-assistant-history-list button').first().click()
  await page.getByRole('button', { name: 'Delete conversation' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('Local only until your first message is sent')).toBeVisible()
  await expect(page.locator('.study-assistant-history-list button')).toHaveCount(0)
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(unexpectedConsoleErrors(diagnostics), 'unexpected browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected browser failed requests').toEqual([])
})

test('Student study assistant denies Mentor callable access', async ({ page, diagnostics }) => {
  await page.goto('/login')
  await signInWithSeededGoogleAccount(page, 'mentor@example.test', 'Mentor')
  await page.goto('/student/study-assistant')
  await expect(page).toHaveURL(/\/mentor\/dashboard$/)

  const response = await callAsCurrentIdentity(page, 'studentStudyAssist', {
    requestId: crypto.randomUUID(), conversationId: null, userMessage: 'Explain CS2030S generics.',
  })
  expect(response.status()).toBe(400)
  expect(await response.json()).toMatchObject({ error: { status: 'FAILED_PRECONDITION' } })
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(unexpectedConsoleErrors(diagnostics), 'unexpected browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected browser failed requests').toEqual([])
})

test('Student study assistant keeps a delayed answer in its originating conversation', async ({ page, diagnostics }) => {
  test.setTimeout(60_000)
  await page.goto('/login')
  await signInWithSeededGoogleAccount(page, 'student@example.test', 'Student')
  await page.goto('/student/study-assistant')
  await clearSavedConversations(page)

  await page.getByLabel('Ask a question').fill('Explain why CS2030S values immutability.')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('region', { name: 'Study assistant messages' }).getByText(/An immutable object has no externally visible state change/)).toBeVisible()
  await page.getByRole('button', { name: 'New conversation' }).click()
  await page.getByLabel('Ask a question').fill('Explain CS2103 refactoring.')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('region', { name: 'Study assistant messages' }).getByText(/Refactoring restructures code through small steps/)).toBeVisible()

  const history = page.getByRole('complementary', { name: /history/i })
  const conversationA = history.getByRole('button', { name: /^Explain why CS2030S values immutability\. / })
  const conversationB = history.getByRole('button', { name: /^Explain CS2103 refactoring\. / })
  await conversationA.click()
  await expect(page.getByRole('heading', { name: 'Explain why CS2030S values immutability.' })).toBeVisible()

  let releaseResponse!: () => void
  let markServerResponse!: () => void
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve })
  const serverResponded = new Promise<void>((resolve) => { markServerResponse = resolve })
  await page.route('**/studentStudyAssist', async (route) => {
    const response = await route.fetch()
    markServerResponse()
    await responseGate
    await route.fulfill({ response })
  })
  await page.getByLabel('Ask a question').fill('Why does it do that?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await serverResponded
  await conversationB.click()
  const messageRegion = page.getByRole('region', { name: 'Study assistant messages' })
  await expect(messageRegion.getByText('Explain CS2103 refactoring.', { exact: true })).toBeVisible()
  releaseResponse()

  await expect(page.getByText('Answer saved to Explain why CS2030S values immutability.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Explain CS2103 refactoring.' })).toBeVisible()
  await expect(conversationB).toHaveAttribute('aria-current', 'page')
  await expect(messageRegion.getByText('Why does it do that?', { exact: true })).toHaveCount(0)
  await expect(messageRegion.getByText(/An immutable object has no externally visible state change/)).toHaveCount(0)
  await expect(page.getByLabel('Ask a question')).toHaveValue('')
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(unexpectedConsoleErrors(diagnostics), 'unexpected browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected browser failed requests').toEqual([])
})
