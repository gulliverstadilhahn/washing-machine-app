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

An apartment's identity is its number, plus a contact name and phone number the
resident sets themselves (added post-launch — see "Changes after initial build" below;
the original spec here said "no names, no avatars, no profile pictures", and this is a
deliberate, explicit reversal of that, not drift). Still no avatars, no profile
pictures, no other profile fields.

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
- **R6 amendment — claims get a shorter grace period.** A booking created by
  `claim_slot` (identifiable by `original_apartment_id is not null`) gets a 15-minute
  grace period before a further apartment may claim it, not R6's 30 minutes — see
  "Changes after initial build" for why. Because the fresh row `claim_slot` creates for
  *any* claim always sets `original_apartment_id`, a claim-of-a-claim automatically gets
  the 15-minute rule too, with no depth tracking needed.
  `public.claim_grace_period()` in SQL is authoritative; `CLAIM_GRACE_MINUTES` in
  `src/lib/constants.ts` mirrors it.
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

- `apartment_login_status(p_number int)` — is a number claimed yet? Callable by `anon`
  too, since login happens before there's a session (see "Changes after initial build")
- `claim_apartment(p_number int, p_name text, p_phone text)` — links the calling user to
  an apartment number and records how to reach them
- `update_contact_details(p_name text, p_phone text)` — "My page" editing your own name
  and phone later
- `book_slot(p_date date, p_slot int)` — R1, R7, R8, free-slot check, R5
- `cancel_booking(p_id uuid)` — R3 + ownership
- `release_booking(p_id uuid)` — R4 + ownership
- `claim_slot(p_id uuid)` — R6 (+ amendment below), old row update + new row insert in
  one transaction
- `admin_reset_apartment(p_number int)` — admin-only; clears a login and its contact
  details so the number can be claimed again

A partial unique index on `bookings (date, slot_index) where status = 'active'` is what
makes two people booking the same slot in the same second impossible. Do not drop it.

`starts_at` / `ends_at` are computed from `date` + `slot_index` in Europe/Copenhagen
inside the database functions, never in the browser.

## Style

Plain and legible. Large tap targets — this gets used one-handed while carrying a
laundry basket. Must work on a small phone. UI text is **Danish** — translated in one
pass, exactly as planned, once real residents needed it (see "Changes after initial
build"). Every user-facing string still lives in one place, `src/lib/strings.ts`; the
database's own exception messages (shown verbatim in the UI) are Danish too, in
`supabase/migrations/20260805090800_danish_messages.sql`. One exception to "no
animations": a live mm:ss countdown was added deliberately for the claim-grace window,
overriding an earlier static-time design call — see below.

## Out of scope

Do not build and do not suggest: notifications or email beyond the login link, drying
room booking, machine fault reporting, usage statistics or charts, payments, chat,
comments, a dark mode toggle, an onboarding tour, a PWA manifest, an i18n framework.

## Phases

- [x] Phase 1 — `CLAUDE.md`
- [x] Phase 2 — Database: migrations, RLS, RPC functions, `supabase/tests/rules.sql`
- [x] Phase 3 — Auth (magic link) and apartment claim
- [x] Phase 4 — Booking grid (the main screen) + `src/lib/slotState.ts` with tests
- [x] Phase 5 — History: last wash by apartment, 60-day log
- [x] Phase 6 — Admin: reassign apartment number, remove account

Each phase is committed before the next one starts.

## Decisions made

Appended as work proceeds. If a design decision is unclear, take the simpler option and
record it here rather than stopping to ask.

- **Neither Docker nor `psql` is available on this machine**, and the Supabase CLI was
  not installed globally (it is now a dev dependency — use `npx supabase`). This means
  `supabase/tests/rules.sql` has never been executed anywhere — not locally (no Docker for
  `supabase start`) and not against the live project either (it's a destructive test
  script meant for a disposable local database, not something to run against real data).
  Before trusting the rules end to end, get Docker on some machine and run:
  ```
  npx supabase start
  npm run db:test
  ```
  Expect to fix small SQL slips on that first run. This is separate from the live
  project's schema, which *is* up to date — see "Changes after initial build" — migrations
  get applied there directly with `supabase db push --linked`, which doesn't need Docker.
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
- **"Last wash" counts only bookings that have already started.** The spec says "most
  recent booking that was not cancelled"; an upcoming booking is not a wash, and counting
  it would make an apartment look recently active when it has not washed for months —
  the opposite of what the section is for. `released` and `taken_over` bookings do count,
  as the spec says: only `cancelled` is excluded.
- Apartments that have never washed sort to the very top of "Last wash", above the
  longest-ago washers. They are the extreme case of the thing the list is looking for.
- `last_wash_by_apartment` is a `security_invoker` view, so it is read under the caller's
  RLS rather than the view owner's. A plain view would have been a way around the
  policies even though the policies currently allow reading everything.
- The log covers bookings whose **date** falls in the last 60 days, so an upcoming
  booking is not listed as history. Apartment numbers are joined client-side from the
  apartments map rather than by PostgREST embedding, because `bookings` has three foreign
  keys to `apartments` and the disambiguating hint syntax is harder to read than a Map.
- **There is no UI for making someone an admin**, deliberately — an admin screen that
  can create admins is a way to lose control of the building's app. Set the first one by
  migration: `update public.apartments set is_admin = true where number = <n>;`
- The admin screen is hidden unless `is_admin`, but that is only tidiness. The check that
  matters is `require_admin()` inside `admin_reassign_apartment` and
  `admin_remove_account`, and it cannot be reached around.
- `admin_remove_account` refuses to remove the caller's own account. The building may have
  exactly one admin, and there is no way back in from inside the app.
- Reassigning to an account that already holds another apartment is refused rather than
  silently moved, because moving it would quietly leave an apartment unlinked.
- The admin "reassign" flow has no unlink option. Removing the account frees the
  apartment (`user_id` is `on delete set null`), which covers the move-out case without a
  third operation — the spec says admin does these two things and nothing else.

## Changes after initial build

The six phases above were the original spec. This section records what changed once the
app was actually running against a real Supabase project and got used.

- **Live infrastructure is set up.** The app runs against a real Supabase project
  (`twjvqtkquuzaiuidnqfo`), not a placeholder — all 6 migrations are applied there. GitHub
  remote is `gulliverstadilhahn/washing-machine-app`, pushed on request only (local
  commits happen freely; pushing to GitHub and deploying to Vercel both wait for an
  explicit "push this" / "deploy this" from the user). Local dev still has neither Docker
  nor `psql`, so `supabase/tests/rules.sql` is still unrun — pushes to the live project go
  through `supabase db push --linked`, applying the same committed migration files, which
  keeps to the "migrations only, no ad-hoc SQL" rule even without a local database.
- **Contact details reverse the original "no names" rule, on explicit request.**
  `apartments.name` and `apartments.phone` are set at claim time (both required) and
  editable later from "My page". They're visible to every signed-in resident under the
  same RLS policy that already exposed apartment numbers — no new privacy boundary was
  needed. `admin_reassign_apartment` now clears `name`/`phone` on reassignment: leaving
  the outgoing resident's contact details attached to an apartment they no longer live in
  would be actively wrong, not merely stale.
- **The booking grid is select-then-act, not tap-to-book.** Tapping a slot only selects
  it (a ring highlight); the row expands to show either a single contextual action button
  (`Book this slot` / `Cancel booking` / `Release slot` / `Claim this slot`, driven by
  `slotState`'s existing `action` field) or, if none applies, the reason why. This was a
  direct fix for booking being unclear: previously the first tap booked the slot
  immediately, and it wasn't obvious anything had happened. Now booking takes two
  deliberate taps, and after it succeeds the slot stays selected and the button changes
  to "Cancel booking" — that state change is the confirmation, no toast needed. Cancel,
  release and claim still open their existing confirmation dialogs on top of this; nothing
  about those flows changed, only what triggers them.
- **A "Contact" button sits next to any slot held by someone else** (not shown on your
  own bookings), whenever that apartment has a name or phone on record. It's a sibling
  button next to the row, not nested inside it — HTML doesn't allow nested `<button>`s,
  which is what forced the row to stop being a single full-width button. Tapping it opens
  `ContactDialog` with a `tel:` link. If an apartment has set neither field, the button is
  simply omitted rather than shown disabled or opening an empty dialog.
- **The grid replaced its 15-day scroll with a horizontal date strip plus one day's
  slots.** A day chip strip (`Wed 5`, `Thu 6`, …) sits above a single day's 5 rows;
  selecting a date resets any selected slot. This was chosen over a full month-grid
  calendar as the simpler option that still satisfies "a calendar feature with all the
  dates" — a month grid would need empty-cell padding and month labels for what is only
  ever a 15-day window, and would cost more mobile width than it returns.
- **New "My page" tab**, visible to everyone (not admin-gated): edit your own name/phone
  via `update_contact_details`, and see every booking your apartment has ever made
  (`useMyBookings` — no date window, unlike the building-wide 60-day log, since it's
  scoped to one apartment's own history). Its booking-row text reuses
  `describeBooking` (`src/lib/describeBooking.ts`), extracted from `History.tsx` so both
  screens describe a booking the same way instead of drifting apart.
- Visual verification for this round used a temporary auth bypass (a hardcoded preview
  apartment swapped into `App.tsx`, reverted immediately after) since real interactive
  states — an occupied slot, a claimable one — need actual booking rows, and nobody had
  completed a real login yet. The RPC calls, error surfacing, and refresh cycle were
  confirmed against the live database this way (an unauthenticated `book_slot` call
  correctly came back "You must be signed in." and rendered in the message banner); the
  claim/contact-link states still need a real second resident to verify against live data.
- **Claimed bookings get a 15-minute grace period, not 30 (R6 amendment).** Confirmed
  directly by the product owner after live testing surfaced a mismatch between what
  people expect ("I can see nobody's washing, why can't I take it?") and R6 as
  originally specified: someone claiming a slot was, by definition, already standing in
  the laundry room to check no wash was running, so they have less excuse for delay than
  someone who booked ahead and needs travel time. The original 30-minute rule for
  *original* bookings is unchanged and confirmed correct. Enforced in
  `supabase/migrations/20260805090700_claim_grace_period.sql` via a new
  `public.claim_grace_period()` alongside `public.grace_period()`, chosen by
  `case when original_apartment_id is not null` inside `claim_slot`. Mirrored
  client-side in `src/lib/slotState.ts` (`SlotBooking.isClaim`) purely to decide what
  the UI offers — the database re-validates on every claim.
- **The grid now shows the actual wall-clock time a slot becomes claimable, and the time
  your own mid-slot booking stops being protected**, instead of only a static "30
  minutes after it starts" sentence. This was the real fix for the confusion above: the
  30-minute protection on a fresh mid-slot booking was already correct, but invisible,
  so nobody could see or trust it. `slotState` computes `claimableAt` from whichever
  grace duration applies (30 or 15 minutes per the amendment above), and `BookingGrid`
  renders it with the existing `formatTime` helper. Shown as a fixed time ("Claimable at
  17:13" / "yours until 17:01"), not a ticking countdown — the grid already re-renders
  every 30s via `useNow()`, so a wall clock stays fresh on that same cadence for free,
  and a live mm:ss countdown would need its own re-render loop, which conflicts with the
  "No animations" style rule for no real benefit.
- **A claimed slot now gets its own distinct appearance and a live countdown, reversing
  the earlier static-time design call.** Confirmed directly: a slot someone just claimed
  looked identical to an ordinary booking, which hid the fact that it's a temporary hold
  nobody has acted on yet. New `SlotAppearance` value `claim-pending` (violet, distinct
  from the grey "taken" and amber "claimable") shows on the row itself — not only once
  expanded — with a badge and a live `Countdown` (`src/components/ui.tsx`, its own 1s
  `setInterval`, scoped to just that component rather than dropping the whole grid to a
  1s render cadence). The claimer sees an urgent "start your wash within" + countdown in
  place of the calmer "yours until HH:MM" reassurance used for an ordinary booking. This
  intentionally supersedes the earlier "static wall-clock time, not a ticking countdown"
  decision above — that reasoning (no per-second re-render, stays inside "no
  animations") was sound for the general case, but the building explicitly wanted the
  ticking urgency for this specific, short-lived, action-required state.
- **Fixed a real inconsistency the claim dialog would otherwise have shown**: its
  legally-precise wording used to hardcode "30 minutes" regardless of whether the claim
  was of an original booking (30 min) or of an earlier claim (15 min, the R6 amendment
  above). `ClaimDialog` now takes a `graceMinutes` prop computed at the point a claim is
  offered (`booking.original_apartment_id ? CLAIM_GRACE_MINUTES : GRACE_MINUTES` in
  `BookingGrid.tsx`), so the dialog always states the number that actually applied.
- **Everything user-facing is now Danish** — the building's residents are Danish, and
  this was the explicit intended use of `src/lib/strings.ts` from the start ("keep all
  user-facing strings in one file so it can be translated to Danish in one pass"). Done
  in one pass, as planned. The database's own `raise exception` messages are Danish too
  (`supabase/migrations/20260805090800_danish_messages.sql`, a `create or replace` of
  every function that only touches message text, never logic or errcodes) — those reach
  residents verbatim through the same error banner as any other RPC failure, so leaving
  them in English would have been a half-translation. `supabase/tests/rules.sql` needed
  no changes: its assertions only check whether a call succeeded or failed, never the
  exact wording of a failure.
