-- History.
--
-- This is what the physical board could not do. Moving a padlock to the next
-- slot erased the evidence of the last wash; here nothing is erased, and who
-- washed when is visible to everyone in the building.

-- The most recent wash per apartment, including apartments that have never
-- washed (null). Cancelled bookings do not count — nobody washed. Bookings that
-- have not started yet do not count either: an upcoming booking is not a wash.
--
-- security_invoker so the view is read under the caller's RLS rather than the
-- view owner's. The policies allow every signed-in resident to read everything,
-- which is the point, but the view must not be a way around them.
create view public.last_wash_by_apartment
with (security_invoker = true) as
select
  flat.id as apartment_id,
  flat.number,
  wash.id as booking_id,
  wash.starts_at as last_wash_starts_at,
  wash.date as last_wash_date,
  wash.slot_index as last_wash_slot_index,
  wash.status as last_wash_status
from public.apartments as flat
left join lateral (
  select b.id, b.starts_at, b.date, b.slot_index, b.status
    from public.bookings as b
   where b.apartment_id = flat.id
     and b.status <> 'cancelled'
     and b.starts_at <= now()
   order by b.starts_at desc
   limit 1
) as wash on true;

comment on view public.last_wash_by_apartment is
  'One row per apartment with its most recent wash, or nulls if it has never washed.';

revoke all on public.last_wash_by_apartment from anon, authenticated;
grant select on public.last_wash_by_apartment to authenticated;
