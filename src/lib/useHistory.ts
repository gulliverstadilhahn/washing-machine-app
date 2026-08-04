import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Apartment, Booking, BookingStatus } from './types'
import { addDays, copenhagenDate } from './time'
import type { SlotIndex } from './constants'

/** How far back the log goes. */
export const LOG_DAYS = 60

export type LastWash = {
  apartment_id: string
  number: number
  booking_id: string | null
  last_wash_starts_at: string | null
  last_wash_date: string | null
  last_wash_slot_index: SlotIndex | null
  last_wash_status: BookingStatus | null
}

export type HistoryData = {
  loading: boolean
  error: string | null
  lastWash: LastWash[]
  log: Booking[]
  apartmentsById: Map<string, Apartment>
}

export function useHistory(now: Date): HistoryData {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastWash, setLastWash] = useState<LastWash[]>([])
  const [log, setLog] = useState<Booking[]>([])
  const [apartmentsById, setApartmentsById] = useState<Map<string, Apartment>>(new Map())

  const today = copenhagenDate(now)

  const load = useCallback(async () => {
    setError(null)

    const [apartmentsResult, lastWashResult, logResult] = await Promise.all([
      supabase.from('apartments').select('*'),
      // Oldest first, and apartments that have never washed at the very top —
      // they are the ones worth noticing.
      supabase
        .from('last_wash_by_apartment')
        .select('*')
        .order('last_wash_starts_at', { ascending: true, nullsFirst: true }),
      supabase
        .from('bookings')
        .select('*')
        .gte('date', addDays(today, -LOG_DAYS))
        .lte('date', today)
        .order('starts_at', { ascending: false })
        .order('slot_index', { ascending: false }),
    ])

    const failure = apartmentsResult.error ?? lastWashResult.error ?? logResult.error
    if (failure) {
      setError(failure.message)
      setLoading(false)
      return
    }

    setApartmentsById(
      new Map((apartmentsResult.data as Apartment[]).map((flat) => [flat.id, flat])),
    )
    setLastWash(lastWashResult.data as LastWash[])
    setLog(logResult.data as Booking[])
    setLoading(false)
  }, [today])

  useEffect(() => {
    void load()
  }, [load])

  return { loading, error, lastWash, log, apartmentsById }
}
