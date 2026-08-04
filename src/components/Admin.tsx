import { useState } from 'react'
import { strings } from '../lib/strings'
import { errorMessage, supabase } from '../lib/supabase'
import { Button, ErrorNote, Field, Note, TextInput } from './ui'

const t = strings.admin

/**
 * Two operations, for people moving in and out. Nothing here can rewrite
 * history: bookings keep the apartment that made them, and the apartment keeps
 * its bookings. All that changes is which account may act as that apartment.
 *
 * The `is_admin` check that matters is inside the database functions. Hiding
 * this screen is only tidiness.
 */
export function Admin() {
  return (
    <div className="pb-6">
      <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
      <p className="mb-6 text-base text-slate-600">{t.intro}</p>

      <Reassign />
      <hr className="my-8 border-t-2 border-slate-100" />
      <RemoveAccount />
    </div>
  )
}

function Reassign() {
  const [number, setNumber] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = Number.parseInt(number.trim(), 10)
    const address = email.trim()
    if (!Number.isInteger(parsed) || !address) return

    setBusy(true)
    setError(null)
    setDone(null)
    const { error: rpcError } = await supabase.rpc('admin_reassign_apartment', {
      p_number: parsed,
      p_email: address,
    })
    setBusy(false)

    if (rpcError) {
      setError(errorMessage(rpcError, strings.common.somethingWentWrong))
      return
    }
    setDone(t.reassignDone(parsed, address))
    setNumber('')
    setEmail('')
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <h2 className="text-lg font-bold text-slate-900">{t.reassignTitle}</h2>
      <Note>{t.reassignIntro}</Note>

      <Field label={t.reassignApartmentLabel}>
        <TextInput
          type="number"
          inputMode="numeric"
          min={1}
          value={number}
          onChange={(event) => setNumber(event.target.value)}
        />
      </Field>

      <Field label={t.reassignEmailLabel}>
        <TextInput
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <ErrorNote>{error}</ErrorNote>
      {done ? <Note>{done}</Note> : null}

      <Button type="submit" disabled={busy}>
        {t.reassignSubmit}
      </Button>
    </form>
  )
}

function RemoveAccount() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const address = email.trim()
    if (!address) return

    // Removing a login cannot be undone from inside the app, so ask first.
    if (!window.confirm(t.removeConfirm(address))) return

    setBusy(true)
    setError(null)
    setDone(null)
    const { error: rpcError } = await supabase.rpc('admin_remove_account', { p_email: address })
    setBusy(false)

    if (rpcError) {
      setError(errorMessage(rpcError, strings.common.somethingWentWrong))
      return
    }
    setDone(t.removeDone(address))
    setEmail('')
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <h2 className="text-lg font-bold text-slate-900">{t.removeTitle}</h2>
      <Note>{t.removeIntro}</Note>

      <Field label={t.removeEmailLabel}>
        <TextInput
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <ErrorNote>{error}</ErrorNote>
      {done ? <Note>{done}</Note> : null}

      <Button type="submit" variant="danger" disabled={busy}>
        {t.removeSubmit}
      </Button>
    </form>
  )
}
