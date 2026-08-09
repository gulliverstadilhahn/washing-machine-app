-- Apartments 1 and 17 were test claims made before the real lock-number list
-- existed. They can't be deleted — each has a booking whose slot already
-- started, and R2's own trigger correctly refuses to delete those, test data
-- or not (see CLAUDE.md). Left as plain rows, they were still fully
-- claimable: nothing distinguished "a real lock number" from "an inert
-- leftover row with the same shape." A resident could sign up as apartment 1
-- even though it isn't one of the building's 25 real locks.
--
-- `active` closes that gap. Only active apartments can be found by number —
-- an inactive one behaves exactly like a number that was never seeded, both
-- for claiming and for logging in. History is untouched: this only gates the
-- login/claim path, not what already happened.

alter table public.apartments
  add column active boolean not null default true;

comment on column public.apartments.active is
  'False for a leftover row that is not one of the building''s real lock
   numbers. Claiming and login treat an inactive apartment as if it did not
   exist; its history stays visible everywhere else (R2).';

update public.apartments set active = false where number in (1, 17);

-- ---------------------------------------------------------------------------
-- claim_apartment — only an active number can be claimed
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
     and active
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
-- apartment_login_status — only an active number answers
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
   where number = p_number
     and active;

  if not found then
    raise exception 'Der findes ingen lejlighed % i denne bygning.', p_number
      using errcode = '23503';
  end if;

  return v_claimed;
end;
$$;
