-- R6 amendment — a claimed booking gets a shorter grace period than an
-- original one.
--
-- R6 as originally specified gives every active booking 30 minutes of
-- protection before anyone else may claim it. That is still correct for an
-- ORIGINAL booking (made via book_slot): the holder may have booked from
-- upstairs and genuinely needs travel time. But claiming a slot already
-- requires being physically present to verify no wash is running (see the
-- claim dialog text) — so a claimer has no such excuse for delay, and giving
-- them the same 30 minutes just leaves the room idle for longer than it needs
-- to be. Confirmed directly by the building: a claimer gets 15 minutes, not 30.

create or replace function public.claim_grace_period()
returns interval
language sql
immutable
as $$ select interval '15 minutes' $$;

comment on function public.claim_grace_period() is
  'R6 amendment: a claimed booking becomes claimable this long after grace_starts_at, instead of grace_period().';

-- Same signature as before, so this replaces claim_slot in place. The only
-- change is which grace duration applies, decided by whether this row is
-- itself a claim (original_apartment_id is not null) — a signal already set
-- by the insert below, so a claim-of-a-claim automatically gets the shorter
-- rule too, with no depth tracking needed.
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
    raise exception 'That booking does not exist.' using errcode = '23503';
  end if;

  if v_old.apartment_id = v_apartment_id then
    raise exception 'That is your own booking.' using errcode = '22023';
  end if;

  if v_old.status <> 'active' then
    raise exception 'That booking is no longer active.' using errcode = '22023';
  end if;

  v_required_grace := case
    when v_old.original_apartment_id is not null then public.claim_grace_period()
    else public.grace_period()
  end;

  -- R6 — claimable only once the applicable grace window has run out, and
  -- only while the slot is still running.
  if now() <= v_old.grace_starts_at + v_required_grace then
    if v_old.original_apartment_id is not null then
      raise exception 'This slot cannot be claimed yet. A claimed slot becomes claimable again 15 minutes after it was claimed.'
        using errcode = '42501';
    else
      raise exception 'This slot cannot be claimed yet. It becomes claimable 30 minutes after it starts.'
        using errcode = '42501';
    end if;
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
    -- A fresh grace window: the claimer is now the one who could be claimed
    -- from — at the shorter 15-minute rate, since original_apartment_id is
    -- set on this very row.
    now(),
    'active', v_old.apartment_id
  )
  returning * into v_new;

  return v_new;
end;
$$;
