/**
 * Login is by apartment number and password, not email — see the migration
 * `20260805090600_number_password_auth.sql` for why. Supabase's auth system
 * still wants an email address under the hood, so each apartment gets a
 * synthetic one that is never sent to and never leaves this app. Keep this in
 * one place: the format only has to change once here, not everywhere it's used.
 */

const EMAIL_DOMAIN = 'apartments.internal'

export function apartmentEmail(number: number): string {
  return `apt${number}@${EMAIL_DOMAIN}`
}
