import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Apartment } from './types'

export type AuthState = {
  ready: boolean
  session: Session | null
  /** Null until the resident has told us which apartment they are. */
  apartment: Apartment | null
  /**
   * True from the moment a session appears until we know whether it has an
   * apartment. Login now happens inside the app (number + password) rather
   * than via a page-reloading magic-link redirect, so a session can appear
   * while the app is already sitting there — screens must key off this,
   * not "apartment is null" alone, or claiming an apartment would flash the
   * "which apartment are you?" screen before the real answer comes back.
   */
  apartmentLoading: boolean
  reloadApartment: () => Promise<void>
}

export function useAuth(): AuthState {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [apartment, setApartment] = useState<Apartment | null>(null)
  const [apartmentLoading, setApartmentLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSession(data.session)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id ?? null

  const loadApartment = useCallback(async () => {
    if (!userId) {
      setApartment(null)
      setApartmentLoading(false)
      setReady(true)
      return
    }
    setApartmentLoading(true)
    const { data } = await supabase
      .from('apartments')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle<Apartment>()
    setApartment(data ?? null)
    setApartmentLoading(false)
    setReady(true)
  }, [userId])

  useEffect(() => {
    void loadApartment()
  }, [loadApartment])

  return { ready, session, apartment, apartmentLoading, reloadApartment: loadApartment }
}
