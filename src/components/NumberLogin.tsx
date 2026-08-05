import { useState } from 'react'
import { apartmentEmail } from '../lib/apartmentAuth'
import { strings } from '../lib/strings'
import { errorMessage, supabase } from '../lib/supabase'
import { Button, ErrorNote, Field, Heading, Note, Screen, TextInput } from './ui'

const t = strings.login
const c = strings.claimApartment

type Step = 'number' | 'signup' | 'login'

/**
 * Login by apartment number and password, not email — see the migration
 * that added `apartment_login_status` for why. The number is checked first;
 * the database says whether it has already been claimed, and that decides
 * whether this screen asks for a new password or an existing one.
 */
export function NumberLogin({
  onAuthenticated,
}: {
  onAuthenticated: () => Promise<void> | void
}) {
  const [step, setStep] = useState<Step>('number')
  const [number, setNumber] = useState('')
  const [apartmentNumber, setApartmentNumber] = useState<number | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function backToNumber() {
    setStep('number')
    setPassword('')
    setConfirmPassword('')
    setError(null)
  }

  async function submitNumber(event: React.FormEvent) {
    event.preventDefault()
    const parsed = Number.parseInt(number.trim(), 10)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError(t.invalidNumber)
      return
    }

    setBusy(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('apartment_login_status', {
      p_number: parsed,
    })
    setBusy(false)

    if (rpcError) {
      setError(errorMessage(rpcError, strings.common.somethingWentWrong))
      return
    }

    setApartmentNumber(parsed)
    setStep(data ? 'login' : 'signup')
  }

  async function submitSignup(event: React.FormEvent) {
    event.preventDefault()
    if (apartmentNumber === null) return

    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()

    if (!trimmedName) {
      setError(c.invalidName)
      return
    }
    if (!trimmedPhone) {
      setError(c.invalidPhone)
      return
    }
    if (password.length < 6) {
      setError(t.invalidPassword)
      return
    }
    if (password !== confirmPassword) {
      setError(t.passwordMismatch)
      return
    }

    setBusy(true)
    setError(null)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: apartmentEmail(apartmentNumber),
      password,
    })

    if (signUpError) {
      setBusy(false)
      setError(errorMessage(signUpError, strings.common.somethingWentWrong))
      return
    }

    // Requires "Confirm email" to be off for the project (see CLAUDE.md) — with
    // it on, signUp succeeds but returns no session, and there would be no way
    // to deliver a confirmation link to this apartment's synthetic address.
    if (!data.session) {
      setBusy(false)
      setError(strings.common.somethingWentWrong)
      return
    }

    const { error: claimError } = await supabase.rpc('claim_apartment', {
      p_number: apartmentNumber,
      p_name: trimmedName,
      p_phone: trimmedPhone,
    })

    setBusy(false)

    if (claimError) {
      setError(errorMessage(claimError, strings.common.somethingWentWrong))
      return
    }

    await onAuthenticated()
  }

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault()
    if (apartmentNumber === null) return

    setBusy(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: apartmentEmail(apartmentNumber),
      password,
    })

    setBusy(false)

    // A wrong password and a nonexistent synthetic account produce the same
    // Supabase error — no need to distinguish them for the resident.
    if (signInError) {
      setError(t.wrongPassword(apartmentNumber))
    }
  }

  if (step === 'signup' && apartmentNumber !== null) {
    return (
      <Screen>
        <form className="space-y-5 pt-10" onSubmit={submitSignup}>
          <Heading>{t.title}</Heading>
          <Note>{t.signupIntro(apartmentNumber)}</Note>

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

          <Field label={t.createPasswordLabel}>
            <TextInput
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <Field label={t.confirmPasswordLabel}>
            <TextInput
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </Field>

          <ErrorNote>{error}</ErrorNote>

          <Button type="submit" disabled={busy}>
            {busy ? t.signupSaving : t.signupSubmit}
          </Button>

          <button
            type="button"
            onClick={backToNumber}
            className="block w-full text-center text-base font-semibold text-slate-900 underline"
          >
            {t.changeNumber}
          </button>
        </form>
      </Screen>
    )
  }

  if (step === 'login' && apartmentNumber !== null) {
    return (
      <Screen>
        <form className="space-y-5 pt-10" onSubmit={submitLogin}>
          <Heading>{t.title}</Heading>
          <Note>{t.loginIntro(apartmentNumber)}</Note>

          <Field label={t.passwordLabel}>
            <TextInput
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
          </Field>

          <ErrorNote>{error}</ErrorNote>

          <Button type="submit" disabled={busy}>
            {busy ? t.loginSaving : t.loginSubmit}
          </Button>

          <div className="space-y-2 text-center text-base">
            <p className="text-slate-600">{t.forgotPassword(apartmentNumber)}</p>
            <button
              type="button"
              onClick={backToNumber}
              className="font-semibold text-slate-900 underline"
            >
              {t.changeNumber}
            </button>
          </div>
        </form>
      </Screen>
    )
  }

  return (
    <Screen>
      <form className="space-y-5 pt-10" onSubmit={submitNumber}>
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
            autoFocus
          />
        </Field>

        <ErrorNote>{error}</ErrorNote>

        <Button type="submit" disabled={busy}>
          {busy ? t.checking : t.continue}
        </Button>
      </form>
    </Screen>
  )
}
