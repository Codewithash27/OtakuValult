create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source text not null check (source in ('tmdb','jikan','anilist','manual')),
  external_id text,
  media_type text not null check (media_type in ('anime','manga','manhwa','movie','tv')),
  title text not null,
  poster_url text,
  year int,
  status text not null default 'plan_to_watch'
    check (status in ('watching','completed','on_hold','dropped','plan_to_watch')),
  rating smallint check (rating between 1 and 10),
  progress int not null default 0,
  total int,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create index media_items_user_idx on public.media_items (user_id, media_type, status);

create function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger media_items_updated_at
before update on public.media_items
for each row execute function public.set_updated_at();
