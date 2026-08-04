import { ClaimApartment } from './components/ClaimApartment'
import { SignIn } from './components/SignIn'
import { Note, Screen } from './components/ui'
import { strings } from './lib/strings'
import { supabase } from './lib/supabase'
import { useAuth } from './lib/useAuth'

export function App() {
  const { ready, session, apartment, reloadApartment } = useAuth()

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

  // Phase 4 puts the booking grid here.
  return (
    <Screen>
      <div className="space-y-4 pt-10">
        <Note>{strings.grid.subtitle(apartment.number)}</Note>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="font-semibold text-slate-900 underline"
        >
          {strings.common.signOut}
        </button>
      </div>
    </Screen>
  )
}
