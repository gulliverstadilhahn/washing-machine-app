import { strings } from '../lib/strings'
import { Button, Dialog } from './ui'

const t = strings.claimDialog

/**
 * The app cannot see whether the machines are running. This dialog is the only
 * thing standing between a claim and someone's laundry being interrupted, so
 * the wording is deliberate — do not shorten it, and do not add a "don't show
 * this again" option.
 */
export function ClaimDialog({
  apartmentNumber,
  graceMinutes,
  busy,
  onCancel,
  onConfirm,
}: {
  apartmentNumber: number
  /** 15 for a claim of a claim, 30 for an original booking — R6 amendment. */
  graceMinutes: number
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog title={t.title} onDismiss={onCancel}>
      <div className="space-y-3">
        {t.body(apartmentNumber, graceMinutes).map((paragraph) => (
          <p key={paragraph} className="text-base leading-relaxed text-slate-700">
            {paragraph}
          </p>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        <Button onClick={onConfirm} disabled={busy}>
          {busy ? t.claiming : t.confirm}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {t.cancel}
        </Button>
      </div>
    </Dialog>
  )
}
