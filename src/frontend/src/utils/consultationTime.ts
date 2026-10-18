const singaporeOffset = '+08:00'
const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' })

function dateKey(value: Date) {
  const parts = dateParts.formatToParts(value)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function localIso(day: string, time: string) {
  return new Date(`${day}T${time}:00${singaporeOffset}`).toISOString()
}

export type AvailabilityErrors = { startTime?: string; endTime?: string }

export function validateAvailabilityForm(selectedDay: string, startTime: string, endTime: string, now: number): AvailabilityErrors {
  const today = dateKey(new Date(now))
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/u
  if (selectedDay < today) return { startTime: 'Past dates cannot be selected.' }
  if (!timePattern.test(startTime)) return { startTime: 'Enter a valid start time.' }
  if (!timePattern.test(endTime)) return { endTime: 'Enter a valid end time.' }
  const startsAt = Date.parse(localIso(selectedDay, startTime))
  const endsAt = Date.parse(localIso(selectedDay, endTime))
  if (endsAt <= startsAt) return { endTime: 'End time must be later than start time.' }
  if (startsAt <= now) return { startTime: 'Choose a time later than the current Singapore time.' }
  const duration = endsAt - startsAt
  if (duration < 30 * 60_000) return { endTime: 'Availability must be at least 30 minutes.' }
  if (duration > 120 * 60_000) return { endTime: 'Availability cannot exceed 120 minutes.' }
  const startMinutes = Number(startTime.slice(3))
  const endMinutes = Number(endTime.slice(3))
  if (startMinutes % 30 !== 0) return { startTime: 'Use a start time ending in :00 or :30.' }
  if (endMinutes % 30 !== 0) return { endTime: 'Use an end time ending in :00 or :30.' }
  return {}
}
