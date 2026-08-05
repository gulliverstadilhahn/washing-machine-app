import { useState } from 'react'
import { describeBooking } from '../lib/describeBooking'
import { strings } from '../lib/strings'
import { errorMessage, supabase } from '../lib/supabase'
import { formatFullDay, slotLabel } from '../lib/time'
import type { Apartment } from '../lib/types'
import { useMyBookings } from '../lib/useMyBookings'
import { Button, ErrorNote, Field, Note, TextInput } from './ui'

const t = strings.myPage

export function MyPage({
  apartment,
  onUpdated,
}: {
  apartment: Apartment
  onUpdated: () => Promise<void> | void
}) {
  const { loading, error, bookings } = useMyBookings(apartment.id)
  // A single-entry map lets `describeBooking` read this apartment's own number,
  // the only apartment any row here can belong to.
  const apartmentsById = new Map([[apartment.id, apartment]])

  return (
    <div className="pb-6">
      <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
      <p className="mb-6 text-base text-slate-600">{t.subtitle(apartment.number)}</p>

      <ContactDetailsForm apartment={apartment} onUpdated={onUpdated} />

      <section className="mt-8">
        <h2 className="text-lg font-bold text-slate-900">{t.bookingsTitle}</h2>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {loading ? <Note>{strings.common.loading}</Note> : null}
        {!loading && bookings.length === 0 ? <Note>{t.bookingsEmpty}</Note> : null}

        <ul className="divide-y-2 divide-slate-100 border-y-2 border-slate-100">
          {bookings.map((booking) => (
            <li key={booking.id} className="py-3">
              <p className="text-base text-slate-500 tabular-nums">
                {formatFullDay(booking.date)} · {slotLabel(booking.slot_index)}
              </p>
              <p className="text-lg text-slate-900">{describeBooking(booking, apartmentsById)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function ContactDetailsForm({
  apartment,
  onUpdated,
}: {
  apartment: Apartment
  onUpdated: () => Promise<void> | void
}) {
  const [name, setName] = useState(apartment.name ?? '')
  const [phone, setPhone] = useState(apartment.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()

    if (!trimmedName) {
      setError(strings.claimApartment.invalidName)
      return
    }
    if (!trimmedPhone) {
      setError(strings.claimApartment.invalidPhone)
      return
    }

    setSaving(true)
    setError(null)
    setSaved(false)
    const { error: rpcError } = await supabase.rpc('update_contact_details', {
      p_name: trimmedName,
      p_phone: trimmedPhone,
    })
    setSaving(false)

    if (rpcError) {
      setError(errorMessage(rpcError, strings.common.somethingWentWrong))
      return
    }
    setSaved(true)
    await onUpdated()
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <h2 className="text-lg font-bold text-slate-900">{t.detailsTitle}</h2>
      <Note>{t.detailsIntro}</Note>

      <Field label={t.nameLabel}>
        <TextInput
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setSaved(false)
          }}
        />
      </Field>

      <Field label={t.phoneLabel}>
        <TextInput
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value)
            setSaved(false)
          }}
        />
      </Field>

      <ErrorNote>{error}</ErrorNote>
      {saved ? <Note>{t.saved}</Note> : null}

      <Button type="submit" disabled={saving}>
        {saving ? t.saving : t.save}
      </Button>
    </form>
  )
}
