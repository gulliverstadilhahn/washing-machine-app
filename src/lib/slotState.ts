/**
 * What tapping a cell in the grid does.
 *
 * This mirrors the rules in the database, but it is only here to decide what the
 * UI offers. The database is authoritative and re-checks everything: a cell may
 * look bookable and still be refused, because someone in another flat tapped it
 * a second earlier. Every call site must be ready for that.
 *
 * Pure on purpose — `now` is passed in, nothing here reads the clock, and there
 * are no side effects. That is what makes it testable.
 */

import { BOOKING_HORIZON_DAYS, GRACE_MINUTES } from './constants'
import { addDays, type DateString } from './time'

export type SlotAction = 'book' | 'cancel' | 'release' | 'claim' | 'none'

/** Why nothing can be done, so the UI can say something useful. */
export type SlotBlockedReason =
  | 'over'
  | 'beyond-horizon'
  | 'already-holding-a-future-booking'
  | 'in-grace-window'
  | 'not-yours'

/** How the cell is coloured. */
export type SlotAppearance = 'free' | 'yours' | 'taken' | 'claimable' | 'past'

export type SlotState = {
  action: SlotAction
  appearance: SlotAppearance
  reason?: SlotBlockedReason
}

/** The active booking on a slot, if there is one. */
export type SlotBooking = {
  id: string
  apartmentId: string
  apartmentNumber: number
  graceStartsAt: Date
}

export type SlotInput = {
  now: Date
  /** Copenhagen date of the slot, and of "today", as `YYYY-MM-DD`. */
  date: DateString
  today: DateString
  startsAt: Date
  endsAt: Date
  /** The one active booking for this slot, or null if the slot is free. */
  booking: SlotBooking | null
  myApartmentId: string
  /** Does my apartment already hold an active booking that has not started? */
  holdsFutureBooking: boolean
}

const graceMs = GRACE_MINUTES * 60 * 1000

export function slotState(input: SlotInput): SlotState {
  const { now, booking, myApartmentId } = input
  const hasStarted = input.startsAt <= now
  const isOver = input.endsAt <= now

  // A slot that is over is finished business. Its record stays visible (R2) but
  // there is nothing left to do to it — no releasing, no claiming, no booking.
  if (isOver) {
    return { action: 'none', appearance: 'past', reason: 'over' }
  }

  if (!booking) {
    // R7 — the horizon.
    if (input.date > addDays(input.today, BOOKING_HORIZON_DAYS)) {
      return { action: 'none', appearance: 'free', reason: 'beyond-horizon' }
    }

    // R1 — one future booking at a time. Booking a slot that is already running
    // (R8) adds no future booking, so it stays available either way.
    if (!hasStarted && input.holdsFutureBooking) {
      return {
        action: 'none',
        appearance: 'free',
        reason: 'already-holding-a-future-booking',
      }
    }

    // R8 — free and not yet over, so bookable for whatever is left of it.
    return { action: 'book', appearance: 'free' }
  }

  if (booking.apartmentId === myApartmentId) {
    // R3 before it starts, R4 once it has.
    return hasStarted
      ? { action: 'release', appearance: 'yours' }
      : { action: 'cancel', appearance: 'yours' }
  }

  // R6 — someone else's. Claimable only once the grace window has run out, and
  // only while the slot is still running. `isOver` is already handled above.
  const claimableFrom = booking.graceStartsAt.getTime() + graceMs
  if (now.getTime() > claimableFrom) {
    return { action: 'claim', appearance: 'claimable' }
  }

  return {
    action: 'none',
    appearance: 'taken',
    reason: hasStarted ? 'in-grace-window' : 'not-yours',
  }
}
