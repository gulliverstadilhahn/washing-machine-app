import { useState } from 'react'
import { errorMessage, supabase } from '../lib/supabase'
import { strings } from '../lib/strings'
import { Button, ErrorNote, Field, Heading, Note, Screen, TextInput } from './ui'

const t = strings.signIn

/**
 * Magic link only. No passwords and no OAuth: residents sign in a handful of
 * times a year and a password would just be one more thing to lose.
 */
export function SignIn() {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const address = email.trim()
    if (!address) {
      setError(t.invalidEmail)
      return
    }

    setSending(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: window.location.origin },
    })
    setSending(false)

    if (signInError) {
      setError(errorMessage(signInError, strings.common.somethingWentWrong))
      return
    }
    setSentTo(address)
  }

  if (sentTo) {
    return (
      <Screen>
        <div className="space-y-5 pt-10">
          <Heading>{t.title}</Heading>
          <Note>{t.sent(sentTo)}</Note>
          <Button variant="secondary" onClick={() => setSentTo(null)}>
            {t.sendAgain}
          </Button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <form className="space-y-5 pt-10" onSubmit={submit}>
        <Heading>{t.title}</Heading>
        <Note>{t.intro}</Note>

        <Field label={t.emailLabel}>
          <TextInput
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder={t.emailPlaceholder}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <ErrorNote>{error}</ErrorNote>

        <Button type="submit" disabled={sending}>
          {sending ? t.sending : t.submit}
        </Button>
      </form>
    </Screen>
  )
}
