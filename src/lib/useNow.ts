import { useEffect, useState } from 'react'

/**
 * A clock that ticks, so a slot becomes claimable while you are looking at it
 * without needing a reload.
 *
 * This is only the client deciding what to offer. Nothing here changes a
 * booking: the database re-checks R6 when the claim is actually made, and a
 * slot changes hands only because a person tapped the button.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
