import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Apartment } from './types'

export type AuthState = {
  ready: boolean
  session: Session | null
  /** Null until the resident has told us which apartment they are. */
  apartment: Apartment | null
  reloadApartment: () => Promise<void>
}

export function useAuth(): AuthState {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [apartment, setApartment] = useState<Apartment | null>(null)

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
      setReady(true)
      return
    }
    const { data } = await supabase
      .from('apartments')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle<Apartment>()
    setApartment(data ?? null)
    setReady(true)
  }, [userId])

  useEffect(() => {
    let cancelled = false

    // Wait for getSession to settle before deciding there is no session, so the
    // sign-in screen does not flash for someone who is already signed in.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (!data.session && !userId) {
        setApartment(null)
        setReady(true)
        return
      }
      void loadApartment()
    })

    return () => {
      cancelled = true
    }
  }, [userId, loadApartment])

  return { ready, session, apartment, reloadApartment: loadApartment }
}
