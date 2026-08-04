import { strings } from '../lib/strings'
import { formatFullDay, formatTime, slotLabel } from '../lib/time'
import type { Apartment, Booking } from '../lib/types'
import { LOG_DAYS, useHistory, type LastWash } from '../lib/useHistory'
import { ErrorNote, Note } from './ui'

const t = strings.history

export function History({ now }: { now: Date }) {
  const { loading, error, lastWash, log, apartmentsById } = useHistory(now)

  return (
    <div className="pb-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-900">{t.title}</h1>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {loading ? <Note>{strings.common.loading}</Note> : null}

      <section className="mb-8">
        <h2 className="text-lg font-bold text-slate-900">{t.lastWashTitle}</h2>
        <p className="mb-3 text-base text-slate-600">{t.lastWashIntro}</p>

        <ul className="divide-y-2 divide-slate-100 border-y-2 border-slate-100">
          {lastWash.map((row) => (
            <li key={row.apartment_id} className="flex items-baseline justify-between gap-3 py-3">
              <span className="text-lg font-semibold text-slate-900">
                {strings.grid.apartment(row.number)}
              </span>
              <span className="text-right text-base text-slate-600">{lastWashText(row)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-slate-900">{t.logTitle}</h2>
        <p className="mb-3 text-base text-slate-600">{t.logIntro}</p>

        {!loading && log.length === 0 ? <Note>{t.logEmpty}</Note> : null}

        <ul className="divide-y-2 divide-slate-100 border-y-2 border-slate-100">
          {log.map((booking) => (
            <li key={booking.id} className="py-3">
              <p className="text-base text-slate-500 tabular-nums">
                {formatFullDay(booking.date)} · {slotLabel(booking.slot_index)}
              </p>
              <p className="text-lg text-slate-900">{logLine(booking, apartmentsById)}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-center text-base text-slate-500">{t.logRetention(LOG_DAYS)}</p>
    </div>
  )
}

function lastWashText(row: LastWash): string {
  if (!row.last_wash_date || row.last_wash_slot_index === null) return t.lastWashNever
  return `${formatFullDay(row.last_wash_date)} · ${slotLabel(row.last_wash_slot_index)}`
}

/**
 * Every line must read plainly to someone standing in the laundry room. A
 * taken-over booking in particular has to name both apartments and the time,
 * because that is the record the whole app exists to keep.
 */
function logLine(booking: Booking, apartmentsById: Map<string, Apartment>): string {
  const holder = apartmentsById.get(booking.apartment_id)?.number
  if (holder === undefined) return ''

  switch (booking.status) {
    case 'taken_over': {
      const claimer = booking.taken_over_by_apartment_id
        ? apartmentsById.get(booking.taken_over_by_apartment_id)?.number
        : undefined
      if (claimer === undefined || !booking.ended_at) return t.logBooked(holder)
      return t.logTakenOver(holder, claimer, formatTime(booking.ended_at))
    }

    case 'cancelled':
      return t.logCancelled(holder)

    case 'released':
      return booking.ended_at
        ? t.logReleased(holder, formatTime(booking.ended_at))
        : t.logBooked(holder)

    case 'active': {
      // An active booking carrying an original apartment is one that was claimed
      // from someone else — say so, rather than showing it as an ordinary wash.
      const takenFrom = booking.original_apartment_id
        ? apartmentsById.get(booking.original_apartment_id)?.number
        : undefined
      return takenFrom === undefined ? t.logBooked(holder) : t.logClaimed(holder, takenFrom)
    }
  }
}
