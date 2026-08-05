import { strings } from './strings'
import { formatTime } from './time'
import type { Apartment, Booking } from './types'

const t = strings.history

/**
 * Every booking, written to read plainly to someone standing in the laundry
 * room — a taken-over booking in particular has to name both apartments and
 * the time, because that is the record the whole app exists to keep.
 *
 * Shared between the building-wide log and "my bookings" on My page.
 */
export function describeBooking(booking: Booking, apartmentsById: Map<string, Apartment>): string {
  const holder = apartmentsById.get(booking.apartment_id)?.number
  if (holder === undefined) return ''

  switch (booking.status) {
    case 'taken_over': {
      const claimer = booking.taken_over_by_apartment_id
        ? apartmentsById.get(booking.taken_over_by_apartment_id)?.number
        : undefined
      if (claimer === undefined || !booking.ended_at) return t.logBooked(holder)
      return t.logTakenOver(holder, claimer, formatTime(booking.ended_at))
    }

    case 'cancelled':
      return t.logCancelled(holder)

    case 'released':
      return booking.ended_at
        ? t.logReleased(holder, formatTime(booking.ended_at))
        : t.logBooked(holder)

    case 'active': {
      // An active booking carrying an original apartment is one that was claimed
      // from someone else — say so, rather than showing it as an ordinary wash.
      const takenFrom = booking.original_apartment_id
        ? apartmentsById.get(booking.original_apartment_id)?.number
        : undefined
      return takenFrom === undefined ? t.logBooked(holder) : t.logClaimed(holder, takenFrom)
    }
  }
}
