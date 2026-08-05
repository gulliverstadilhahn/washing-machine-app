import { useState } from 'react'
import { Admin } from './components/Admin'
import { BookingGrid } from './components/BookingGrid'
import { ClaimApartment } from './components/ClaimApartment'
import { History } from './components/History'
import { MyPage } from './components/MyPage'
import { NumberLogin } from './components/NumberLogin'
import { Rules } from './components/Rules'
import { Note, Screen } from './components/ui'
import { strings } from './lib/strings'
import { supabase } from './lib/supabase'
import type { Apartment } from './lib/types'
import { useAuth } from './lib/useAuth'
import { useNow } from './lib/useNow'

type Tab = 'book' | 'mypage' | 'history' | 'rules' | 'admin'

export function App() {
  const { ready, session, apartment, apartmentLoading, reloadApartment } = useAuth()
  const now = useNow()

  if (!ready || apartmentLoading) {
    return (
      <Screen>
        <div className="pt-10">
          <Note>{strings.common.loading}</Note>
        </div>
      </Screen>
    )
  }

  if (!session) return <NumberLogin onAuthenticated={reloadApartment} />

  if (!apartment) {
    return (
      <ClaimApartment
        onClaimed={reloadApartment}
        onSignOut={() => void supabase.auth.signOut()}
      />
    )
  }

  return <SignedIn now={now} apartment={apartment} onApartmentUpdated={reloadApartment} />
}

function SignedIn({
  now,
  apartment,
  onApartmentUpdated,
}: {
  now: Date
  apartment: Apartment
  onApartmentUpdated: () => Promise<void> | void
}) {
  const [tab, setTab] = useState<Tab>('book')

  // The check that matters is inside the admin database functions. Hiding the
  // tab is only tidiness.
  const tabs: Array<[Tab, string]> = [
    ['book', strings.nav.book],
    ['mypage', strings.nav.myPage],
    ['history', strings.nav.history],
    ['rules', strings.nav.rules],
    ...(apartment.is_admin ? ([['admin', strings.nav.admin]] as Array<[Tab, string]>) : []),
  ]

  return (
    <>
      {/* Room for the fixed tab bar, plus the home indicator on a notched phone. */}
      <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <Screen>
          {tab === 'book' ? <BookingGrid now={now} apartment={apartment} /> : null}
          {tab === 'mypage' ? (
            <MyPage apartment={apartment} onUpdated={onApartmentUpdated} />
          ) : null}
          {tab === 'history' ? <History now={now} /> : null}
          {tab === 'rules' ? <Rules /> : null}
          {tab === 'admin' && apartment.is_admin ? <Admin /> : null}

          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="mt-6 w-full py-3 text-center text-base font-semibold text-slate-600 underline"
          >
            {strings.common.signOut}
          </button>
        </Screen>
      </div>

      <nav className="fixed inset-x-0 bottom-0 border-t-2 border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-md">
          {tabs.map(([id, label]) => (
            <li key={id} className="flex-1">
              <button
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`min-h-16 w-full text-base font-semibold ${
                  tab === id
                    ? 'border-t-4 border-slate-900 text-slate-900'
                    : 'border-t-4 border-transparent text-slate-500'
                }`}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
