-- Allow PornhwaDB export titles on the shelf (Top rated / Find images).
alter table public.media_items drop constraint if exists media_items_source_check;

alter table public.media_items add constraint media_items_source_check
  check (source in ('tmdb', 'jikan', 'anilist', 'manual', 'pornhwadb'));
