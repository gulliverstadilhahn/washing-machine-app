import { describe, expect, it } from 'vitest'
import { slotState, type SlotBooking, type SlotInput } from './slotState'
import { addDays } from './time'
import { BOOKING_HORIZON_DAYS } from './constants'

const ME = 'apartment-me'
const NEIGHBOUR = 'apartment-neighbour'

const NOW = new Date('2026-08-05T09:00:00Z') // 11:00 in Copenhagen
const TODAY = '2026-08-05'

const minutes = (n: number) => n * 60 * 1000

function input(overrides: Partial<SlotInput> = {}): SlotInput {
  return {
    now: NOW,
    date: TODAY,
    today: TODAY,
    // Default: a slot running right now, 10:00-13:00 Copenhagen.
    startsAt: new Date('2026-08-05T08:00:00Z'),
    endsAt: new Date('2026-08-05T11:00:00Z'),
    booking: null,
    myApartmentId: ME,
    holdsFutureBooking: false,
    ...overrides,
  }
}

function booking(overrides: Partial<SlotBooking> = {}): SlotBooking {
  return {
    id: 'booking-1',
    apartmentId: NEIGHBOUR,
    apartmentNumber: 14,
    graceStartsAt: NOW,
    isClaim: false,
    ...overrides,
  }
}

/** A slot tomorrow, so nothing about it has started. */
const future = {
  date: addDays(TODAY, 1),
  startsAt: new Date('2026-08-06T05:00:00Z'),
  endsAt: new Date('2026-08-06T08:00:00Z'),
}

describe('slotState', () => {
  describe('free slots', () => {
    it('offers to book a free slot in the future', () => {
      expect(slotState(input(future))).toEqual({ action: 'book', appearance: 'free' })
    })

    it('R8: offers to book a free slot that is already in progress', () => {
      expect(slotState(input())).toEqual({ action: 'book', appearance: 'free' })
    })

    it('R1: does not offer a future slot when a future booking is already held', () => {
      expect(slotState(input({ ...future, holdsFutureBooking: true }))).toEqual({
        action: 'none',
        appearance: 'free',
        reason: 'already-holding-a-future-booking',
      })
    })

    it('R1 and R8: a slot in progress is still bookable while holding a future booking', () => {
      // The rule caps future bookings. Taking a slot that is already running
      // adds none, so it stays available — the same reasoning that exempts claims.
      expect(slotState(input({ holdsFutureBooking: true }))).toEqual({
        action: 'book',
        appearance: 'free',
      })
    })

    it('R7: offers the last day inside the horizon', () => {
      const date = addDays(TODAY, BOOKING_HORIZON_DAYS)
      expect(
        slotState(
          input({
            date,
            startsAt: new Date('2026-08-19T05:00:00Z'),
            endsAt: new Date('2026-08-19T08:00:00Z'),
          }),
        ),
      ).toEqual({ action: 'book', appearance: 'free' })
    })

    it('R7: refuses the first day beyond the horizon', () => {
      const date = addDays(TODAY, BOOKING_HORIZON_DAYS + 1)
      expect(
        slotState(
          input({
            date,
            startsAt: new Date('2026-08-20T05:00:00Z'),
            endsAt: new Date('2026-08-20T08:00:00Z'),
          }),
        ),
      ).toEqual({ action: 'none', appearance: 'free', reason: 'beyond-horizon' })
    })
  })

  describe('your own bookings', () => {
    it('R3: offers to cancel a booking that has not started', () => {
      expect(
        slotState(input({ ...future, booking: booking({ apartmentId: ME }) })),
      ).toEqual({ action: 'cancel', appearance: 'yours' })
    })

    it('R4: offers to release a booking that has started', () => {
      expect(slotState(input({ booking: booking({ apartmentId: ME }) }))).toEqual({
        action: 'release',
        appearance: 'yours',
        claimableAt: new Date(NOW.getTime() + minutes(30)),
      })
    })

    it('reassurance: a fresh mid-slot booking reports when it stops being protected', () => {
      const state = slotState(input({ booking: booking({ apartmentId: ME, graceStartsAt: NOW }) }))
      expect(state.claimableAt).toEqual(new Date(NOW.getTime() + minutes(30)))
    })

    it('R6 amendment: a booking obtained by claiming reports only a 15-minute window', () => {
      const state = slotState(
        input({ booking: booking({ apartmentId: ME, graceStartsAt: NOW, isClaim: true }) }),
      )
      expect(state.claimableAt).toEqual(new Date(NOW.getTime() + minutes(15)))
    })

    it('reassurance does not apply before the slot has started', () => {
      const state = slotState(input({ ...future, booking: booking({ apartmentId: ME }) }))
      expect(state.action).toBe('cancel')
      expect(state.claimableAt).toBeUndefined()
    })

    it('offers nothing on your own booking once the slot is over', () => {
      expect(
        slotState(
          input({
            booking: booking({ apartmentId: ME }),
            startsAt: new Date('2026-08-05T04:00:00Z'),
            endsAt: new Date('2026-08-05T07:00:00Z'),
          }),
        ),
      ).toEqual({ action: 'none', appearance: 'past', reason: 'over' })
    })
  })

  describe("someone else's bookings", () => {
    it('offers nothing on a future booking held by someone else', () => {
      expect(slotState(input({ ...future, booking: booking() }))).toEqual({
        action: 'none',
        appearance: 'taken',
        reason: 'not-yours',
      })
    })

    it('R6: offers nothing inside the grace window', () => {
      const graceStartsAt = new Date(NOW.getTime() - minutes(20))
      expect(slotState(input({ booking: booking({ graceStartsAt }) }))).toEqual({
        action: 'none',
        appearance: 'taken',
        reason: 'in-grace-window',
        claimableAt: new Date(graceStartsAt.getTime() + minutes(30)),
      })
    })

    it('R6: still offers nothing at exactly 30 minutes', () => {
      // The rule is strictly greater than, matching `now() > grace_starts_at + 30 minutes`.
      const graceStartsAt = new Date(NOW.getTime() - minutes(30))
      expect(slotState(input({ booking: booking({ graceStartsAt }) })).action).toBe('none')
    })

    it('R6: offers a claim once the grace window has run out', () => {
      const graceStartsAt = new Date(NOW.getTime() - minutes(31))
      expect(slotState(input({ booking: booking({ graceStartsAt }) }))).toEqual({
        action: 'claim',
        appearance: 'claimable',
      })
    })

    it('R5 amendment: a 13:00-16:00 slot is not yet claimable at 13:30, and is at 13:31', () => {
      // book_slot now always sets grace_starts_at = starts_at — no more
      // exception for a booking made mid-slot. slotState itself only ever
      // reads whatever grace_starts_at it's given, so this is really testing
      // that the boundary lines up with the slot's own wall-clock start.
      const startsAt = new Date('2026-08-05T11:00:00Z') // 13:00 Copenhagen
      const endsAt = new Date('2026-08-05T14:00:00Z') // 16:00 Copenhagen
      const graceStartsAt = startsAt

      const at1330 = new Date(startsAt.getTime() + minutes(30))
      expect(
        slotState(input({ now: at1330, startsAt, endsAt, booking: booking({ graceStartsAt }) }))
          .action,
      ).toBe('none')

      const at1331 = new Date(startsAt.getTime() + minutes(31))
      expect(
        slotState(input({ now: at1331, startsAt, endsAt, booking: booking({ graceStartsAt }) }))
          .action,
      ).toBe('claim')
    })

    it('R6: a slot that is over cannot be claimed however long the grace ran out ago', () => {
      const graceStartsAt = new Date(NOW.getTime() - minutes(240))
      expect(
        slotState(
          input({
            booking: booking({ graceStartsAt }),
            startsAt: new Date('2026-08-05T04:00:00Z'),
            endsAt: new Date('2026-08-05T07:00:00Z'),
          }),
        ),
      ).toEqual({ action: 'none', appearance: 'past', reason: 'over' })
    })

    describe('R6 amendment: a claim gets 15 minutes, not 30', () => {
      it('at 20 minutes elapsed, an original booking is still in its grace window', () => {
        const graceStartsAt = new Date(NOW.getTime() - minutes(20))
        expect(slotState(input({ booking: booking({ graceStartsAt }) })).action).toBe('none')
      })

      it('at 20 minutes elapsed, a claimed booking is already claimable', () => {
        const graceStartsAt = new Date(NOW.getTime() - minutes(20))
        expect(
          slotState(input({ booking: booking({ graceStartsAt, isClaim: true }) })),
        ).toEqual({ action: 'claim', appearance: 'claimable' })
      })

      it('a claimed booking is not yet claimable at exactly 15 minutes', () => {
        const graceStartsAt = new Date(NOW.getTime() - minutes(15))
        expect(
          slotState(input({ booking: booking({ graceStartsAt, isClaim: true }) })).action,
        ).toBe('none')
      })

      it('a claimed booking becomes claimable at 16 minutes', () => {
        const graceStartsAt = new Date(NOW.getTime() - minutes(16))
        expect(
          slotState(input({ booking: booking({ graceStartsAt, isClaim: true }) })).action,
        ).toBe('claim')
      })

      it('a claimed booking is still blocked well before 15 minutes', () => {
        const graceStartsAt = new Date(NOW.getTime() - minutes(5))
        expect(
          slotState(input({ booking: booking({ graceStartsAt, isClaim: true }) })).action,
        ).toBe('none')
      })

      it('a blocked claim gets its own appearance, distinct from an ordinary booking', () => {
        const graceStartsAt = new Date(NOW.getTime() - minutes(5))
        expect(
          slotState(input({ booking: booking({ graceStartsAt, isClaim: true }) })).appearance,
        ).toBe('claim-pending')
      })

      it('a blocked original booking keeps the ordinary appearance', () => {
        const graceStartsAt = new Date(NOW.getTime() - minutes(20))
        expect(slotState(input({ booking: booking({ graceStartsAt }) })).appearance).toBe('taken')
      })
    })

    describe('claimableAt (wall-clock visibility)', () => {
      it('exposes the wall-clock time an original booking becomes claimable', () => {
        const graceStartsAt = new Date(NOW.getTime() - minutes(20))
        const state = slotState(input({ booking: booking({ graceStartsAt }) }))
        expect(state.claimableAt).toEqual(new Date(graceStartsAt.getTime() + minutes(30)))
      })

      it('exposes a 15-minute wall-clock time for a claimed booking', () => {
        const graceStartsAt = new Date(NOW.getTime() - minutes(5))
        const state = slotState(input({ booking: booking({ graceStartsAt, isClaim: true }) }))
        expect(state.claimableAt).toEqual(new Date(graceStartsAt.getTime() + minutes(15)))
      })

      it('omits claimableAt once the slot is already claimable', () => {
        const graceStartsAt = new Date(NOW.getTime() - minutes(31))
        const state = slotState(input({ booking: booking({ graceStartsAt }) }))
        expect(state.claimableAt).toBeUndefined()
      })
    })
  })

  describe('boundaries', () => {
    it('a slot ending exactly now is over', () => {
      expect(slotState(input({ endsAt: NOW })).appearance).toBe('past')
    })

    it('a slot starting exactly now counts as started', () => {
      expect(
        slotState(input({ startsAt: NOW, booking: booking({ apartmentId: ME }) })).action,
      ).toBe('release')
    })

    it('a free slot with one minute left is still bookable', () => {
      expect(slotState(input({ endsAt: new Date(NOW.getTime() + minutes(1)) })).action).toBe(
        'book',
      )
    })
  })
})
