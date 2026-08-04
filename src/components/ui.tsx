import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Shared bits of chrome. Everything here is sized for a thumb: this app is used
 * one-handed while carrying a laundry basket, so nothing is smaller than 48px.
 */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger'
}

const variants = {
  primary: 'bg-slate-900 text-white active:bg-slate-700 disabled:bg-slate-400',
  secondary:
    'bg-white text-slate-900 border-2 border-slate-300 active:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-red-700 text-white active:bg-red-800 disabled:bg-red-300',
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`min-h-14 w-full rounded-lg px-4 text-lg font-semibold ${variants[variant]} ${className}`}
    />
  )
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-4 pt-6 pb-10">{children}</div>
  )
}

export function Heading({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-bold text-slate-900">{children}</h1>
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-base leading-relaxed text-slate-600">{children}</p>
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p
      role="alert"
      className="rounded-lg border-2 border-red-200 bg-red-50 px-3 py-3 text-base font-medium text-red-800"
    >
      {children}
    </p>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-base font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="min-h-14 w-full rounded-lg border-2 border-slate-300 px-4 text-lg text-slate-900 focus:border-slate-900 focus:outline-none"
    />
  )
}

/**
 * A plain modal. No animation, and the backdrop is opaque enough to make the
 * dialog the only thing on screen — these decisions are irreversible enough to
 * deserve the interruption.
 */
export function Dialog({
  title,
  children,
  onDismiss,
}: {
  title: string
  children: ReactNode
  onDismiss: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 px-3 pb-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss()
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5">
        <h2 className="mb-3 text-xl font-bold text-slate-900">{title}</h2>
        {children}
      </div>
    </div>
  )
}
