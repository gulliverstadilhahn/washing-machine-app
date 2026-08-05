-- Replace the placeholder 1-24 seed with the building's real laundry lock
-- numbers, taken from the physical "Liste over vaskelåse" posted by the
-- board/caretaker. Lock number is exactly what this app calls an apartment
-- number — one identity per registered laundry-scheme household.
--
-- This only adds the numbers that were missing. It does not remove the
-- placeholder numbers that turned out not to be real locks — some of those
-- are already claimed by real residents (using numbers that predate this
-- real list), and a migration should never delete rows with real history
-- attached to them. Reconciling those specific numbers is a one-time manual
-- decision, not a schema change — see CLAUDE.md.

insert into public.apartments (number)
select unnest(array[
  3, 6, 7, 10, 14, 15, 16, 18, 19, 21, 23, 24,
  25, 26, 27, 28, 30, 32, 34, 35, 36, 37, 38, 39, 40
])
on conflict (number) do nothing;
