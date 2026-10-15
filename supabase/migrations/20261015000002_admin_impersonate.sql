create table if not exists public.admin_impersonation (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_password text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_impersonation enable row level security;
revoke all on public.admin_impersonation from public, anon, authenticated;

create or replace function public.admin_prepare_impersonation(p_id uuid)
returns table (email text, temp_password text)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_email text;
  v_temp text;
  v_banned timestamptz;
begin
  if not public.admin_caller_ok() then
    raise exception 'Super admin only' using errcode = '42501';
  end if;
  if p_id = auth.uid() then
    raise exception 'You are already this user';
  end if;

  select u.email::text, u.banned_until into v_email, v_banned
  from auth.users u where u.id = p_id;
  if v_email is null then
    raise exception 'User not found';
  end if;
  if v_banned is not null and v_banned > now() then
    raise exception 'Activate this user before logging in as them';
  end if;

  insert into public.admin_impersonation (user_id, encrypted_password)
  select u.id, u.encrypted_password from auth.users u where u.id = p_id
  on conflict (user_id) do nothing;

  v_temp := encode(extensions.gen_random_bytes(9), 'hex');
  update auth.users
  set encrypted_password = extensions.crypt(v_temp, extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_id;

  email := v_email;
  temp_password := v_temp;
  return next;
end;
$$;

create or replace function public.admin_finish_impersonation()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update auth.users u
  set encrypted_password = b.encrypted_password, updated_at = now()
  from public.admin_impersonation b
  where b.user_id = u.id and u.id = auth.uid();
  delete from public.admin_impersonation where user_id = auth.uid();
end;
$$;

create or replace function public.admin_abort_impersonation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.admin_caller_ok() and auth.uid() <> p_id then
    raise exception 'Super admin only' using errcode = '42501';
  end if;
  update auth.users u
  set encrypted_password = b.encrypted_password, updated_at = now()
  from public.admin_impersonation b
  where b.user_id = u.id and u.id = p_id;
  delete from public.admin_impersonation where user_id = p_id;
end;
$$;

revoke all on function public.admin_prepare_impersonation(uuid) from public, anon;
revoke all on function public.admin_finish_impersonation() from public, anon;
revoke all on function public.admin_abort_impersonation(uuid) from public, anon;
grant execute on function public.admin_prepare_impersonation(uuid) to authenticated;
grant execute on function public.admin_finish_impersonation() to authenticated;
grant execute on function public.admin_abort_impersonation(uuid) to authenticated;
