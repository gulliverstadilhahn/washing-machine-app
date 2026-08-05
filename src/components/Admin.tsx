import { useState } from 'react'
import { strings } from '../lib/strings'
import { errorMessage, supabase } from '../lib/supabase'
import { Button, ErrorNote, Field, Note, TextInput } from './ui'

const t = strings.admin

/**
 * One operation, for residents moving in and out, a wrong number claimed, or
 * a forgotten password — with no email on file, resetting the apartment is
 * the only way back in for any of those. Nothing here can rewrite history:
 * bookings keep the apartment that made them.
 *
 * The `is_admin` check that matters is inside `admin_reset_apartment`. Hiding
 * this screen is only tidiness.
 */
export function Admin() {
  return (
    <div className="pb-6">
      <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
      <p className="mb-6 text-base text-slate-600">{t.intro}</p>

      <ResetApartment />
    </div>
  )
}

function ResetApartment() {
  const [number, setNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = Number.parseInt(number.trim(), 10)
    if (!Number.isInteger(parsed)) return

    // Clearing a login and contact details cannot be undone from inside the
    // app, so ask first.
    if (!window.confirm(t.resetConfirm(parsed))) return

    setBusy(true)
    setError(null)
    setDone(null)
    const { error: rpcError } = await supabase.rpc('admin_reset_apartment', { p_number: parsed })
    setBusy(false)

    if (rpcError) {
      setError(errorMessage(rpcError, strings.common.somethingWentWrong))
      return
    }
    setDone(t.resetDone(parsed))
    setNumber('')
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <h2 className="text-lg font-bold text-slate-900">{t.resetTitle}</h2>
      <Note>{t.resetIntro}</Note>

      <Field label={t.resetApartmentLabel}>
        <TextInput
          type="number"
          inputMode="numeric"
          min={1}
          value={number}
          onChange={(event) => setNumber(event.target.value)}
        />
      </Field>

      <ErrorNote>{error}</ErrorNote>
      {done ? <Note>{done}</Note> : null}

      <Button type="submit" variant="danger" disabled={busy}>
        {t.resetSubmit}
      </Button>
    </form>
  )
}
