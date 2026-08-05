-- Contact details, and retiring them on reassignment.
--
-- The original identity model was "an apartment's number, and nothing else"
-- (see CLAUDE.md). The building asked for a way to actually reach each other
-- about a booking, so this adds an optional name and phone number per
-- apartment. They are visible to every signed-in resident under the same RLS
-- policy that already exposes apartment numbers and bookings — there is no
-- new privacy boundary to design, the existing one already covers this.

alter table public.apartments
  add column name text,
  add column phone text;

comment on column public.apartments.name is
  'Contact name, set by the resident. Visible to every signed-in resident.';
comment on column public.apartments.phone is
  'Contact phone number, set by the resident. Visible to every signed-in resident.';

-- ---------------------------------------------------------------------------
-- claim_apartment now also records how to reach the resident
-- ---------------------------------------------------------------------------

-- Replaced outright rather than overloaded, so there is exactly one way to
-- claim an apartment and old clients get a clear error instead of silently
-- calling a function that no longer matches what claiming requires.
drop function if exists public.claim_apartment(int);

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
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  if v_name is null then
    raise exception 'Enter your name.' using errcode = '22023';
  end if;

  if v_phone is null then
    raise exception 'Enter your phone number.' using errcode = '22023';
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
     set user_id = v_user,
         name = v_name,
         phone = v_phone
   where id = v_apartment.id
  returning * into v_apartment;

  return v_apartment;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_contact_details — "My page" editing your own name and phone
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
    raise exception 'Enter your name.' using errcode = '22023';
  end if;

  if v_phone is null then
    raise exception 'Enter your phone number.' using errcode = '22023';
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
-- Reassigning an apartment retires the old resident's contact details
-- ---------------------------------------------------------------------------

-- Same signature as before, so this replaces rather than overloads. Keeping
-- the previous resident's name and phone attached to an apartment they no
-- longer live in would be actively wrong, not just stale — so reassignment
-- clears them, and the new resident sets their own from "My page".
create or replace function public.admin_reassign_apartment(p_number int, p_email text)
returns public.apartments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_existing int;
  v_apartment public.apartments;
begin
  perform public.require_admin();

  select id into v_user
    from auth.users
   where lower(email) = lower(trim(p_email));

  if v_user is null then
    raise exception 'There is no account with the email %.', p_email
      using errcode = '23503';
  end if;

  select number into v_existing
    from public.apartments
   where user_id = v_user
     and number <> p_number;

  if v_existing is not null then
    raise exception 'That account is already linked to apartment %. Unlink it first.', v_existing
      using errcode = '23505';
  end if;

  update public.apartments
     set user_id = v_user,
         name = null,
         phone = null
   where number = p_number
  returning * into v_apartment;

  if not found then
    raise exception 'There is no apartment % in this building.', p_number
      using errcode = '23503';
  end if;

  return v_apartment;
end;
$$;

revoke execute on function public.claim_apartment(int, text, text) from public;
revoke execute on function public.update_contact_details(text, text) from public;

grant execute on function public.claim_apartment(int, text, text) to authenticated;
grant execute on function public.update_contact_details(text, text) to authenticated;
