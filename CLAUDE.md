# Laundry booking app

A mobile-first web app for booking the shared laundry room in a Copenhagen apartment
building. It replaces the physical board where each apartment hangs a numbered padlock
on a time slot.

The reason the app exists: on the physical board, moving your padlock to your next slot
erased the evidence of your last wash, so nobody could tell who had been hogging the
drying rooms. **This app never erases history.**

## Stack

- Vite + React + TypeScript
- Tailwind CSS
- Supabase — Postgres, magic-link auth, row-level security (`@supabase/supabase-js`)
- Supabase CLI — every schema change is a migration file in `supabase/migrations/`,
  never ad-hoc SQL typed into a console
- vitest for tests
- Deploy target is Vercel. **Do not deploy from an agent session.**

Environment variables live in `.env` (git-ignored; `.env.example` is committed):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Domain

One laundry room. Booking a slot books the whole room — 3 washing machines and
2 tumble dryers. There is nothing smaller to book.

Five fixed slots every day, **always in Europe/Copenhagen, never the browser's
timezone**:

| index | time |
|---|---|
| 1 | 07:00–10:00 |
| 2 | 10:00–13:00 |
| 3 | 13:00–16:00 |
| 4 | 16:00–19:00 |
| 5 | 19:00–22:00 |

An apartment's identity is its number. No names, no avatars, no profile pictures.

## Rules

These rules are the entire product. Everything else is presentation. They are enforced
in `SECURITY DEFINER` Postgres functions — that is the single source of truth.

- **R1 — One future booking at a time.** An apartment may hold at most one active
  booking whose `starts_at` is still in the future. Once a booking's start time has
  passed it no longer counts, so whoever holds 07:00–10:00 is free to book their next
  slot from 07:00 onwards.
- **R2 — The past is permanent.** A booking whose start time has passed can never be
  deleted and never drops out of history. Only its status may change, and the original
  holder stays visible on the record.
- **R3 — Cancelling.** The holder may cancel a booking that has not started yet.
- **R4 — Releasing.** The holder may release a booking that has already started — e.g.
  they changed their mind and ran no wash. The slot becomes free for the rest of the
  period; the record stays visible.
- **R5 — Grace window.** Every booking gets `grace_starts_at = greatest(starts_at, now())`
  at creation. Book ahead and the grace window starts when the slot starts; book
  mid-slot and it starts immediately.
- **R6 — Claiming.** Another apartment may claim a booking when *all* of: it is
  `active`; `now() > grace_starts_at + 30 minutes`; `now() < ends_at`. The old booking
  becomes `taken_over` with the claimer recorded on it, and a fresh `active` booking is
  created for the claimer with `grace_starts_at = now()`. Claiming does **not** count
  against R1 — the claimer is taking a slot happening right now, not reserving a future
  one.
- **R7 — Booking horizon.** Bookings may be made at most `BOOKING_HORIZON_DAYS = 14`
  days ahead. Defined once as a constant.
- **R8 — Rebooking a freed slot.** A slot that is free but already in progress can be
  booked normally for the remainder of the period. Booking checks therefore test
  `ends_at > now()`, **not** `starts_at > now()`.

### The rule that matters most

The app cannot see whether the machines are running. It only knows what people tell it.
**Never write logic that assumes physical state.** No auto-forfeit for "didn't start",
no automatic expiry, no cron jobs, no scheduled functions, ever. A slot changes hands
only when a human deliberately acts.

## Enforcement model

RLS grants authenticated users `SELECT` on `apartments` and `bookings` and **nothing
else** — there are no insert, update or delete policies at all. The frontend therefore
physically cannot write to the tables; every mutation goes through an RPC:

- `claim_apartment(p_number int)` — links the calling user to an apartment number
- `book_slot(p_date date, p_slot int)` — R1, R7, R8, free-slot check, R5
- `cancel_booking(p_id uuid)` — R3 + ownership
- `release_booking(p_id uuid)` — R4 + ownership
- `claim_slot(p_id uuid)` — R6, old row update + new row insert in one transaction
- `admin_reassign_apartment(...)`, `admin_remove_account(...)` — admin-only

A partial unique index on `bookings (date, slot_index) where status = 'active'` is what
makes two people booking the same slot in the same second impossible. Do not drop it.

`starts_at` / `ends_at` are computed from `date` + `slot_index` in Europe/Copenhagen
inside the database functions, never in the browser.

## Style

Plain and legible. Large tap targets — this gets used one-handed while carrying a
laundry basket. Must work on a small phone. No animations. UI text is English for now
but every user-facing string lives in `src/lib/strings.ts` so it can be translated to
Danish in one pass.

## Out of scope

Do not build and do not suggest: notifications or email beyond the login link, drying
room booking, machine fault reporting, usage statistics or charts, payments, chat,
comments, a dark mode toggle, an onboarding tour, a PWA manifest, an i18n framework.

## Phases

- [x] Phase 1 — `CLAUDE.md`
- [x] Phase 2 — Database: migrations, RLS, RPC functions, `supabase/tests/rules.sql`
- [x] Phase 3 — Auth (magic link) and apartment claim
- [x] Phase 4 — Booking grid (the main screen) + `src/lib/slotState.ts` with tests
- [ ] Phase 5 — History: last wash by apartment, 60-day log
- [ ] Phase 6 — Admin: reassign apartment number, remove account

Each phase is committed before the next one starts.

## Decisions made

Appended as work proceeds. If a design decision is unclear, take the simpler option and
record it here rather than stopping to ask.

- **Neither Docker nor `psql` is available on this machine**, and the Supabase CLI was
  not installed globally (it is now a dev dependency — use `npx supabase`). This means
  `supabase/tests/rules.sql` is written and committed but has **not been executed**
  against a database in the session that wrote it. Nothing in `supabase/migrations/`
  has been applied either. Before trusting the rules end to end, run:
  ```
  npx supabase start
  npm run db:test
  ```
  Expect to fix small SQL slips on that first run.
- **R1 only applies when the slot being booked is in the future.** R1 caps how many
  *future* bookings an apartment holds, so taking a slot that is already running (R8)
  is allowed even when the apartment already has its next wash booked — the same
  reasoning the spec gives for exempting claims (R6). `book_slot` therefore guards its
  R1 check with `v_starts_at > now()`.
- **A booking whose slot has finished stays `active`.** There is no "completed" status
  and nothing sweeps finished bookings — that would be a scheduled job, which is
  forbidden. `active` means "this booking stands"; the timestamps say whether it is past,
  running or upcoming. Consequently `release_booking` refuses a slot that is already over
  (there is no remainder to free) and `cancel_booking` refuses one that has started.
- **R2 is enforced by a trigger as well as by RLS.** `bookings_history_guard` rejects
  deleting any booking whose slot has started, and rejects any update that changes who
  held it, which slot it was, or when it ran. Only `status`, `ended_at` and
  `taken_over_by_apartment_id` may move.
- `apartments` rows are created by a seed migration, not self-service. `claim_apartment`
  links a user to an apartment number that already exists; it does not invent apartments.
  The seed creates apartments 1–24 — **adjust this to the real building** in a new
  migration.
- `apartments.user_id` is `on delete set null`, so removing an account leaves the
  apartment and all its bookings intact with the holder still visible (R2).
- `BOOKING_HORIZON_DAYS` exists twice: `public.booking_horizon_days()` in SQL (which is
  authoritative and enforced) and `BOOKING_HORIZON_DAYS` in `src/lib/constants.ts` (which
  only decides how many days the grid draws). Keep them equal. Fetching it at runtime was
  the alternative and was rejected as more machinery than the problem deserves.
- The R8 check in `rules.sql` needs a slot that really is in progress, so it runs only
  between 07:00 and 22:00 Copenhagen time and prints `SKIP` otherwise. Bookings "in the
  past" elsewhere in that script are inserted directly with crafted timestamps, because
  `now()` cannot be moved; their `date`/`slot_index` columns are just labels there, since
  every rule except `book_slot` keys off the timestamps.
- Slot times are stored as a lookup in SQL (`slot_start_hour` = 7, 10, 13, 16, 19; every
  slot is 3 hours) rather than a separate `slots` table. Five fixed slots are part of the
  domain, not configuration.
- `apartments` rows are created by an admin/seed migration, not self-service.
  `claim_apartment` links a user to an existing apartment number; it does not invent
  apartments. A seed migration creates apartments 1–24 — adjust for the real building.
- The grid renders 14 days starting today, matching `BOOKING_HORIZON_DAYS`. Today's
  already-finished slots are shown greyed out rather than hidden, so the day's layout
  stays stable.
- Times in the UI are formatted with `Intl.DateTimeFormat` pinned to `Europe/Copenhagen`,
  so a phone travelling abroad still shows Copenhagen times.
- "Claimable" in the UI is computed from a client clock that ticks every 30 s. The client
  is only deciding what to *offer*; the database re-checks R6 on every claim.
- Tailwind v4 via `@tailwindcss/vite`, no `tailwind.config.js`. The one theme override is
  `--default-transition-duration: 0s`, which turns off Tailwind's transitions globally
  rather than relying on nobody adding an animation later.
- No router. The app is three screens reached by a bottom tab bar and holds no state
  worth putting in a URL, so a router would be a dependency earning nothing.
- Shared UI primitives live in `src/components/ui.tsx`. Buttons and inputs are `min-h-14`
  (56px) — the one-handed-with-a-basket constraint, applied in one place.
- The grid draws **today plus the whole horizon** (15 day headings), not 14, so the last
  bookable day is reachable by scrolling. Showing exactly 14 would hide a day that
  `book_slot` accepts.
- Days are rendered as full-width rows rather than a 5-column grid. A column per slot on
  a 375px screen gives 70px cells, which fails the one-handed-with-a-basket test.
- Booking happens on the first tap, with no confirmation — it is undoable by cancelling.
  Cancel and release do ask first: cancelling gives up a slot someone else may take
  within seconds, and releasing is permanent in the record.
- Cells that offer no action are still tappable and explain why (`blockedMessage`).
  Disabling them would have silently swallowed the "clear message" the spec asks for
  when R1 or R7 blocks a booking.
- `src/lib/time.ts` resolves Copenhagen wall-clock times with a two-pass offset lookup
  via `Intl`, rather than pulling in a date library. Its tests run under
  `TZ=America/Los_Angeles` in CI terms — they assert absolute instants, so they fail if
  anything starts trusting the host timezone.
