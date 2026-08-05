-- Login by apartment number and password, replacing magic-link email.
--
-- Supabase's built-in email service is rate-limited to a handful of emails an
-- hour on every plan — fine for occasional password-reset mail, not for being
-- the only way in. Rather than standing up custom SMTP for a 20-apartment
-- building, the frontend now authenticates with Supabase's ordinary
-- email+password sign-in, using a synthetic, never-delivered address
-- (`apt{number}@apartments.internal`, built in src/lib/apartmentAuth.ts) so the
-- apartment number remains the one real identity. This requires "Confirm
-- email" to be switched off in the Supabase dashboard (Authentication →
-- Providers → Email) — see CLAUDE.md.
--
-- There is deliberately no password-reset flow: with no real email address
-- there is nothing to reset a password *to*. Forgetting a password is handled
-- by admin_reset_apartment below, the same way a lost padlock key would be —
-- the admin frees the number and the resident claims it again.

-- ---------------------------------------------------------------------------
-- apartment_login_status — is this number claimed yet?
-- ---------------------------------------------------------------------------

-- Called before anyone is signed in, to decide whether the frontend should
-- offer "create a password" or "enter your password". Returns only a
-- boolean — never the apartment's name, phone, or anything else — so it is
-- safe to expose to anonymous callers.
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
    raise exception 'There is no apartment % in this building.', p_number
      using errcode = '23503';
  end if;

  return v_claimed;
end;
$$;

revoke execute on function public.apartment_login_status(int) from public;
grant execute on function public.apartment_login_status(int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_reset_apartment — replaces admin_reassign_apartment
-- ---------------------------------------------------------------------------

-- With accounts now scoped one-to-one to an apartment number (there is no
-- portable login to move to a "different account" — see apartmentEmail), the
-- old "reassign to a different account" operation no longer maps to anything
-- real. What admin actually needs, for a resident moving out or a forgotten
-- password alike, is: free the number so it can be claimed again. Deleting
-- the linked auth user does that (ON DELETE SET NULL), and this also clears
-- the outgoing resident's name and phone rather than leaving them attached to
-- an apartment they no longer answer for.
drop function if exists public.admin_reassign_apartment(int, text);
drop function if exists public.admin_remove_account(text);

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
    raise exception 'There is no apartment % in this building.', p_number
      using errcode = '23503';
  end if;

  if v_user is null then
    raise exception 'Apartment % is not currently claimed.', p_number
      using errcode = '22023';
  end if;

  -- The building may have exactly one admin, and there is no way back in
  -- from the app once your own account is gone.
  if v_user = auth.uid() then
    raise exception 'You cannot reset your own apartment.' using errcode = '42501';
  end if;

  update public.apartments
     set name = null,
         phone = null
   where number = p_number;

  delete from auth.users where id = v_user;
end;
$$;

revoke execute on function public.admin_reset_apartment(int) from public;
grant execute on function public.admin_reset_apartment(int) to authenticated;
