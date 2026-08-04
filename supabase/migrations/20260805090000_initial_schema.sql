-- Laundry room booking — schema.
--
-- One laundry room, five fixed slots a day, one identity per apartment (its number).
-- The whole product is the rules in CLAUDE.md; they are enforced in SECURITY DEFINER
-- functions (next migration), never in the browser.

-- ---------------------------------------------------------------------------
-- Constants
-- ---------------------------------------------------------------------------

-- How far ahead a slot may be booked. Defined once, here.
create or replace function public.booking_horizon_days()
returns int
language sql
immutable
as $$ select 14 $$;

comment on function public.booking_horizon_days() is
  'R7: bookings may be made at most this many days ahead.';

-- How long a holder has before anyone else may claim their slot.
create or replace function public.grace_period()
returns interval
language sql
immutable
as $$ select interval '30 minutes' $$;

comment on function public.grace_period() is
  'R6: a slot becomes claimable this long after grace_starts_at.';

-- ---------------------------------------------------------------------------
-- Slot arithmetic
-- ---------------------------------------------------------------------------

-- The five slots are part of the domain, not configuration: 07-10, 10-13, 13-16,
-- 16-19, 19-22, every day. Bounds are computed from the wall clock in
-- Europe/Copenhagen, so they stay correct across daylight saving changes (the
-- EU switch happens at 02:00-03:00 local, outside every slot).
create or replace function public.slot_bounds(
  p_date date,
  p_slot int,
  out starts_at timestamptz,
  out ends_at timestamptz
)
language plpgsql
immutable
as $$
declare
  v_hour int;
begin
  v_hour := case p_slot
              when 1 then 7
              when 2 then 10
              when 3 then 13
              when 4 then 16
              when 5 then 19
            end;

  if v_hour is null then
    raise exception 'There is no slot %. Slots are numbered 1 to 5.', p_slot
      using errcode = '22023';
  end if;

  starts_at := (p_date + make_time(v_hour, 0, 0)) at time zone 'Europe/Copenhagen';
  ends_at := (p_date + make_time(v_hour + 3, 0, 0)) at time zone 'Europe/Copenhagen';
end;
$$;

comment on function public.slot_bounds(date, int) is
  'Start and end of a slot in Europe/Copenhagen. Never computed in the browser.';

-- Today, in Europe/Copenhagen — not the server's timezone and not the browser's.
create or replace function public.copenhagen_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Europe/Copenhagen')::date $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.apartments (
  id       uuid primary key default gen_random_uuid(),
  number   int not null unique,
  -- Kept when an account is removed: the apartment stays, it just needs
  -- linking to a new account. Its bookings must never lose their holder.
  user_id  uuid unique references auth.users (id) on delete set null,
  is_admin boolean not null default false
);

comment on table public.apartments is
  'One row per apartment in the building. The number is the only identity.';

create table public.bookings (
  id                         uuid primary key default gen_random_uuid(),
  apartment_id               uuid not null references public.apartments (id),
  date                       date not null,
  slot_index                 int not null check (slot_index between 1 and 5),
  starts_at                  timestamptz not null,
  ends_at                    timestamptz not null,
  -- R5: greatest(starts_at, now()) at creation.
  grace_starts_at            timestamptz not null,
  status                     text not null
                               check (status in ('active', 'cancelled', 'released', 'taken_over')),
  created_at                 timestamptz not null default now(),
  -- When the booking stopped being active. Null while active.
  ended_at                   timestamptz,
  -- Set on the old row when someone claims the slot (R6).
  taken_over_by_apartment_id uuid references public.apartments (id),
  -- Set on the new row when a slot is claimed: who held it before.
  original_apartment_id      uuid references public.apartments (id)
);

comment on table public.bookings is
  'R2: rows are never deleted once their slot has started. Only status changes.';

-- This is what makes two people booking the same slot in the same second
-- impossible. Do not drop it.
create unique index bookings_one_active_per_slot
  on public.bookings (date, slot_index)
  where status = 'active';

create index bookings_apartment_starts_at on public.bookings (apartment_id, starts_at desc);
create index bookings_starts_at on public.bookings (starts_at desc);

-- ---------------------------------------------------------------------------
-- R2 — the past is permanent
-- ---------------------------------------------------------------------------

-- Belt and braces alongside RLS: even a mistaken migration or a bug in a
-- SECURITY DEFINER function cannot rewrite history.
create or replace function public.bookings_history_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.starts_at <= now() then
      raise exception 'A booking whose slot has started can never be deleted.'
        using errcode = '2F004';
    end if;
    return old;
  end if;

  -- Who held the slot, which slot it was, and when it ran are immutable for
  -- every booking. Only status, ended_at and taken_over_by_apartment_id move.
  if new.id is distinct from old.id
     or new.apartment_id is distinct from old.apartment_id
     or new.date is distinct from old.date
     or new.slot_index is distinct from old.slot_index
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.grace_starts_at is distinct from old.grace_starts_at
     or new.created_at is distinct from old.created_at
     or new.original_apartment_id is distinct from old.original_apartment_id
  then
    raise exception 'A booking record cannot be rewritten; only its status can change.'
      using errcode = '2F004';
  end if;

  return new;
end;
$$;

create trigger bookings_history_guard
  before update or delete on public.bookings
  for each row execute function public.bookings_history_guard();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- Everyone signed in can read everything: who booked what is public to the
-- building, and that visibility is the point of the app. Nobody can write —
-- there are deliberately no insert, update or delete policies. Every mutation
-- goes through a SECURITY DEFINER function, so the rules live in one place.

alter table public.apartments enable row level security;
alter table public.bookings enable row level security;

revoke all on public.apartments from anon, authenticated;
revoke all on public.bookings from anon, authenticated;

grant select on public.apartments to authenticated;
grant select on public.bookings to authenticated;

create policy apartments_select_authenticated
  on public.apartments for select to authenticated
  using (true);

create policy bookings_select_authenticated
  on public.bookings for select to authenticated
  using (true);
