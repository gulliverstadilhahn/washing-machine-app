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

import { BOOKING_HORIZON_DAYS, CLAIM_GRACE_MINUTES, GRACE_MINUTES } from './constants'
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
export type SlotAppearance = 'free' | 'yours' | 'taken' | 'claim-pending' | 'claimable' | 'past'

export type SlotState = {
  action: SlotAction
  appearance: SlotAppearance
  reason?: SlotBlockedReason
  /** When this booking becomes (or became) claimable. Set whenever a grace
   *  window is in play — for someone else's booking still in its window, and
   *  for your own once it has started, so you can see how long you're
   *  protected for. */
  claimableAt?: Date
}

/** The active booking on a slot, if there is one. */
export type SlotBooking = {
  id: string
  apartmentId: string
  apartmentNumber: number
  graceStartsAt: Date
  /** R6 amendment: a claimed booking (original_apartment_id set) gets a
   *  shorter grace period than an original one — see graceDurationMs. */
  isClaim: boolean
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

/** R6 amendment: a claim gets 15 minutes of protection, an original booking 30. */
function graceDurationMs(booking: SlotBooking): number {
  return (booking.isClaim ? CLAIM_GRACE_MINUTES : GRACE_MINUTES) * 60 * 1000
}

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
    if (!hasStarted) {
      return { action: 'cancel', appearance: 'yours' }
    }
    // Reassurance: how long you're protected for, including when this booking
    // is itself a claim (isClaim), which only gets the shorter window. Once
    // that window has actually passed there is nothing left to reassure about.
    const claimableAt = new Date(booking.graceStartsAt.getTime() + graceDurationMs(booking))
    return now.getTime() < claimableAt.getTime()
      ? { action: 'release', appearance: 'yours', claimableAt }
      : { action: 'release', appearance: 'yours' }
  }

  // R6 — someone else's. Claimable only once the grace window has run out, and
  // only while the slot is still running. `isOver` is already handled above.
  const claimableAt = new Date(booking.graceStartsAt.getTime() + graceDurationMs(booking))
  if (now.getTime() > claimableAt.getTime()) {
    return { action: 'claim', appearance: 'claimable' }
  }

  // A not-yet-started booking held by someone else has nothing actionable to
  // show a time for — claimableAt is only meaningful once the slot, and the
  // grace window on it, are actually running.
  if (!hasStarted) {
    return { action: 'none', appearance: 'taken', reason: 'not-yours' }
  }

  // A claim (isClaim) gets its own distinct appearance: it reads as a normal,
  // unremarkable booking otherwise, but it is a temporary hold someone hasn't
  // acted on yet, not a settled booking — that difference is worth seeing at
  // a glance, not just when the cell is expanded.
  return {
    action: 'none',
    appearance: booking.isClaim ? 'claim-pending' : 'taken',
    reason: 'in-grace-window',
    claimableAt,
  }
}
