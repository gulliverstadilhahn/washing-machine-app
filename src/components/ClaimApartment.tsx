import { useState } from 'react'
import { errorMessage, supabase } from '../lib/supabase'
import { strings } from '../lib/strings'
import { Button, ErrorNote, Field, Heading, Note, Screen, TextInput } from './ui'

const t = strings.claimApartment

/**
 * Shown once, after the first sign-in. An apartment number, name and phone are
 * the whole identity here — there are no profiles beyond this.
 */
export function ClaimApartment({
  email,
  onClaimed,
  onSignOut,
}: {
  email: string
  onClaimed: () => Promise<void> | void
  onSignOut: () => void
}) {
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsedNumber = Number.parseInt(number.trim(), 10)
    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()

    if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) {
      setError(t.invalidNumber)
      return
    }
    if (!trimmedName) {
      setError(t.invalidName)
      return
    }
    if (!trimmedPhone) {
      setError(t.invalidPhone)
      return
    }

    setSaving(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('claim_apartment', {
      p_number: parsedNumber,
      p_name: trimmedName,
      p_phone: trimmedPhone,
    })
    setSaving(false)

    if (rpcError) {
      setError(errorMessage(rpcError, strings.common.somethingWentWrong))
      return
    }
    await onClaimed()
  }

  const [before, after] = t.wrongAccount.split('{email}')

  return (
    <Screen>
      <form className="space-y-5 pt-10" onSubmit={submit}>
        <Heading>{t.title}</Heading>
        <Note>{t.intro}</Note>

        <Field label={t.numberLabel}>
          <TextInput
            type="number"
            inputMode="numeric"
            min={1}
            autoComplete="off"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
          />
        </Field>

        <Field label={t.nameLabel}>
          <TextInput
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label={t.phoneLabel}>
          <TextInput
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>

        <ErrorNote>{error}</ErrorNote>

        <Button type="submit" disabled={saving}>
          {saving ? t.saving : t.submit}
        </Button>

        <p className="pt-2 text-center text-base text-slate-600">
          {before}
          <span className="font-semibold">{email}</span>
          {after}{' '}
          <button
            type="button"
            onClick={onSignOut}
            className="font-semibold text-slate-900 underline"
          >
            {strings.common.signOut}
          </button>
        </p>
      </form>
    </Screen>
  )
}
