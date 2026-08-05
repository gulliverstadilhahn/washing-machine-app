import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Booking } from './types'

/** Every booking this apartment has ever made, newest first — no date window. */
export function useMyBookings(apartmentId: string) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])

  const load = useCallback(async () => {
    setError(null)
    const { data, error: queryError } = await supabase
      .from('bookings')
      .select('*')
      .eq('apartment_id', apartmentId)
      .order('starts_at', { ascending: false })

    if (queryError) {
      setError(queryError.message)
      setLoading(false)
      return
    }
    setBookings(data as Booking[])
    setLoading(false)
  }, [apartmentId])

  useEffect(() => {
    void load()
  }, [load])

  return { loading, error, bookings }
}
