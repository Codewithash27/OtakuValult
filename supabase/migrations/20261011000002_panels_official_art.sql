-- "Find images": official art (AniList / MangaDex covers, banners, character art) saved into the gallery.
alter table public.panels drop constraint if exists panels_kind_check;
alter table public.panels
  add constraint panels_kind_check check (kind in ('panel','sticker','edit','art'));

-- Where a found image came from, so the finder can mark images already saved.
alter table public.panels add column if not exists source_url text;
create unique index if not exists panels_user_source_idx
  on public.panels (user_id, source_url) where source_url is not null;
