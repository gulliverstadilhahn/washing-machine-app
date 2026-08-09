import type { SlotIndex } from './constants'

export type BookingStatus = 'active' | 'cancelled' | 'released' | 'taken_over'

export type Apartment = {
  id: string
  number: number
  user_id: string | null
  is_admin: boolean
  name: string | null
  phone: string | null
  /** False for a leftover row that isn't one of the building's real lock numbers. */
  active: boolean
}

export type Booking = {
  id: string
  apartment_id: string
  /** Calendar date in Europe/Copenhagen, `YYYY-MM-DD`. */
  date: string
  slot_index: SlotIndex
  starts_at: string
  ends_at: string
  grace_starts_at: string
  status: BookingStatus
  created_at: string
  ended_at: string | null
  taken_over_by_apartment_id: string | null
  original_apartment_id: string | null
}
