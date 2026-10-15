-- Super-admin user list / ban / password reset.
-- Only lucifer@gmail.com can execute these.

create or replace function public.admin_caller_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'lucifer@gmail.com';
$$;

revoke all on function public.admin_caller_ok() from public, anon, authenticated;

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed boolean,
  active boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.admin_caller_ok() then
    raise exception 'Super admin only' using errcode = '42501';
  end if;
  return query
  select
    u.id,
    u.email::text,
    coalesce(
      nullif(u.raw_user_meta_data ->> 'username', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(u.email::text, ''), '@', 1)
    ) as name,
    u.created_at,
    u.last_sign_in_at,
    (u.email_confirmed_at is not null) as email_confirmed,
    (u.banned_until is null or u.banned_until < now()) as active
  from auth.users u
  order by u.created_at desc;
end;
$$;

create or replace function public.admin_set_user_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.admin_caller_ok() then
    raise exception 'Super admin only' using errcode = '42501';
  end if;
  if p_id = auth.uid() then
    raise exception 'You cannot deactivate your own admin account';
  end if;
  update auth.users
  set banned_until = case when p_active then null else timestamptz '2099-01-01 00:00:00+00' end
  where id = p_id;
  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

create or replace function public.admin_set_user_password(p_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if not public.admin_caller_ok() then
    raise exception 'Super admin only' using errcode = '42501';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  update auth.users
  set
    encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
    updated_at = now()
  where id = p_id;
  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_user_active(uuid, boolean) from public, anon;
revoke all on function public.admin_set_user_password(uuid, text) from public, anon;

grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;
grant execute on function public.admin_set_user_password(uuid, text) to authenticated;
