import { useState } from 'react'
import { errorMessage, supabase } from '../lib/supabase'
import { strings } from '../lib/strings'
import { Button, ErrorNote, Field, Heading, Note, Screen, TextInput } from './ui'

const t = strings.claimApartment

/**
 * Shown once, after the first sign-in. An apartment number is the whole identity
 * — there are no names and no profiles — so this is the entire onboarding.
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = Number.parseInt(number.trim(), 10)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError(t.invalidNumber)
      return
    }

    setSaving(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('claim_apartment', { p_number: parsed })
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
