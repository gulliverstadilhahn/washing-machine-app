import { useMemo, useState } from 'react'
import { BOOKING_HORIZON_DAYS, SLOT_INDEXES, type SlotIndex } from '../lib/constants'
import { slotState, type SlotAppearance, type SlotState } from '../lib/slotState'
import { strings } from '../lib/strings'
import { errorMessage, supabase } from '../lib/supabase'
import { addDays, copenhagenDate, formatDay, slotBounds, slotLabel, type DateString } from '../lib/time'
import type { Apartment, Booking } from '../lib/types'
import { slotKey, useBookings } from '../lib/useBookings'
import { ClaimDialog } from './ClaimDialog'
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

type PendingAction =
  | { kind: 'cancel' | 'release'; booking: Booking; date: DateString; slotIndex: SlotIndex }
  | { kind: 'claim'; booking: Booking; apartmentNumber: number }

type RpcResult = PromiseLike<{ error: unknown }>

export function BookingGrid({ now, apartment }: { now: Date; apartment: Apartment }) {
  const { loading, error, activeBySlot, apartmentsById, refresh } = useBookings(now)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)

  const today = copenhagenDate(now)

  // Today first, then every day that can still be booked — the horizon plus
  // today — so nothing bookable is out of reach of the scroll.
  const days = useMemo(
    () => Array.from({ length: BOOKING_HORIZON_DAYS + 1 }, (_, offset) => addDays(today, offset)),
    [today],
  )

  const holdsFutureBooking = useMemo(
    () =>
      [...activeBySlot.values()].some(
        (booking) => booking.apartment_id === apartment.id && new Date(booking.starts_at) > now,
      ),
    [activeBySlot, apartment.id, now],
  )

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

  function onCellTap(
    date: DateString,
    slotIndex: SlotIndex,
    state: SlotState,
    booking: Booking | null,
    holderNumber: number | undefined,
  ) {
    setMessage(null)

    switch (state.action) {
      case 'book':
        void run(supabase.rpc('book_slot', { p_date: date, p_slot: slotIndex }))
        return

      case 'cancel':
      case 'release':
        if (booking) setPending({ kind: state.action, booking, date, slotIndex })
        return

      case 'claim':
        if (booking && holderNumber !== undefined) {
          setPending({ kind: 'claim', booking, apartmentNumber: holderNumber })
        }
        return

      case 'none':
        setMessage(blockedMessage(state, holderNumber))
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
      {loading ? <Note>{strings.common.loading}</Note> : null}

      <div className="space-y-6">
        {days.map((date, dayOffset) => (
          <section key={date}>
            <h2 className="mb-2 text-lg font-bold text-slate-900">{dayLabel(date, dayOffset)}</h2>

            <ul className="space-y-2">
              {SLOT_INDEXES.map((slotIndex) => {
                const booking = activeBySlot.get(slotKey(date, slotIndex)) ?? null
                const holder = booking ? apartmentsById.get(booking.apartment_id) : undefined
                const { startsAt, endsAt } = slotBounds(date, slotIndex)

                const state = slotState({
                  now,
                  date,
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
                const who = holder ? (isMine ? t.yours : t.apartment(holder.number)) : t.free

                return (
                  <li key={slotIndex}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onCellTap(date, slotIndex, state, booking, holder?.number)}
                      aria-label={`${formatDay(date)}, ${slotLabel(slotIndex)}, ${who}${
                        state.appearance === 'claimable' ? `, ${t.claimable}` : ''
                      }`}
                      className={`flex min-h-16 w-full items-center justify-between rounded-lg border-2 px-4 text-left ${appearanceClasses[state.appearance]}`}
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
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-6 text-center text-base text-slate-500">
        {t.horizonNote(BOOKING_HORIZON_DAYS)}
      </p>

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

function dayLabel(date: DateString, offset: number): string {
  if (offset === 0) return `${t.today} · ${formatDay(date)}`
  if (offset === 1) return `${t.tomorrow} · ${formatDay(date)}`
  return formatDay(date)
}

/** Tapping a cell that offers nothing should still say why. */
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
