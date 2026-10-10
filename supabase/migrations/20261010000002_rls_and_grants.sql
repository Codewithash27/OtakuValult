alter table public.profiles enable row level security;
alter table public.media_items enable row level security;

create policy "profiles: own read" on public.profiles
for select to authenticated using ((select auth.uid()) = id);

create policy "profiles: own update" on public.profiles
for update to authenticated using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "items: own read" on public.media_items
for select to authenticated using ((select auth.uid()) = user_id);

create policy "items: own insert" on public.media_items
for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "items: own update" on public.media_items
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "items: own delete" on public.media_items
for delete to authenticated using ((select auth.uid()) = user_id);

-- API access (RLS policies still decide which rows)
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.media_items to authenticated;
