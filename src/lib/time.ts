/**
 * Everything time-related happens in Europe/Copenhagen, never in the browser's
 * timezone. A resident on holiday in Tokyo still books Copenhagen slots, and the
 * grid must show them Copenhagen times.
 *
 * The database computes the authoritative `starts_at` / `ends_at` for a booking.
 * These helpers exist so the UI can reason about slots that have no booking yet.
 */

import { SLOTS, TIME_ZONE, type SlotIndex } from './constants'

/** A calendar date in Copenhagen, `YYYY-MM-DD`. */
export type DateString = string

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function zonedParts(instant: Date) {
  const parts = partsFormatter.formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

/** How far Copenhagen is ahead of UTC at a given instant, in milliseconds. */
function offsetAt(instant: Date): number {
  const parts = zonedParts(instant)
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return asIfUtc - instant.getTime()
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Today's date in Copenhagen — not the browser's today. */
export function copenhagenDate(instant: Date): DateString {
  const { year, month, day } = zonedParts(instant)
  return `${year}-${pad(month)}-${pad(day)}`
}

/**
 * The instant at which a given wall-clock hour occurs in Copenhagen on a given
 * date. Two passes: guess using the offset at the naive instant, then correct
 * using the offset at the guess, which settles it either side of a DST change.
 */
export function copenhagenWallTime(date: DateString, hour: number): Date {
  const [year, month, day] = date.split('-').map(Number)
  const naive = Date.UTC(year, month - 1, day, hour, 0, 0)
  const firstGuess = new Date(naive - offsetAt(new Date(naive)))
  return new Date(naive - offsetAt(firstGuess))
}

/** Calendar arithmetic on `YYYY-MM-DD`, with no timezone involved. */
export function addDays(date: DateString, days: number): DateString {
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

export function slotBounds(date: DateString, slotIndex: SlotIndex) {
  const slot = SLOTS[slotIndex - 1]
  return {
    startsAt: copenhagenWallTime(date, slot.startHour),
    endsAt: copenhagenWallTime(date, slot.endHour),
  }
}

/** `07:00–10:00`. Fixed hours, so no formatter needed. */
export function slotLabel(slotIndex: SlotIndex): string {
  const slot = SLOTS[slotIndex - 1]
  return `${pad(slot.startHour)}:00–${pad(slot.endHour)}:00`
}

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** `07:45`, in Copenhagen. */
export function formatTime(instant: Date | string): string {
  return timeFormatter.format(typeof instant === 'string' ? new Date(instant) : instant)
}

const dayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** `Mon 12 Aug`, in Copenhagen. */
export function formatDay(date: DateString): string {
  return dayFormatter.format(copenhagenWallTime(date, 12))
}

const fullDayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function formatFullDay(date: DateString): string {
  return fullDayFormatter.format(copenhagenWallTime(date, 12))
}

const weekdayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  weekday: 'short',
})

const monthShortFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  month: 'short',
})

/** `Wed`, for the date strip. Noon avoids any midnight DST edge case. */
export function formatWeekday(date: DateString): string {
  return weekdayFormatter.format(copenhagenWallTime(date, 12))
}

/** `5`, the day-of-month number, for the date strip. */
export function formatDayNumber(date: DateString): number {
  return Number(date.slice(8, 10))
}

/** `Aug`, shown only when the strip crosses into a new month. */
export function formatMonthShort(date: DateString): string {
  return monthShortFormatter.format(copenhagenWallTime(date, 12))
}
