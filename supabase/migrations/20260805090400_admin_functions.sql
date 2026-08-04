-- Admin.
--
-- Two operations, both for when people move in and out of the building. The
-- admin check lives inside each function, next to the work it guards, so there
-- is no way to reach the work without passing the check.
--
-- Neither of these can rewrite history. Bookings keep the apartment that made
-- them and the apartment keeps its bookings (R2); all that changes is which
-- account is allowed to act as that apartment from now on.

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
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  select id into v_apartment_id
    from public.apartments
   where user_id = auth.uid()
     and is_admin;

  if v_apartment_id is null then
    raise exception 'Only an administrator can do that.' using errcode = '42501';
  end if;

  return v_apartment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Move an apartment number to a different account
-- ---------------------------------------------------------------------------

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
     set user_id = v_user
   where number = p_number
  returning * into v_apartment;

  if not found then
    raise exception 'There is no apartment % in this building.', p_number
      using errcode = '23503';
  end if;

  return v_apartment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Remove an account
-- ---------------------------------------------------------------------------

-- The login goes. The apartment stays, and so does every booking ever made from
-- it — `apartments.user_id` is ON DELETE SET NULL precisely so that removing a
-- resident cannot take the record of their washes with them.
create or replace function public.admin_remove_account(p_email text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  perform public.require_admin();

  select id into v_user
    from auth.users
   where lower(email) = lower(trim(p_email));

  if v_user is null then
    raise exception 'There is no account with the email %.', p_email
      using errcode = '23503';
  end if;

  -- Removing your own login would lock the building's only admin out of the
  -- admin screen, and there is no way back in from the app.
  if v_user = auth.uid() then
    raise exception 'You cannot remove your own account.' using errcode = '42501';
  end if;

  delete from auth.users where id = v_user;
end;
$$;

revoke execute on function public.require_admin() from public;
revoke execute on function public.admin_reassign_apartment(int, text) from public;
revoke execute on function public.admin_remove_account(text) from public;

-- Both are safe to expose: they check is_admin themselves before doing anything.
grant execute on function public.admin_reassign_apartment(int, text) to authenticated;
grant execute on function public.admin_remove_account(text) to authenticated;
