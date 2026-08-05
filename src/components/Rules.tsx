import { strings } from '../lib/strings'

const t = strings.rules

/**
 * Static, informational — no data fetching, nothing interactive beyond a
 * tel: link. Everything here is either how the app works (mirrors the actual
 * rules in the database) or the building's own house rules, reproduced from
 * the sign posted in the laundry room. The app enforces the former, not the
 * latter — that distinction is called out explicitly rather than blurred.
 */
export function Rules() {
  return (
    <div className="pb-6">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">{t.title}</h1>

      <Section title={t.howToTitle} items={t.howTo} ordered />
      <Section title={t.rulesTitle} items={t.rules} />
      <Section title={t.houseRulesTitle} intro={t.houseRulesIntro} items={t.houseRules} />

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-bold text-slate-900">{t.faultTitle}</h2>
        <p className="text-base leading-relaxed text-slate-700">
          {t.faultBody}{' '}
          <a href={`tel:${t.faultPhone}`} className="font-semibold text-sky-800 underline">
            {t.faultPhone}
          </a>
        </p>
      </section>

      <Section title={t.whatsNewTitle} items={t.whatsNew} />
    </div>
  )
}

function Section({
  title,
  intro,
  items,
  ordered = false,
}: {
  title: string
  intro?: string
  items: readonly string[]
  ordered?: boolean
}) {
  const List = ordered ? 'ol' : 'ul'
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-bold text-slate-900">{title}</h2>
      {intro ? <p className="mb-3 text-base text-slate-600">{intro}</p> : null}
      <List className={`space-y-2 ${ordered ? 'list-decimal pl-5' : 'list-disc pl-5'}`}>
        {items.map((item) => (
          <li key={item} className="text-base leading-relaxed text-slate-700">
            {item}
          </li>
        ))}
      </List>
    </section>
  )
}
