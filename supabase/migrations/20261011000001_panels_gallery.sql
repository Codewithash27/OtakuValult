-- Private panel gallery: images live in the private `panels` bucket under `<user id>/...`.
create table public.panels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  media_item_id uuid references public.media_items(id) on delete set null,
  storage_path text not null unique,
  thumb_path text not null,
  kind text not null default 'panel' check (kind in ('panel','sticker','edit')),
  width int not null check (width > 0),
  height int not null check (height > 0),
  adult boolean not null default false,
  tags text[] not null default '{}',
  caption text,
  created_at timestamptz not null default now()
);

create index panels_user_created_idx on public.panels (user_id, created_at desc);
create index panels_item_idx on public.panels (media_item_id);

alter table public.panels enable row level security;

create policy "panels: own read" on public.panels
for select to authenticated using ((select auth.uid()) = user_id);

create policy "panels: own insert" on public.panels
for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "panels: own update" on public.panels
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "panels: own delete" on public.panels
for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.panels to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('panels', 'panels', false, 8388608, array['image/webp', 'image/jpeg', 'image/png', 'image/gif'])
on conflict (id) do nothing;

create policy "panels bucket: own read" on storage.objects
for select to authenticated
using (bucket_id = 'panels' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "panels bucket: own upload" on storage.objects
for insert to authenticated
with check (bucket_id = 'panels' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "panels bucket: own update" on storage.objects
for update to authenticated
using (bucket_id = 'panels' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "panels bucket: own delete" on storage.objects
for delete to authenticated
using (bucket_id = 'panels' and (storage.foldername(name))[1] = (select auth.uid())::text);
