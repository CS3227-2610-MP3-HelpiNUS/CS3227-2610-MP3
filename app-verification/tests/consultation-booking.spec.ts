import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test as base, type Page, type TestInfo } from '@playwright/test'

type Diagnostics = { consoleErrors: string[]; pageErrors: string[]; failedRequests: string[] }

function collectDiagnostics(page: Page): Diagnostics {
  const diagnostics: Diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [] }
  page.on('console', (message) => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message))
  page.on('requestfailed', (request) => diagnostics.failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'unknown failure'}`))
  return diagnostics
}

function unexpectedFailedRequests(diagnostics: Diagnostics) {
  return diagnostics.failedRequests.filter((failure) => !(failure.includes('/google.firestore.v1.Firestore/Listen/channel?') && failure.endsWith('net::ERR_ABORTED')))
}

const test = base.extend<{ diagnostics: Diagnostics }>({
  diagnostics: async ({ page }, use, testInfo) => {
    const diagnostics = collectDiagnostics(page)
    try { await use(diagnostics) } finally {
      await testInfo.attach('browser-diagnostics', { body: Buffer.from(`${JSON.stringify(diagnostics, null, 2)}\n`), contentType: 'application/json' })
    }
  },
})

const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' })
const fullDate = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function futureDay(daysAhead: number) {
  const value = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
  const parts = dateParts.formatToParts(value)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return { key: `${part('year')}-${part('month')}-${part('day')}`, label: fullDate.format(value) }
}

async function signIn(page: Page, email: string, password: string, destination: RegExp) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(destination)
}

async function signOut(page: Page) {
  await page.locator('.logout-button').click()
  await expect(page).toHaveURL(/\/login$/)
}

async function selectCalendarDay(page: Page, label: string | RegExp) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const day = page.getByRole('button', { name: label, exact: typeof label === 'string' })
    const visible = await day.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false)
    if (visible) { await day.click(); return }
    await page.getByRole('button', { name: 'Next month' }).click()
  }
  throw new Error(`Calendar day was not reachable: ${label}`)
}

function calendarDay(label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`^${escaped}(?:, \\d+ slots?)?$`, 'u')
}

test('consultation booking works across Mentor and Student roles', async ({ page, diagnostics }) => {
  const token = crypto.randomUUID().replaceAll('-', '')
  const day = futureDay(8 + Number.parseInt(token.slice(0, 4), 16) % 14)
  const startMinutes = 8 * 60 + (Number.parseInt(token.slice(4, 8), 16) % 20) * 30
  const startTime = `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`
  const endMinutes = startMinutes + 30
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
  const topic = `Calendar verification ${token.slice(0, 8)}`
  const displayedStartTime = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit' }).format(new Date(`${day.key}T${startTime}:00+08:00`))
  const reviewDirectory = resolve(process.cwd(), '.impeccable/review')
  await mkdir(reviewDirectory, { recursive: true })

  await signIn(page, 'mentor@example.test', 'Mentor-demo-123!', /\/mentor\/dashboard$/)
  await page.locator('.side-nav').getByRole('link', { name: 'Consultations' }).click()
  await expect(page.getByRole('heading', { name: 'Consultation availability' })).toBeVisible()
  await selectCalendarDay(page, calendarDay(day.label))
  await page.getByLabel('Starts').fill(startTime)
  await page.getByLabel('Ends').fill(endTime)
  await page.setViewportSize({ width: 900, height: 900 })
  const schedulerBox = await page.locator('.consultation-scheduler').boundingBox()
  const publishButton = page.getByRole('button', { name: 'Add availability' })
  const publishBox = await publishButton.boundingBox()
  expect(schedulerBox).not.toBeNull()
  expect(publishBox).not.toBeNull()
  expect(publishBox!.x + publishBox!.width).toBeLessThanOrEqual(schedulerBox!.x + schedulerBox!.width + 0.5)
  await publishButton.click()
  await expect(page.locator('.consultation-feedback')).toContainText('Availability added')
  await expect(page.getByText('open', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.screenshot({ path: resolve(reviewDirectory, 'consultation-mentor-desktop.png'), fullPage: true })
  await signOut(page)

  await signIn(page, 'student@example.test', 'Student-demo-123!', /\/student\/dashboard$/)
  await page.locator('.side-nav').getByRole('link', { name: 'Consultations' }).click()
  await selectCalendarDay(page, calendarDay(day.label))
  await expect(page.getByText('Demo Mentor', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Choose' }).click()
  await page.getByLabel('What would you like help with?').fill(topic)
  await page.getByRole('button', { name: 'Confirm booking' }).click()
  await expect(page.locator('.consultation-feedback')).toContainText('Booked')
  await expect(page.getByRole('heading', { name: topic })).toBeVisible()
  await page.screenshot({ path: resolve(reviewDirectory, 'consultation-student-desktop.png'), fullPage: true })
  await page.locator('.side-nav').getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByRole('heading', { name: topic })).toBeVisible()
  await signOut(page)

  await signIn(page, 'jamie.tan@example.test', 'Jamie-demo-123!', /\/student\/dashboard$/)
  await page.locator('.side-nav').getByRole('link', { name: 'Consultations' }).click()
  await selectCalendarDay(page, calendarDay(day.label))
  await expect(page.locator('.consultation-time strong').getByText(displayedStartTime, { exact: true })).toHaveCount(0)
  await signOut(page)

  await signIn(page, 'mentor@example.test', 'Mentor-demo-123!', /\/mentor\/dashboard$/)
  await page.locator('.side-nav').getByRole('link', { name: 'Consultations' }).click()
  await selectCalendarDay(page, calendarDay(day.label))
  await expect(page.locator('.consultation-booking-detail').getByText(topic, { exact: true })).toBeVisible()
  await expect(page.getByText('Demo Student', { exact: true })).toBeVisible()
  await expect(page.getByText('booked', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: resolve(reviewDirectory, 'consultation-mentor-mobile.png'), fullPage: true })

  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(diagnostics.consoleErrors, 'browser console errors').toEqual([])
  expect(unexpectedFailedRequests(diagnostics), 'unexpected failed browser requests').toEqual([])
})
