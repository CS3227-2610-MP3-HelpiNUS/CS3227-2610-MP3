import { expect, test } from '@playwright/test'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

test('Mentor sees a deliberate, collapsible four-section consultation summary', async ({ page }) => {
  if (process.env.VERIFY_APP_MANAGED !== 'true') throw new Error('Use the managed synthetic app-verification stack.')
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  const admin = initializeApp({ projectId: 'helpinus-dev' }, `mentor-summary-${crypto.randomUUID()}`)
  const db = getFirestore(admin)
  const requestId = `verify-summary-${crypto.randomUUID()}`
  const messageId = crypto.randomUUID()
  const summaryRequests: string[] = []
  page.on('request', (request) => { if (request.url().includes('/mentorConsultationSummary')) summaryRequests.push(request.url()) })
  try {
    const mentor = await getAuth(admin).getUserByEmail('mentor@example.test')
    const student = await getAuth(admin).getUserByEmail('student@example.test')
    const at = Timestamp.now()
    await db.collection('helpRequests').doc(requestId).set({
      id: requestId, studentId: student.uid, mentorId: mentor.uid, moduleId: 'cs2103t',
      title: 'Synthetic summary journey', description: 'How should I draw an alt frame?',
      studentDisplayName: 'Demo Student', mentorDisplayName: 'Demo Mentor',
      status: 'ACCEPTED', createdAt: at, updatedAt: at,
    })
    await db.collection('conversations').doc(requestId).set({
      id: requestId, helpRequestId: requestId, studentId: student.uid, mentorId: mentor.uid,
      participantIds: [student.uid, mentor.uid], createdAt: at, updatedAt: at,
    })
    await db.collection('conversations').doc(requestId).collection('messages').doc(messageId).set({
      senderId: student.uid, body: 'How should I draw an alt frame?', createdAt: at, readAt: null,
    })

    await page.goto('/login')
    await page.getByRole('link', { name: 'Yes, sign in' }).click()
    const popupReady = page.waitForEvent('popup')
    await page.getByRole('button', { name: 'Continue as Mentor' }).click()
    const popup = await popupReady
    await expect(popup.locator('#title .js-provider-id')).toHaveText('Google.com')
    await popup.getByText('mentor@example.test', { exact: true }).click()
    await expect(page).toHaveURL(/\/mentor\/dashboard$/)
    await page.setViewportSize({ width: 390, height: 720 })
    await page.goto(`/mentor/conversations/${requestId}`)
    await expect(page.getByRole('region', { name: 'Consultation draft' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Summarise Conversation' })).toBeEnabled()
    await expect(page.getByRole('region', { name: 'AI consultation summary' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Summarise Conversation' }).focus()
    await expect(page.getByRole('button', { name: 'Summarise Conversation' })).toBeFocused()
    await expect(page.getByRole('log', { name: 'Messages' })).toContainText('How should I draw an alt frame?')
    expect(summaryRequests).toEqual([])

    const brief = {
      summary: '<img src=x onerror=alert(1)>',
      unresolvedQuestions: 'How should I draw an alt frame?',
      teachingApproaches: 'Draw two branches and label the guard conditions.',
      limitations: 'Only one Student message was available.',
    }
    await page.route('**/mentorConsultationSummary', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ result: { brief, partialHistory: false } }),
    }))
    await page.getByRole('button', { name: 'Summarise Conversation' }).click()
    const summary = page.getByRole('region', { name: 'AI consultation summary' })
    await expect(summary).toBeVisible()
    await expect(summary.getByRole('heading', { name: 'Conversation summary' })).toBeVisible()
    await expect(summary.getByRole('heading', { name: 'Unresolved Student questions' })).toBeVisible()
    await expect(summary.getByRole('heading', { name: 'Suggested teaching approaches' })).toBeVisible()
    await expect(summary.getByRole('heading', { name: 'Limitations or missing context' })).toBeVisible()
    await expect(summary).toContainText(brief.summary)
    await expect(summary.getByRole('textbox')).toHaveCount(0)
    await expect(page.locator('img[src="x"]')).toHaveCount(0)
    await page.getByText('Consultation summary', { exact: true }).click()
    await expect(summary).toBeHidden()
    await page.getByText('Consultation summary', { exact: true }).click()
    await expect(summary).toBeVisible()
    expect(summaryRequests).toHaveLength(1)
  } finally {
    await db.collection('conversations').doc(requestId).collection('messages').doc(messageId).delete()
    await db.collection('conversations').doc(requestId).delete()
    await db.collection('helpRequests').doc(requestId).delete()
    await deleteApp(admin)
  }
})
