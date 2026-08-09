-- R5 amendment — grace always starts at the slot's start, not the booking
-- moment.
--
-- R5 as originally specified was two-branch: book ahead and the grace window
-- opens with the slot; book mid-slot and it opens immediately, giving a fresh
-- 30 minutes from the moment of booking. Confirmed directly: this should be
-- one rule, not two — grace_starts_at is now always exactly the slot's
-- starts_at, regardless of when the booking was made. A 13:00–16:00 slot is
-- claimable starting at 13:31, full stop, whether it was booked yesterday or
-- five minutes ago.
--
-- This only touches book_slot. claim_slot is unaffected and unaffected on
-- purpose — a claim can only happen well after a slot's start (that's the
-- point of R6), so anchoring a claim's own grace to now() at the moment of
-- claiming is still correct; there is no "slot start" left to anchor to.

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
      -- R5 amendment: always the slot's own start, never now().
      v_starts_at,
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
