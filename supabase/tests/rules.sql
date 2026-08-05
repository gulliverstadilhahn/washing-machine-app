-- Rules test script.
--
-- Run against a local Supabase instance:
--
--   npx supabase start
--   npx supabase db reset
--   psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/rules.sql
--
-- Everything happens in one transaction which is rolled back at the end, so the
-- script is safe to run repeatedly against a development database. Note that
-- now() is the transaction start time and therefore does not advance while the
-- script runs — that is deliberate, it makes the time comparisons exact.
--
-- Each check prints PASS, or raises and aborts the run. The failure cases
-- matter as much as the happy paths: booking two future slots, cancelling after
-- start, claiming inside the grace window, claiming your own slot, and booking
-- beyond the horizon must all be rejected.

\set ON_ERROR_STOP on
\timing off

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $fn$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
end;
$fn$;

create function pg_temp.expect_ok(p_label text, p_sql text) returns void
language plpgsql as $fn$
begin
  execute p_sql;
  raise notice 'PASS  %', p_label;
exception
  when others then
    raise exception 'FAIL  % — expected success, got: %', p_label, sqlerrm;
end;
$fn$;

create function pg_temp.expect_fail(p_label text, p_sql text) returns void
language plpgsql as $fn$
begin
  begin
    execute p_sql;
  exception
    when others then
      raise notice 'PASS  % — rejected with: %', p_label, sqlerrm;
      return;
  end;
  raise exception 'FAIL  % — expected rejection, but the call succeeded', p_label;
end;
$fn$;

create function pg_temp.expect_true(p_label text, p_condition boolean) returns void
language plpgsql as $fn$
begin
  if p_condition is not true then
    raise exception 'FAIL  % — condition was not true', p_label;
  end if;
  raise notice 'PASS  %', p_label;
end;
$fn$;

-- Somewhere to keep the ids the checks refer to.
create temporary table t_ref (key text primary key, id uuid) on commit drop;

create function pg_temp.ref(p_key text) returns uuid
language sql stable as $fn$ select id from t_ref where key = p_key $fn$;

create function pg_temp.put(p_key text, p_id uuid) returns uuid
language plpgsql as $fn$
begin
  insert into t_ref (key, id) values (p_key, p_id)
  on conflict (key) do update set id = excluded.id;
  return p_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Seed: three residents and three apartments
-- ---------------------------------------------------------------------------

-- Apartment numbers well outside the real building's range so the script never
-- collides with seeded data.
insert into public.apartments (number) values (901), (902), (903);

do $seed$
declare
  v_user uuid;
  v_label text;
  v_users text[] := array['a', 'b', 'c'];
begin
  foreach v_label in array v_users loop
    v_user := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
      v_label || '@laundry.test', '', now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}'
    );
    perform pg_temp.put('user_' || v_label, v_user);
  end loop;

  perform pg_temp.put('apt_901', (select id from public.apartments where number = 901));
  perform pg_temp.put('apt_902', (select id from public.apartments where number = 902));
  perform pg_temp.put('apt_903', (select id from public.apartments where number = 903));
end;
$seed$;

-- ---------------------------------------------------------------------------
-- claim_apartment
-- ---------------------------------------------------------------------------

\echo ''
\echo '== claim_apartment =='

select pg_temp.act_as(pg_temp.ref('user_a'));

select pg_temp.expect_ok(
  'resident A claims apartment 901',
  $$ select public.claim_apartment(901, 'Resident A', '11111111') $$);

select pg_temp.expect_true(
  'apartment 901 is now linked to A, with contact details on record',
  (select user_id = pg_temp.ref('user_a') and name = 'Resident A' and phone = '11111111'
     from public.apartments where number = 901));

select pg_temp.expect_fail(
  'A cannot claim a second apartment',
  $$ select public.claim_apartment(902, 'Resident A', '11111111') $$);

select pg_temp.act_as(pg_temp.ref('user_b'));

select pg_temp.expect_fail(
  'B cannot claim an apartment that is already linked',
  $$ select public.claim_apartment(901, 'Resident B', '22222222') $$);

select pg_temp.expect_fail(
  'B cannot claim an apartment that does not exist',
  $$ select public.claim_apartment(9999, 'Resident B', '22222222') $$);

select pg_temp.expect_fail(
  'claiming without a name is rejected',
  $$ select public.claim_apartment(902, '  ', '22222222') $$);

select pg_temp.expect_fail(
  'claiming without a phone number is rejected',
  $$ select public.claim_apartment(902, 'Resident B', '') $$);

select pg_temp.expect_ok(
  'B claims apartment 902',
  $$ select public.claim_apartment(902, 'Resident B', '22222222') $$);

select pg_temp.act_as(pg_temp.ref('user_c'));
select pg_temp.expect_ok(
  'C claims apartment 903',
  $$ select public.claim_apartment(903, 'Resident C', '33333333') $$);

select pg_temp.expect_ok(
  'C updates their own contact details from My page',
  $$ select public.update_contact_details('Resident C 2', '33333399') $$);

select pg_temp.expect_true(
  'the update is on record',
  (select name = 'Resident C 2' and phone = '33333399'
     from public.apartments where number = 903));

-- ---------------------------------------------------------------------------
-- book_slot — R1, R5, R7, R8
-- ---------------------------------------------------------------------------

\echo ''
\echo '== book_slot =='

select pg_temp.act_as(pg_temp.ref('user_a'));

select pg_temp.expect_ok(
  'A books slot 1 three days out',
  $$ select pg_temp.put('booking_a_future',
       (public.book_slot(public.copenhagen_today() + 3, 1)).id) $$);

-- Slot bounds are computed in Europe/Copenhagen from date + slot_index.
select pg_temp.expect_true(
  'the booking runs 07:00-10:00 Copenhagen time',
  (select starts_at = ((date + time '07:00') at time zone 'Europe/Copenhagen')
      and ends_at = ((date + time '10:00') at time zone 'Europe/Copenhagen')
     from public.bookings where id = pg_temp.ref('booking_a_future')));

-- R5, first branch: booked ahead, so the grace window opens with the slot.
select pg_temp.expect_true(
  'R5: a booking made ahead has grace_starts_at = starts_at',
  (select grace_starts_at = starts_at
     from public.bookings where id = pg_temp.ref('booking_a_future')));

-- R1.
select pg_temp.expect_fail(
  'R1: A cannot hold two future bookings',
  $$ select public.book_slot(public.copenhagen_today() + 4, 2) $$);

select pg_temp.act_as(pg_temp.ref('user_b'));

select pg_temp.expect_fail(
  'a slot that is already taken cannot be booked again',
  $$ select public.book_slot(public.copenhagen_today() + 3, 1) $$);

-- R7.
select pg_temp.expect_ok(
  'R7: booking exactly at the 14 day horizon is allowed',
  $$ select pg_temp.put('booking_b_horizon',
       (public.book_slot(public.copenhagen_today() + public.booking_horizon_days(), 5)).id) $$);

select pg_temp.expect_ok(
  'B frees the horizon booking again',
  $$ select public.cancel_booking(pg_temp.ref('booking_b_horizon')) $$);

select pg_temp.expect_fail(
  'R7: booking one day beyond the horizon is rejected',
  $$ select public.book_slot(public.copenhagen_today() + public.booking_horizon_days() + 1, 3) $$);

select pg_temp.expect_fail(
  'there is no slot 6',
  $$ select public.book_slot(public.copenhagen_today() + 1, 6) $$);

select pg_temp.expect_fail(
  'a slot that is entirely in the past cannot be booked',
  $$ select public.book_slot(public.copenhagen_today() - 1, 1) $$);

-- ---------------------------------------------------------------------------
-- cancel_booking — R3
-- ---------------------------------------------------------------------------

\echo ''
\echo '== cancel_booking =='

select pg_temp.expect_fail(
  'R3: B cannot cancel A''s booking',
  $$ select public.cancel_booking(pg_temp.ref('booking_a_future')) $$);

select pg_temp.act_as(pg_temp.ref('user_a'));

select pg_temp.expect_ok(
  'R3: A cancels their own future booking',
  $$ select public.cancel_booking(pg_temp.ref('booking_a_future')) $$);

select pg_temp.expect_true(
  'the cancelled booking is recorded, not removed',
  (select status = 'cancelled' and ended_at is not null
      and apartment_id = pg_temp.ref('apt_901')
     from public.bookings where id = pg_temp.ref('booking_a_future')));

select pg_temp.expect_fail(
  'a cancelled booking cannot be cancelled twice',
  $$ select public.cancel_booking(pg_temp.ref('booking_a_future')) $$);

select pg_temp.expect_ok(
  'R1: with the future booking cancelled, A can book again',
  $$ select pg_temp.put('booking_a_future',
       (public.book_slot(public.copenhagen_today() + 3, 1)).id) $$);

-- ---------------------------------------------------------------------------
-- Bookings that have already started
-- ---------------------------------------------------------------------------
--
-- These are crafted directly rather than through book_slot, because now() cannot
-- be moved and the script has to work whatever time of day it runs. The date and
-- slot_index columns are only labels on these rows; every rule keys off the
-- timestamps, which are what the checks are about.

\echo ''
\echo '== bookings in progress: R3 boundary, R4, R2 =='

do $craft$
declare
  v_id uuid;
begin
  insert into public.bookings (
    apartment_id, date, slot_index, starts_at, ends_at, grace_starts_at, status
  ) values (
    pg_temp.ref('apt_901'), public.copenhagen_today() - 30, 1,
    now() - interval '10 minutes', now() + interval '2 hours 50 minutes',
    now() - interval '10 minutes', 'active'
  )
  returning id into v_id;
  perform pg_temp.put('booking_a_running', v_id);
end;
$craft$;

select pg_temp.expect_fail(
  'R3: a slot that has already started cannot be cancelled',
  $$ select public.cancel_booking(pg_temp.ref('booking_a_running')) $$);

select pg_temp.act_as(pg_temp.ref('user_b'));
select pg_temp.expect_fail(
  'R4: B cannot release A''s booking',
  $$ select public.release_booking(pg_temp.ref('booking_a_running')) $$);

select pg_temp.act_as(pg_temp.ref('user_a'));
select pg_temp.expect_fail(
  'R4: a slot that has not started yet cannot be released',
  $$ select public.release_booking(pg_temp.ref('booking_a_future')) $$);

select pg_temp.expect_ok(
  'R4: A releases the slot they are in',
  $$ select public.release_booking(pg_temp.ref('booking_a_running')) $$);

select pg_temp.expect_true(
  'R2: the released booking keeps its holder and stays visible',
  (select status = 'released' and ended_at is not null
      and apartment_id = pg_temp.ref('apt_901')
     from public.bookings where id = pg_temp.ref('booking_a_running')));

-- R2 — the past is permanent, enforced by trigger as well as by RLS.
select pg_temp.expect_fail(
  'R2: a booking whose slot has started cannot be deleted',
  $$ delete from public.bookings where id = pg_temp.ref('booking_a_running') $$);

select pg_temp.expect_fail(
  'R2: a booking cannot be reassigned to another apartment',
  $$ update public.bookings set apartment_id = pg_temp.ref('apt_902')
      where id = pg_temp.ref('booking_a_running') $$);

select pg_temp.expect_fail(
  'R2: a booking''s times cannot be rewritten',
  $$ update public.bookings set starts_at = now() + interval '1 day'
      where id = pg_temp.ref('booking_a_running') $$);

-- ---------------------------------------------------------------------------
-- claim_slot — R6
-- ---------------------------------------------------------------------------

\echo ''
\echo '== claim_slot =='

-- B is in a slot that started 10 minutes ago: inside the grace window.
do $craft$
declare
  v_id uuid;
begin
  insert into public.bookings (
    apartment_id, date, slot_index, starts_at, ends_at, grace_starts_at, status
  ) values (
    pg_temp.ref('apt_902'), public.copenhagen_today() - 29, 2,
    now() - interval '10 minutes', now() + interval '2 hours 50 minutes',
    now() - interval '10 minutes', 'active'
  )
  returning id into v_id;
  perform pg_temp.put('booking_b_in_grace', v_id);
end;
$craft$;

select pg_temp.act_as(pg_temp.ref('user_c'));

select pg_temp.expect_fail(
  'R6: a slot cannot be claimed inside the 30 minute grace window',
  $$ select public.claim_slot(pg_temp.ref('booking_b_in_grace')) $$);

-- C has a booking of their own coming up, to prove claiming is not blocked by R1.
select pg_temp.expect_ok(
  'C books a future slot of their own',
  $$ select pg_temp.put('booking_c_future',
       (public.book_slot(public.copenhagen_today() + 2, 4)).id) $$);

-- B is in a slot that started 40 minutes ago: the grace window has run out.
do $craft$
declare
  v_id uuid;
begin
  insert into public.bookings (
    apartment_id, date, slot_index, starts_at, ends_at, grace_starts_at, status
  ) values (
    pg_temp.ref('apt_902'), public.copenhagen_today() - 28, 3,
    now() - interval '40 minutes', now() + interval '2 hours 20 minutes',
    now() - interval '40 minutes', 'active'
  )
  returning id into v_id;
  perform pg_temp.put('booking_b_claimable', v_id);
end;
$craft$;

select pg_temp.act_as(pg_temp.ref('user_b'));
select pg_temp.expect_fail(
  'R6: you cannot claim your own slot',
  $$ select public.claim_slot(pg_temp.ref('booking_b_claimable')) $$);

select pg_temp.act_as(pg_temp.ref('user_c'));
select pg_temp.expect_ok(
  'R6: C claims the slot once the grace window has run out',
  $$ select pg_temp.put('booking_c_claimed',
       (public.claim_slot(pg_temp.ref('booking_b_claimable'))).id) $$);

select pg_temp.expect_true(
  'R2: the old booking becomes taken_over with B still on it and C recorded',
  (select status = 'taken_over'
      and apartment_id = pg_temp.ref('apt_902')
      and taken_over_by_apartment_id = pg_temp.ref('apt_903')
      and ended_at is not null
     from public.bookings where id = pg_temp.ref('booking_b_claimable')));

select pg_temp.expect_true(
  'R6: C holds a fresh active booking for the same slot, grace starting now',
  (select n.apartment_id = pg_temp.ref('apt_903')
      and n.status = 'active'
      and n.original_apartment_id = pg_temp.ref('apt_902')
      and n.grace_starts_at = now()
      and n.starts_at = o.starts_at
      and n.ends_at = o.ends_at
      and n.date = o.date
      and n.slot_index = o.slot_index
     from public.bookings n, public.bookings o
    where n.id = pg_temp.ref('booking_c_claimed')
      and o.id = pg_temp.ref('booking_b_claimable')));

select pg_temp.expect_true(
  'R1: claiming did not disturb the future booking C already held',
  (select status = 'active' from public.bookings where id = pg_temp.ref('booking_c_future')));

-- A slot that is over is not claimable, however long ago the grace ran out.
do $craft$
declare
  v_id uuid;
begin
  insert into public.bookings (
    apartment_id, date, slot_index, starts_at, ends_at, grace_starts_at, status
  ) values (
    pg_temp.ref('apt_901'), public.copenhagen_today() - 27, 4,
    now() - interval '4 hours', now() - interval '1 hour',
    now() - interval '4 hours', 'active'
  )
  returning id into v_id;
  perform pg_temp.put('booking_a_finished', v_id);
end;
$craft$;

select pg_temp.expect_fail(
  'R6: a slot that is over cannot be claimed',
  $$ select public.claim_slot(pg_temp.ref('booking_a_finished')) $$);

select pg_temp.act_as(pg_temp.ref('user_a'));
select pg_temp.expect_fail(
  'R4: a slot that is over cannot be released',
  $$ select public.release_booking(pg_temp.ref('booking_a_finished')) $$);

-- ---------------------------------------------------------------------------
-- claim_slot — R6 amendment: claiming a claim (15 minute rule)
-- ---------------------------------------------------------------------------
--
-- A claimed booking (original_apartment_id set) gets a shorter grace period
-- than an original one: claiming already requires being physically present,
-- so the claimer has less excuse for delay than someone who booked ahead.

\echo ''
\echo '== claim_slot: claiming a claim (R6 amendment, 15 minutes) =='

-- A fourth resident, so this doesn't collide with the checks above.
insert into public.apartments (number) values (904);

do $seed_d$
declare
  v_user uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
    'd@laundry.test', '', now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}'
  );
  perform pg_temp.put('user_d', v_user);
  perform pg_temp.put('apt_904', (select id from public.apartments where number = 904));
end;
$seed_d$;

select pg_temp.act_as(pg_temp.ref('user_d'));
select pg_temp.expect_ok(
  'D claims apartment 904',
  $$ select public.claim_apartment(904, 'Resident D', '44444444') $$);

-- A row shaped like claim_slot's own output (original_apartment_id set),
-- backdated 20 minutes: past the 15 minute claim rule, but still inside the
-- ordinary 30 minute rule — proving the shorter rule is the one actually
-- applied, not a coincidence.
do $craft$
declare
  v_id uuid;
begin
  insert into public.bookings (
    apartment_id, date, slot_index, starts_at, ends_at, grace_starts_at,
    status, original_apartment_id
  ) values (
    pg_temp.ref('apt_903'), public.copenhagen_today() - 26, 5,
    now() - interval '20 minutes', now() + interval '2 hours 40 minutes',
    now() - interval '20 minutes', 'active', pg_temp.ref('apt_901')
  )
  returning id into v_id;
  perform pg_temp.put('booking_c_claim_20m', v_id);
end;
$craft$;

select pg_temp.expect_ok(
  'R6 amendment: D claims a claimed booking 20 minutes after it was claimed',
  $$ select pg_temp.put('booking_d_claimed',
       (public.claim_slot(pg_temp.ref('booking_c_claim_20m'))).id) $$);

select pg_temp.expect_true(
  'the chain carries forward: D''s new row also has original_apartment_id set',
  (select original_apartment_id = pg_temp.ref('apt_903')
     from public.bookings where id = pg_temp.ref('booking_d_claimed')));

-- Negative: only 10 minutes elapsed on a claimed booking must still be refused.
do $craft$
declare
  v_id uuid;
begin
  insert into public.bookings (
    apartment_id, date, slot_index, starts_at, ends_at, grace_starts_at,
    status, original_apartment_id
  ) values (
    pg_temp.ref('apt_903'), public.copenhagen_today() - 25, 1,
    now() - interval '10 minutes', now() + interval '2 hours 50 minutes',
    now() - interval '10 minutes', 'active', pg_temp.ref('apt_901')
  )
  returning id into v_id;
  perform pg_temp.put('booking_c_claim_10m', v_id);
end;
$craft$;

select pg_temp.expect_fail(
  'R6 amendment: a claimed booking cannot be claimed again after only 10 minutes',
  $$ select public.claim_slot(pg_temp.ref('booking_c_claim_10m')) $$);

-- ---------------------------------------------------------------------------
-- R8 — booking a free slot that is already in progress
-- ---------------------------------------------------------------------------
--
-- This one needs a slot that really is in progress right now, so it only runs
-- between 07:00 and 22:00 Copenhagen time. It is skipped with a notice outside
-- those hours rather than faked, because the point of the check is that
-- book_slot tests ends_at > now() and not starts_at > now().

\echo ''
\echo '== R8: rebooking a slot already in progress =='

do $r8$
declare
  v_slot int;
  v_booking public.bookings;
begin
  select i into v_slot
    from generate_series(1, 5) as i,
         lateral public.slot_bounds(public.copenhagen_today(), i) as b
   where b.starts_at <= now()
     and b.ends_at > now()
   limit 1;

  if v_slot is null then
    raise notice 'SKIP  R8 — no slot is in progress at this time of day';
    return;
  end if;

  if exists (select 1 from public.bookings
              where date = public.copenhagen_today()
                and slot_index = v_slot and status = 'active') then
    raise notice 'SKIP  R8 — slot % today is already booked in this database', v_slot;
    return;
  end if;

  -- A still holds the future booking made earlier, which must not stand in the
  -- way: R1 limits how many bookings an apartment holds that have not started,
  -- and this one has already started.
  if not exists (
    select 1 from public.bookings
     where id = pg_temp.ref('booking_a_future') and status = 'active' and starts_at > now()
  ) then
    raise exception 'FAIL  R8 setup — A was expected to be holding a future booking';
  end if;

  perform pg_temp.act_as(pg_temp.ref('user_a'));
  v_booking := public.book_slot(public.copenhagen_today(), v_slot);
  raise notice 'PASS  R8: a free slot already in progress can still be booked';
  raise notice 'PASS  R1: taking an in-progress slot is not blocked by a future booking';

  -- R5, second branch: booked mid-slot, so the grace window opens immediately.
  if v_booking.grace_starts_at <> now() then
    raise exception 'FAIL  R5 — a booking made mid-slot should have grace_starts_at = now()';
  end if;
  raise notice 'PASS  R5: a booking made mid-slot has grace_starts_at = now()';

  perform public.release_booking(v_booking.id);
  perform pg_temp.act_as(pg_temp.ref('user_b'));
  perform public.book_slot(public.copenhagen_today(), v_slot);
  raise notice 'PASS  R8: a released slot can be rebooked for the rest of the period';
end;
$r8$;

-- ---------------------------------------------------------------------------
-- RLS — the frontend cannot write
-- ---------------------------------------------------------------------------
--
-- The checks above run as the database owner so that the rule functions can be
-- exercised directly. This block drops to the authenticated role, which is what
-- the browser actually gets, and shows it can read everything and write nothing.

\echo ''
\echo '== row level security =='

-- Self-contained: once the role has been switched, this block calls nothing
-- outside public, so it does not depend on what the authenticated role may do
-- with the session's temporary schema.
do $rls$
declare
  v_writes text[] := array[
    $w$insert into public.bookings
         (apartment_id, date, slot_index, starts_at, ends_at, grace_starts_at, status)
       select id, public.copenhagen_today() + 5, 2,
              now() + interval '1 day', now() + interval '1 day 3 hours',
              now() + interval '1 day', 'active'
         from public.apartments where number = 903$w$,
    $w$update public.bookings set status = 'cancelled' where status = 'active'$w$,
    $w$delete from public.bookings$w$,
    $w$update public.apartments set user_id = auth.uid() where number = 901$w$,
    $w$update public.apartments set is_admin = true where number = 903$w$
  ];
  v_labels text[] := array[
    'insert a booking', 'update a booking', 'delete a booking',
    'link itself to an apartment', 'make itself an admin'
  ];
  v_failures text[] := '{}';
  v_statement text;
  v_seen int;
  i int;
begin
  perform set_config('role', 'authenticated', true);

  begin
    select count(*) into v_seen from public.bookings;
    perform 1 from public.apartments limit 1;
    raise notice 'PASS  authenticated can read both tables (% bookings visible)', v_seen;
  exception when others then
    v_failures := v_failures || format('authenticated should be able to read: %s', sqlerrm);
  end;

  for i in 1 .. array_length(v_writes, 1) loop
    v_statement := v_writes[i];
    begin
      execute v_statement;
      v_failures := v_failures ||
        format('authenticated was able to %s directly', v_labels[i]);
    exception when others then
      raise notice 'PASS  authenticated cannot % directly — %', v_labels[i], sqlerrm;
    end;
  end loop;

  perform set_config('role', 'none', true);

  if array_length(v_failures, 1) > 0 then
    raise exception 'FAIL  row level security — %', array_to_string(v_failures, '; ');
  end if;
end;
$rls$;

\echo ''
\echo 'All rule checks passed.'

rollback;
