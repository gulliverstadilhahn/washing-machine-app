-- Everything user-facing goes to Danish, including the messages the database
-- itself raises — those reach residents verbatim via the frontend's error
-- banner (see errorMessage() in src/lib/supabase.ts), so they are as much
-- user-facing text as anything in src/lib/strings.ts.
--
-- Every function below is replaced purely to translate its raise exception
-- text. No rule, no check, no errcode, no control flow changes here — only
-- message strings. Where a function's logic needs re-reading to confirm that,
-- see the migration that originally introduced it.

-- ---------------------------------------------------------------------------
-- slot_bounds — the "no such slot" message
-- ---------------------------------------------------------------------------

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
    raise exception 'Der findes ingen tid nummer %. Tider er nummereret 1 til 5.', p_slot
      using errcode = '22023';
  end if;

  starts_at := (p_date + make_time(v_hour, 0, 0)) at time zone 'Europe/Copenhagen';
  ends_at := (p_date + make_time(v_hour + 3, 0, 0)) at time zone 'Europe/Copenhagen';
end;
$$;

-- ---------------------------------------------------------------------------
-- bookings_history_guard — R2's "the past is permanent" trigger
-- ---------------------------------------------------------------------------

create or replace function public.bookings_history_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.starts_at <= now() then
      raise exception 'En booking, hvis tid er startet, kan aldrig slettes.'
        using errcode = '2F004';
    end if;
    return old;
  end if;

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
    raise exception 'En bookingpost kan ikke omskrives; kun dens status kan ændres.'
      using errcode = '2F004';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who is calling
-- ---------------------------------------------------------------------------

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
    raise exception 'Du skal være logget ind.' using errcode = '28000';
  end if;

  select id into v_apartment_id from public.apartments where user_id = auth.uid();

  if v_apartment_id is null then
    raise exception 'Din konto er endnu ikke tilknyttet en lejlighed.'
      using errcode = '42501';
  end if;

  return v_apartment_id;
end;
$$;

create or replace function public.require_admin()
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
    raise exception 'Du skal være logget ind.' using errcode = '28000';
  end if;

  select id into v_apartment_id
    from public.apartments
   where user_id = auth.uid()
     and is_admin;

  if v_apartment_id is null then
    raise exception 'Kun en administrator kan gøre det.' using errcode = '42501';
  end if;

  return v_apartment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_apartment
-- ---------------------------------------------------------------------------

create or replace function public.claim_apartment(p_number int, p_name text, p_phone text)
returns public.apartments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_name text := nullif(trim(p_name), '');
  v_phone text := nullif(trim(p_phone), '');
  v_apartment public.apartments;
begin
  if v_user is null then
    raise exception 'Du skal være logget ind.' using errcode = '28000';
  end if;

  if v_name is null then
    raise exception 'Indtast dit navn.' using errcode = '22023';
  end if;

  if v_phone is null then
    raise exception 'Indtast dit telefonnummer.' using errcode = '22023';
  end if;

  if exists (select 1 from public.apartments where user_id = v_user) then
    raise exception 'Din konto er allerede tilknyttet en lejlighed.'
      using errcode = '42501';
  end if;

  select * into v_apartment
    from public.apartments
   where number = p_number
     for update;

  if not found then
    raise exception 'Der findes ingen lejlighed % i denne bygning.', p_number
      using errcode = '23503';
  end if;

  if v_apartment.user_id is not null then
    raise exception 'Lejlighed % er allerede tilknyttet en anden konto. Kontakt en administrator.',
      p_number using errcode = '23505';
  end if;

  update public.apartments
     set user_id = v_user,
         name = v_name,
         phone = v_phone
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
  select starts_at, ends_at into v_starts_at, v_ends_at
    from public.slot_bounds(p_date, p_slot);

  if p_date > public.copenhagen_today() + public.booking_horizon_days() then
    raise exception 'Du kan kun booke op til % dage frem.', public.booking_horizon_days()
      using errcode = '22023';
  end if;

  if v_ends_at <= now() then
    raise exception 'Denne tid er allerede overstået.' using errcode = '22023';
  end if;

  if v_starts_at > now() and exists (
    select 1
      from public.bookings
     where apartment_id = v_apartment_id
       and status = 'active'
       and starts_at > now()
  ) then
    raise exception 'Du har allerede en kommende booking. Annuller den, før du booker en ny.'
      using errcode = '42501';
  end if;

  begin
    insert into public.bookings (
      apartment_id, date, slot_index, starts_at, ends_at, grace_starts_at, status
    ) values (
      v_apartment_id, p_date, p_slot, v_starts_at, v_ends_at,
      greatest(v_starts_at, now()),
      'active'
    )
    returning * into v_booking;
  exception
    when unique_violation then
      raise exception 'Denne tid er lige blevet booket af en anden.'
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
    raise exception 'Denne booking findes ikke.' using errcode = '23503';
  end if;

  if v_booking.apartment_id <> v_apartment_id then
    raise exception 'Denne booking tilhører en anden lejlighed.' using errcode = '42501';
  end if;

  if v_booking.status <> 'active' then
    raise exception 'Denne booking er ikke længere aktiv.' using errcode = '22023';
  end if;

  if v_booking.starts_at <= now() then
    raise exception 'Denne tid er allerede startet. Frigiv den i stedet.'
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
    raise exception 'Denne booking findes ikke.' using errcode = '23503';
  end if;

  if v_booking.apartment_id <> v_apartment_id then
    raise exception 'Denne booking tilhører en anden lejlighed.' using errcode = '42501';
  end if;

  if v_booking.status <> 'active' then
    raise exception 'Denne booking er ikke længere aktiv.' using errcode = '22023';
  end if;

  if v_booking.starts_at > now() then
    raise exception 'Denne tid er ikke startet endnu. Annuller den i stedet.'
      using errcode = '22023';
  end if;

  if v_booking.ends_at <= now() then
    raise exception 'Denne tid er allerede overstået. Der er intet at frigive.'
      using errcode = '22023';
  end if;

  update public.bookings
     set status = 'released',
         ended_at = now()
   where id = p_id
  returning * into v_booking;

  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_slot — R6 (+ amendment)
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
  v_required_grace interval;
begin
  select * into v_old from public.bookings where id = p_id for update;

  if not found then
    raise exception 'Denne booking findes ikke.' using errcode = '23503';
  end if;

  if v_old.apartment_id = v_apartment_id then
    raise exception 'Det er din egen booking.' using errcode = '22023';
  end if;

  if v_old.status <> 'active' then
    raise exception 'Denne booking er ikke længere aktiv.' using errcode = '22023';
  end if;

  v_required_grace := case
    when v_old.original_apartment_id is not null then public.claim_grace_period()
    else public.grace_period()
  end;

  if now() <= v_old.grace_starts_at + v_required_grace then
    if v_old.original_apartment_id is not null then
      raise exception 'Denne tid kan ikke overtages endnu. En overtaget tid kan overtages igen 15 minutter efter, den blev overtaget.'
        using errcode = '42501';
    else
      raise exception 'Denne tid kan ikke overtages endnu. Den kan overtages 30 minutter efter, den er startet.'
        using errcode = '42501';
    end if;
  end if;

  if now() >= v_old.ends_at then
    raise exception 'Denne tid er allerede overstået.' using errcode = '22023';
  end if;

  update public.bookings
     set status = 'taken_over',
         ended_at = now(),
         taken_over_by_apartment_id = v_apartment_id
   where id = p_id;

  insert into public.bookings (
    apartment_id, date, slot_index, starts_at, ends_at, grace_starts_at,
    status, original_apartment_id
  ) values (
    v_apartment_id, v_old.date, v_old.slot_index, v_old.starts_at, v_old.ends_at,
    now(),
    'active', v_old.apartment_id
  )
  returning * into v_new;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_contact_details
-- ---------------------------------------------------------------------------

create or replace function public.update_contact_details(p_name text, p_phone text)
returns public.apartments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_apartment_id uuid := public.require_apartment();
  v_name text := nullif(trim(p_name), '');
  v_phone text := nullif(trim(p_phone), '');
  v_apartment public.apartments;
begin
  if v_name is null then
    raise exception 'Indtast dit navn.' using errcode = '22023';
  end if;

  if v_phone is null then
    raise exception 'Indtast dit telefonnummer.' using errcode = '22023';
  end if;

  update public.apartments
     set name = v_name,
         phone = v_phone
   where id = v_apartment_id
  returning * into v_apartment;

  return v_apartment;
end;
$$;

-- ---------------------------------------------------------------------------
-- apartment_login_status
-- ---------------------------------------------------------------------------

create or replace function public.apartment_login_status(p_number int)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_claimed boolean;
begin
  select (user_id is not null) into v_claimed
    from public.apartments
   where number = p_number;

  if not found then
    raise exception 'Der findes ingen lejlighed % i denne bygning.', p_number
      using errcode = '23503';
  end if;

  return v_claimed;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_reset_apartment
-- ---------------------------------------------------------------------------

create or replace function public.admin_reset_apartment(p_number int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  perform public.require_admin();

  select user_id into v_user
    from public.apartments
   where number = p_number;

  if not found then
    raise exception 'Der findes ingen lejlighed % i denne bygning.', p_number
      using errcode = '23503';
  end if;

  if v_user is null then
    raise exception 'Lejlighed % er i øjeblikket ikke registreret.', p_number
      using errcode = '22023';
  end if;

  if v_user = auth.uid() then
    raise exception 'Du kan ikke nulstille din egen lejlighed.' using errcode = '42501';
  end if;

  update public.apartments
     set name = null,
         phone = null
   where number = p_number;

  delete from auth.users where id = v_user;
end;
$$;
