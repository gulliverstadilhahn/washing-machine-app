-- Laundry room booking — the rules.
--
-- Every mutation the app can make is one of these functions. RLS grants the
-- frontend SELECT and nothing else, so this file is the only way rows change
-- and therefore the only place the rules exist.
--
-- Nothing here assumes physical state. The app cannot see whether a machine is
-- running; it only knows what people tell it. There is no auto-forfeit, no
-- expiry, no scheduled job. A slot changes hands only when a human acts.

-- ---------------------------------------------------------------------------
-- Who is calling
-- ---------------------------------------------------------------------------

create or replace function public.current_apartment_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.apartments where user_id = auth.uid()
$$;

create or replace function public.require_apartment()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_apartment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  select id into v_apartment_id from public.apartments where user_id = auth.uid();

  if v_apartment_id is null then
    raise exception 'Your account is not linked to an apartment yet.'
      using errcode = '42501';
  end if;

  return v_apartment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_apartment — link the calling account to an apartment number
-- ---------------------------------------------------------------------------

create or replace function public.claim_apartment(p_number int)
returns public.apartments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_apartment public.apartments;
begin
  if v_user is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  if exists (select 1 from public.apartments where user_id = v_user) then
    raise exception 'Your account is already linked to an apartment.'
      using errcode = '42501';
  end if;

  select * into v_apartment
    from public.apartments
   where number = p_number
     for update;

  if not found then
    raise exception 'There is no apartment % in this building.', p_number
      using errcode = '23503';
  end if;

  if v_apartment.user_id is not null then
    raise exception 'Apartment % is already linked to another account. Ask an administrator.',
      p_number using errcode = '23505';
  end if;

  update public.apartments
     set user_id = v_user
   where id = v_apartment.id
  returning * into v_apartment;

  return v_apartment;
end;
$$;

-- ---------------------------------------------------------------------------
-- book_slot — R1, R5, R7, R8
-- ---------------------------------------------------------------------------

create or replace function public.book_slot(p_date date, p_slot int)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_apartment_id uuid := public.require_apartment();
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_booking public.bookings;
begin
  -- Raises if p_slot is not 1..5.
  select starts_at, ends_at into v_starts_at, v_ends_at
    from public.slot_bounds(p_date, p_slot);

  -- R7 — booking horizon.
  if p_date > public.copenhagen_today() + public.booking_horizon_days() then
    raise exception 'You can only book up to % days ahead.', public.booking_horizon_days()
      using errcode = '22023';
  end if;

  -- R8 — a slot already in progress can still be booked for the rest of the
  -- period, so this checks ends_at, not starts_at.
  if v_ends_at <= now() then
    raise exception 'That slot is already over.' using errcode = '22023';
  end if;

  -- R1 — at most one active booking whose start time is still in the future.
  -- A booking that has already started does not count, so the holder of the
  -- 07:00 slot is free to book their next one from 07:00.
  --
  -- The rule limits how many *future* bookings an apartment holds, so it only
  -- applies when the slot being booked is itself in the future. Taking a slot
  -- that is already running (R8) adds nothing to that count and is allowed even
  -- if the apartment has its next wash booked — the same reasoning that exempts
  -- claim_slot, where the claimer is taking a slot happening right now.
  if v_starts_at > now() and exists (
    select 1
      from public.bookings
     where apartment_id = v_apartment_id
       and status = 'active'
       and starts_at > now()
  ) then
    raise exception 'You already have a booking coming up. Cancel it before booking another.'
      using errcode = '42501';
  end if;

  begin
    insert into public.bookings (
      apartment_id, date, slot_index, starts_at, ends_at, grace_starts_at, status
    ) values (
      v_apartment_id, p_date, p_slot, v_starts_at, v_ends_at,
      -- R5 — book ahead and the grace window opens when the slot does; book
      -- mid-slot and it opens immediately.
      greatest(v_starts_at, now()),
      'active'
    )
    returning * into v_booking;
  exception
    when unique_violation then
      -- The partial unique index on (date, slot_index) where status = 'active'.
      raise exception 'That slot has just been booked by someone else.'
        using errcode = '23505';
  end;

  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_booking — R3
-- ---------------------------------------------------------------------------

create or replace function public.cancel_booking(p_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_apartment_id uuid := public.require_apartment();
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_id for update;

  if not found then
    raise exception 'That booking does not exist.' using errcode = '23503';
  end if;

  if v_booking.apartment_id <> v_apartment_id then
    raise exception 'That booking belongs to another apartment.' using errcode = '42501';
  end if;

  if v_booking.status <> 'active' then
    raise exception 'That booking is no longer active.' using errcode = '22023';
  end if;

  -- R3 — cancelling is only for slots that have not started. Once a slot has
  -- started the record is permanent (R2) and the action is release, not cancel.
  if v_booking.starts_at <= now() then
    raise exception 'That slot has already started. Release it instead.'
      using errcode = '22023';
  end if;

  update public.bookings
     set status = 'cancelled',
         ended_at = now()
   where id = p_id
  returning * into v_booking;

  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- release_booking — R4
-- ---------------------------------------------------------------------------

create or replace function public.release_booking(p_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_apartment_id uuid := public.require_apartment();
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_id for update;

  if not found then
    raise exception 'That booking does not exist.' using errcode = '23503';
  end if;

  if v_booking.apartment_id <> v_apartment_id then
    raise exception 'That booking belongs to another apartment.' using errcode = '42501';
  end if;

  if v_booking.status <> 'active' then
    raise exception 'That booking is no longer active.' using errcode = '22023';
  end if;

  -- R4 — releasing frees the rest of the period, so it only makes sense once
  -- the slot has started and while it is still running.
  if v_booking.starts_at > now() then
    raise exception 'That slot has not started yet. Cancel it instead.'
      using errcode = '22023';
  end if;

  if v_booking.ends_at <= now() then
    raise exception 'That slot is already over. There is nothing left to release.'
      using errcode = '22023';
  end if;

  -- The record stays visible in history with the holder on it (R2).
  update public.bookings
     set status = 'released',
         ended_at = now()
   where id = p_id
  returning * into v_booking;

  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_slot — R6
-- ---------------------------------------------------------------------------

create or replace function public.claim_slot(p_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_apartment_id uuid := public.require_apartment();
  v_old public.bookings;
  v_new public.bookings;
begin
  select * into v_old from public.bookings where id = p_id for update;

  if not found then
    raise exception 'That booking does not exist.' using errcode = '23503';
  end if;

  if v_old.apartment_id = v_apartment_id then
    raise exception 'That is your own booking.' using errcode = '22023';
  end if;

  if v_old.status <> 'active' then
    raise exception 'That booking is no longer active.' using errcode = '22023';
  end if;

  -- R6 — claimable only once the grace window has run out, and only while the
  -- slot is still running.
  if now() <= v_old.grace_starts_at + public.grace_period() then
    raise exception 'This slot cannot be claimed yet. It becomes claimable 30 minutes after it starts.'
      using errcode = '42501';
  end if;

  if now() >= v_old.ends_at then
    raise exception 'That slot is already over.' using errcode = '22023';
  end if;

  -- The old holder stays on the record; the claim is recorded against it and
  -- is visible to everyone in the building (R2).
  update public.bookings
     set status = 'taken_over',
         ended_at = now(),
         taken_over_by_apartment_id = v_apartment_id
   where id = p_id;

  -- Same transaction: the old row leaves 'active' before the new one arrives,
  -- so the partial unique index is satisfied throughout.
  insert into public.bookings (
    apartment_id, date, slot_index, starts_at, ends_at, grace_starts_at,
    status, original_apartment_id
  ) values (
    v_apartment_id, v_old.date, v_old.slot_index, v_old.starts_at, v_old.ends_at,
    -- A fresh grace window: the claimer is now the one who could be claimed from.
    now(),
    'active', v_old.apartment_id
  )
  returning * into v_new;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

-- Postgres grants EXECUTE to PUBLIC on new functions; take it back so only
-- signed-in residents can call these.
revoke execute on function public.claim_apartment(int) from public;
revoke execute on function public.book_slot(date, int) from public;
revoke execute on function public.cancel_booking(uuid) from public;
revoke execute on function public.release_booking(uuid) from public;
revoke execute on function public.claim_slot(uuid) from public;
revoke execute on function public.require_apartment() from public;
revoke execute on function public.current_apartment_id() from public;

grant execute on function public.claim_apartment(int) to authenticated;
grant execute on function public.book_slot(date, int) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.release_booking(uuid) to authenticated;
grant execute on function public.claim_slot(uuid) to authenticated;
grant execute on function public.current_apartment_id() to authenticated;
