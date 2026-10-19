import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { callable, singaporeRegion } from './callable.js'
import { requireActiveUser, requireRole } from './auth.js'
import { callableSchemas } from '@helpinus/shared'
import type { ZodType } from 'zod'
import { initializeStudentProfileHandler } from './profile.js'
import { discoverMentorsHandler } from './mentorDiscovery.js'
import { getMentorRequestSelectionHandler } from './mentorRequestSelection.js'
import { readOwnMentorProfileHandler, updateOwnMentorProfileHandler } from './mentorProfileManagement.js'
import { searchMentorModulesHandler } from './mentorModuleSearch.js'
import { createHelpRequestHandler, respondToHelpRequestHandler } from './helpRequests.js'
import { acknowledgeMessageHandler, provisionForAcceptedRequest, sendMessageHandler } from './conversations.js'

initializeApp()
const db = getFirestore()

export const testAuthenticated = callable(
  // The shared initialization schema keeps runtime parsing consistent without inventing a domain contract.
  callableSchemas.initializeStudentProfile.input,
  async (_input, request) => ({ uid: (await requireActiveUser(request)).uid, ok: true }),
)

export const initializeStudentProfile = callable(
  callableSchemas.initializeStudentProfile.input,
  (input, request) => initializeStudentProfileHandler(input, request, db, process.env.FUNCTIONS_EMULATOR === 'true'),
)

export const discoverMentors = callable(
  callableSchemas.discoverMentors.input,
  (input, request) => discoverMentorsHandler(input, request, db),
)
export const getMentorRequestSelection = callable(
  callableSchemas.getMentorRequestSelection.input,
  (input, request) => getMentorRequestSelectionHandler(input, request, db),
)
export const readOwnMentorProfile = callable(callableSchemas.readOwnMentorProfile.input, (input, request) => readOwnMentorProfileHandler(input, request, db))
export const searchMentorModules = callable(callableSchemas.searchMentorModules.input, (input, request) => searchMentorModulesHandler(input, request, db))
export const updateOwnMentorProfile = callable(callableSchemas.updateOwnMentorProfile.input, (input, request) => updateOwnMentorProfileHandler(input, request, db))

function notImplemented(name: string, role?: 'STUDENT' | 'MENTOR') {
  return callable(callableSchemas[name as keyof typeof callableSchemas].input as ZodType<unknown>, async (_input, request) => {
    if (role) await requireRole(request, role)
    else await requireActiveUser(request)
    throw new HttpsError('unavailable', `${name} is not available in Sprint 1.`)
  })
}

export const createHelpRequest = callable(callableSchemas.createHelpRequest.input, (input, request) => createHelpRequestHandler(input, request, db))
export const respondToHelpRequest = callable(callableSchemas.respondToHelpRequest.input, (input, request) => respondToHelpRequestHandler(input, request, db, provisionForAcceptedRequest))
export const sendMessage = callable(callableSchemas.sendMessage.input, (input, request) => sendMessageHandler(input, request, db))
export const acknowledgeMessage = callable(callableSchemas.acknowledgeMessage.input, (input, request) => acknowledgeMessageHandler(input, request, db))
export const closeHelpRequest = notImplemented('closeHelpRequest', 'STUDENT')
export const createAvailabilitySlot = notImplemented('createAvailabilitySlot', 'MENTOR')
export const withdrawAvailabilitySlot = notImplemented('withdrawAvailabilitySlot', 'MENTOR')
export const reserveAppointment = notImplemented('reserveAppointment', 'STUDENT')
export const respondToAppointment = notImplemented('respondToAppointment', 'MENTOR')
export const cancelAppointment = notImplemented('cancelAppointment')
export const completeAppointment = notImplemented('completeAppointment', 'MENTOR')
export const studentStudyAssist = notImplemented('studentStudyAssist', 'STUDENT')
export const mentorConsultationSummary = callable(
  callableSchemas.mentorConsultationSummary.input,
  async (_input, request) => {
    await requireRole(request, 'MENTOR')
    throw new HttpsError('unavailable', 'mentorConsultationSummary is not available in Sprint 1.')
  },
)

export { singaporeRegion }
