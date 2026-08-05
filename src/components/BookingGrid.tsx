import { Fragment, useEffect, useMemo, useState } from 'react'
import { BOOKING_HORIZON_DAYS, SLOT_INDEXES, type SlotIndex } from '../lib/constants'
import { slotState, type SlotAction, type SlotAppearance, type SlotState } from '../lib/slotState'
import { strings } from '../lib/strings'
import { errorMessage, supabase } from '../lib/supabase'
import {
  addDays,
  copenhagenDate,
  formatDay,
  formatDayNumber,
  formatWeekday,
  slotBounds,
  slotLabel,
  type DateString,
} from '../lib/time'
import type { Apartment, Booking } from '../lib/types'
import { slotKey, useBookings } from '../lib/useBookings'
import { ClaimDialog } from './ClaimDialog'
import { ContactDialog } from './ContactDialog'
import { Button, Dialog, ErrorNote, Note } from './ui'

const t = strings.grid

/** Colour per state. Never colour alone — every cell also says what it is. */
const appearanceClasses: Record<SlotAppearance, string> = {
  free: 'bg-white border-slate-300',
  yours: 'bg-sky-100 border-sky-700',
  taken: 'bg-slate-100 border-slate-300',
  claimable: 'bg-amber-100 border-amber-700',
  past: 'bg-slate-50 border-slate-200 text-slate-400',
}

const actionLabels: Record<SlotAction, string> = {
  book: t.actionBook,
  cancel: t.actionCancel,
  release: t.actionRelease,
  claim: t.actionClaim,
  none: '',
}

type PendingAction =
  | { kind: 'cancel' | 'release'; booking: Booking; date: DateString; slotIndex: SlotIndex }
  | { kind: 'claim'; booking: Booking; apartmentNumber: number }

type RpcResult = PromiseLike<{ error: unknown }>

export function BookingGrid({ now, apartment }: { now: Date; apartment: Apartment }) {
  const { loading, error, activeBySlot, apartmentsById, refresh } = useBookings(now)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [contactApartment, setContactApartment] = useState<Apartment | null>(null)

  const today = copenhagenDate(now)
  const [selectedDate, setSelectedDate] = useState<DateString>(today)
  const [selectedSlot, setSelectedSlot] = useState<SlotIndex | null>(null)

  // Today plus the whole horizon, so the last bookable day is reachable.
  const days = useMemo(
    () => Array.from({ length: BOOKING_HORIZON_DAYS + 1 }, (_, offset) => addDays(today, offset)),
    [today],
  )

  // If "today" rolls over while the app is open and the date strip no longer
  // contains what was selected, fall back to today rather than showing nothing.
  useEffect(() => {
    if (!days.includes(selectedDate)) {
      setSelectedDate(today)
      setSelectedSlot(null)
    }
  }, [days, selectedDate, today])

  const holdsFutureBooking = useMemo(
    () =>
      [...activeBySlot.values()].some(
        (booking) => booking.apartment_id === apartment.id && new Date(booking.starts_at) > now,
      ),
    [activeBySlot, apartment.id, now],
  )

  function selectDate(date: DateString) {
    setSelectedDate(date)
    setSelectedSlot(null)
    setMessage(null)
  }

  function toggleSlot(slotIndex: SlotIndex) {
    setSelectedSlot((current) => (current === slotIndex ? null : slotIndex))
    setMessage(null)
  }

  async function run(call: RpcResult) {
    setBusy(true)
    const { error: rpcError } = await call
    setBusy(false)
    setPending(null)

    // The database is authoritative: it re-checks every rule, and its messages
    // are written for residents to read. A cell can look bookable and still be
    // refused because someone in another flat tapped it a second earlier.
    setMessage(rpcError ? errorMessage(rpcError, strings.common.somethingWentWrong) : null)
    await refresh()
  }

  function activate(
    slotIndex: SlotIndex,
    state: SlotState,
    booking: Booking | null,
    holderNumber: number | undefined,
  ) {
    setMessage(null)

    switch (state.action) {
      case 'book':
        void run(supabase.rpc('book_slot', { p_date: selectedDate, p_slot: slotIndex }))
        return

      case 'cancel':
      case 'release':
        if (booking) setPending({ kind: state.action, booking, date: selectedDate, slotIndex })
        return

      case 'claim':
        if (booking && holderNumber !== undefined) {
          setPending({ kind: 'claim', booking, apartmentNumber: holderNumber })
        }
        return

      case 'none':
    }
  }

  return (
    <div className="pb-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-base text-slate-600">{t.subtitle(apartment.number)}</p>
      </header>

      <Legend />

      <div aria-live="polite">
        {message ? (
          <div className="mb-3">
            <ErrorNote>{message}</ErrorNote>
          </div>
        ) : null}
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <DateStrip days={days} today={today} selected={selectedDate} onSelect={selectDate} />

      <h2 className="mb-2 text-lg font-bold text-slate-900">{dayHeading(selectedDate, today)}</h2>

      {loading ? <Note>{strings.common.loading}</Note> : null}

      <ul className="space-y-2">
        {SLOT_INDEXES.map((slotIndex) => {
          const booking = activeBySlot.get(slotKey(selectedDate, slotIndex)) ?? null
          const holder = booking ? apartmentsById.get(booking.apartment_id) : undefined
          const { startsAt, endsAt } = slotBounds(selectedDate, slotIndex)

          const state = slotState({
            now,
            date: selectedDate,
            today,
            startsAt,
            endsAt,
            booking:
              booking && holder
                ? {
                    id: booking.id,
                    apartmentId: booking.apartment_id,
                    apartmentNumber: holder.number,
                    graceStartsAt: new Date(booking.grace_starts_at),
                  }
                : null,
            myApartmentId: apartment.id,
            holdsFutureBooking,
          })

          const isMine = booking?.apartment_id === apartment.id
          const isSelected = selectedSlot === slotIndex
          const who = holder ? (isMine ? t.yours : t.apartment(holder.number)) : t.free
          const canContact = Boolean(
            holder && !isMine && (holder.name?.trim() || holder.phone?.trim()),
          )

          return (
            <Fragment key={slotIndex}>
              <li className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => toggleSlot(slotIndex)}
                  aria-pressed={isSelected}
                  aria-label={`${slotLabel(slotIndex)}, ${who}${
                    state.appearance === 'claimable' ? `, ${t.claimable}` : ''
                  }`}
                  className={`flex min-h-16 flex-1 items-center justify-between rounded-lg border-2 px-4 text-left ${appearanceClasses[state.appearance]} ${isSelected ? 'ring-2 ring-slate-900' : ''}`}
                >
                  <span className="text-lg font-semibold tabular-nums">
                    {slotLabel(slotIndex)}
                  </span>
                  <span className="flex items-center gap-2 text-right">
                    {state.appearance === 'claimable' ? (
                      <span className="rounded bg-amber-700 px-2 py-1 text-sm font-bold text-white">
                        {t.claimable}
                      </span>
                    ) : null}
                    <span className="text-lg font-semibold">{who}</span>
                  </span>
                </button>

                {canContact && holder ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setContactApartment(holder)
                    }}
                    className="min-h-16 flex-none rounded-lg border-2 border-slate-300 bg-white px-3 text-base font-semibold text-slate-700"
                  >
                    {t.contactLink}
                  </button>
                ) : null}
              </li>

              {isSelected ? (
                <li className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4">
                  {state.action === 'none' ? (
                    <p className="text-base text-slate-700">
                      {blockedMessage(state, holder?.number)}
                    </p>
                  ) : (
                    <Button
                      onClick={() => activate(slotIndex, state, booking, holder?.number)}
                      disabled={busy}
                    >
                      {state.action === 'book' && busy ? t.actionBooking : actionLabels[state.action]}
                    </Button>
                  )}
                </li>
              ) : null}
            </Fragment>
          )
        })}
      </ul>

      <p className="mt-6 text-center text-base text-slate-500">
        {t.horizonNote(BOOKING_HORIZON_DAYS)}
      </p>

      {contactApartment ? (
        <ContactDialog apartment={contactApartment} onDismiss={() => setContactApartment(null)} />
      ) : null}

      {pending ? (
        <PendingDialog
          pending={pending}
          busy={busy}
          onDismiss={() => setPending(null)}
          onConfirm={() => {
            if (pending.kind === 'claim') {
              void run(supabase.rpc('claim_slot', { p_id: pending.booking.id }))
            } else {
              void run(
                supabase.rpc(pending.kind === 'cancel' ? 'cancel_booking' : 'release_booking', {
                  p_id: pending.booking.id,
                }),
              )
            }
          }}
        />
      ) : null}
    </div>
  )
}

function DateStrip({
  days,
  today,
  selected,
  onSelect,
}: {
  days: DateString[]
  today: DateString
  selected: DateString
  onSelect: (date: DateString) => void
}) {
  return (
    <div className="mb-3 -mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {days.map((date) => {
          const isSelected = date === selected
          const isToday = date === today
          return (
            <li key={date} className="flex-none">
              <button
                type="button"
                onClick={() => onSelect(date)}
                aria-pressed={isSelected}
                aria-label={formatDay(date)}
                className={`flex h-16 w-14 flex-col items-center justify-center rounded-lg border-2 text-center ${
                  isSelected
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : isToday
                      ? 'border-slate-900 bg-white text-slate-900'
                      : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                <span className="text-sm font-medium uppercase">{formatWeekday(date)}</span>
                <span className="text-xl font-bold tabular-nums">{formatDayNumber(date)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function dayHeading(date: DateString, today: DateString): string {
  if (date === today) return `${t.today} · ${formatDay(date)}`
  if (date === addDays(today, 1)) return `${t.tomorrow} · ${formatDay(date)}`
  return formatDay(date)
}

function PendingDialog({
  pending,
  busy,
  onDismiss,
  onConfirm,
}: {
  pending: PendingAction
  busy: boolean
  onDismiss: () => void
  onConfirm: () => void
}) {
  if (pending.kind === 'claim') {
    return (
      <ClaimDialog
        apartmentNumber={pending.apartmentNumber}
        busy={busy}
        onCancel={onDismiss}
        onConfirm={onConfirm}
      />
    )
  }

  const c = strings.confirm
  const isCancel = pending.kind === 'cancel'

  return (
    <Dialog title={isCancel ? c.cancelTitle : c.releaseTitle} onDismiss={onDismiss}>
      <p className="text-base leading-relaxed text-slate-700">
        {(isCancel ? c.cancelBody : c.releaseBody)(
          slotLabel(pending.slotIndex),
          formatDay(pending.date),
        )}
      </p>
      <div className="mt-5 space-y-3">
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {isCancel ? c.cancelConfirm : c.releaseConfirm}
        </Button>
        <Button variant="secondary" onClick={onDismiss} disabled={busy}>
          {isCancel ? c.cancelKeep : c.releaseKeep}
        </Button>
      </div>
    </Dialog>
  )
}

function Legend() {
  const items: Array<[SlotAppearance, string]> = [
    ['free', t.legendFree],
    ['yours', t.legendYours],
    ['taken', t.legendTaken],
    ['claimable', t.legendClaimable],
  ]
  return (
    <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-2">
      {items.map(([appearance, label]) => (
        <li key={appearance} className="flex items-center gap-2 text-base text-slate-600">
          <span
            aria-hidden
            className={`inline-block h-4 w-4 rounded border-2 ${appearanceClasses[appearance]}`}
          />
          {label}
        </li>
      ))}
    </ul>
  )
}

/** The expanded panel's status line when there is no action to offer. */
function blockedMessage(state: SlotState, holderNumber: number | undefined): string | null {
  switch (state.reason) {
    case 'over':
      return t.slotOver
    case 'beyond-horizon':
      return t.beyondHorizon(BOOKING_HORIZON_DAYS)
    case 'already-holding-a-future-booking':
      return t.alreadyHaveFutureBooking
    case 'in-grace-window':
      return t.inGraceWindow
    case 'not-yours':
      return holderNumber === undefined ? null : t.takenBy(holderNumber)
    default:
      return null
  }
}
