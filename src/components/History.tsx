import { describeBooking } from '../lib/describeBooking'
import { strings } from '../lib/strings'
import { formatFullDay, slotLabel } from '../lib/time'
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
              <p className="text-lg text-slate-900">{describeBooking(booking, apartmentsById)}</p>
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
