import { strings } from '../lib/strings'
import type { Apartment } from '../lib/types'
import { Button, Dialog } from './ui'

const t = strings.contactDialog

/** A phone number the resident entered themselves, shown as a tappable `tel:` link. */
export function ContactDialog({
  apartment,
  onDismiss,
}: {
  apartment: Apartment
  onDismiss: () => void
}) {
  return (
    <Dialog title={t.title(apartment.number)} onDismiss={onDismiss}>
      <div className="space-y-3">
        {apartment.name ? (
          <p className="text-lg text-slate-900">{apartment.name}</p>
        ) : null}
        {apartment.phone ? (
          <a href={`tel:${apartment.phone}`} className="block text-lg font-semibold text-sky-800 underline">
            {apartment.phone}
          </a>
        ) : null}
      </div>

      <div className="mt-5">
        <Button variant="secondary" onClick={onDismiss}>
          {t.close}
        </Button>
      </div>
    </Dialog>
  )
}
