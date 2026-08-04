import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Apartment, Booking } from './types'
import { addDays, copenhagenDate, type DateString } from './time'
import { BOOKING_HORIZON_DAYS, type SlotIndex } from './constants'

export type LaundryData = {
  loading: boolean
  error: string | null
  /** Active bookings only, keyed by `date:slot_index`. */
  activeBySlot: Map<string, Booking>
  apartmentsById: Map<string, Apartment>
  refresh: () => Promise<void>
}

export function slotKey(date: DateString, slotIndex: SlotIndex | number): string {
  return `${date}:${slotIndex}`
}

/**
 * The grid only needs active bookings inside the horizon: a slot is free unless
 * an active booking says otherwise, and nothing outside the horizon can be
 * booked. History has its own query.
 */
export function useBookings(now: Date): LaundryData {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeBySlot, setActiveBySlot] = useState<Map<string, Booking>>(new Map())
  const [apartmentsById, setApartmentsById] = useState<Map<string, Apartment>>(new Map())

  // Only the date matters, not the tick, so the window is stable through the day.
  const today = copenhagenDate(now)

  const refresh = useCallback(async () => {
    setError(null)

    const [apartmentsResult, bookingsResult] = await Promise.all([
      supabase.from('apartments').select('*'),
      supabase
        .from('bookings')
        .select('*')
        .eq('status', 'active')
        .gte('date', today)
        .lte('date', addDays(today, BOOKING_HORIZON_DAYS)),
    ])

    if (apartmentsResult.error || bookingsResult.error) {
      setError((apartmentsResult.error ?? bookingsResult.error)?.message ?? null)
      setLoading(false)
      return
    }

    setApartmentsById(
      new Map((apartmentsResult.data as Apartment[]).map((flat) => [flat.id, flat])),
    )
    setActiveBySlot(
      new Map(
        (bookingsResult.data as Booking[]).map((booking) => [
          slotKey(booking.date, booking.slot_index),
          booking,
        ]),
      ),
    )
    setLoading(false)
  }, [today])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { loading, error, activeBySlot, apartmentsById, refresh }
}
