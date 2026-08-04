import { BookingGrid } from './components/BookingGrid'
import { ClaimApartment } from './components/ClaimApartment'
import { SignIn } from './components/SignIn'
import { Note, Screen } from './components/ui'
import { strings } from './lib/strings'
import { supabase } from './lib/supabase'
import { useAuth } from './lib/useAuth'
import { useNow } from './lib/useNow'

export function App() {
  const { ready, session, apartment, reloadApartment } = useAuth()
  const now = useNow()

  if (!ready) {
    return (
      <Screen>
        <div className="pt-10">
          <Note>{strings.common.loading}</Note>
        </div>
      </Screen>
    )
  }

  if (!session) return <SignIn />

  if (!apartment) {
    return (
      <ClaimApartment
        email={session.user.email ?? ''}
        onClaimed={reloadApartment}
        onSignOut={() => void supabase.auth.signOut()}
      />
    )
  }

  // Phase 5 adds History alongside this, and Phase 6 adds Admin.
  return (
    <Screen>
      <BookingGrid now={now} apartment={apartment} />
      <button
        type="button"
        onClick={() => void supabase.auth.signOut()}
        className="mt-6 w-full py-3 text-center text-base font-semibold text-slate-600 underline"
      >
        {strings.common.signOut}
      </button>
    </Screen>
  )
}
