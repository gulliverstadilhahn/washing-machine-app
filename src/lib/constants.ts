/**
 * Domain constants.
 *
 * These mirror the database, which is authoritative. `public.booking_horizon_days()`
 * and `public.grace_period()` are what actually enforce R7 and R6; the values here
 * only decide what the UI draws and offers. Keep them in step with the migrations.
 */

export const TIME_ZONE = 'Europe/Copenhagen'

/** R7. Must match `public.booking_horizon_days()`. */
export const BOOKING_HORIZON_DAYS = 14

/** R6. Must match `public.grace_period()`. */
export const GRACE_MINUTES = 30

/** The laundry room: everything you can book at once. */
export const ROOM = { washingMachines: 3, tumbleDryers: 2 } as const

/**
 * The five slots, every day. Slot bounds are computed from these in
 * Europe/Copenhagen — see `slotBounds` in `time.ts` — but the database computes
 * its own from `date` and `slot_index`, and the database's answer is the real one.
 */
export const SLOTS = [
  { index: 1, startHour: 7, endHour: 10 },
  { index: 2, startHour: 10, endHour: 13 },
  { index: 3, startHour: 13, endHour: 16 },
  { index: 4, startHour: 16, endHour: 19 },
  { index: 5, startHour: 19, endHour: 22 },
] as const

export type SlotIndex = 1 | 2 | 3 | 4 | 5

export const SLOT_INDEXES: readonly SlotIndex[] = [1, 2, 3, 4, 5]
