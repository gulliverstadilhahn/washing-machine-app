-- The apartments that exist in the building.
--
-- Apartments are not self-service: claim_apartment links an account to a number
-- that already exists here, it does not invent apartments. Adjust this list to
-- the real building — add a new migration rather than editing this one once it
-- has been applied anywhere.

insert into public.apartments (number)
select generate_series(1, 24)
on conflict (number) do nothing;
