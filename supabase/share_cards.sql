-- ─────────────────────────────────────────────────────────────────────────────
-- share_cards — LinkedIn link-preview cards for the 수익률 공유 card
-- Run once in Supabase SQL Editor.
--
-- Flow: a logged-in user clicks LinkedIn on the share card → assets/js/share.js
-- uploads the card PNG to storage bucket `share-cards` as <id>.png and inserts a
-- row here → the post links to https://share.jjanalysis.com/s/<id>, which the
-- Cloudflare Worker (cloudflare/share-worker) serves as an HTML page whose
-- og:image is that PNG, then redirects people to the real jjanalysis.com page.
--
-- Only what the card already shows is stored: ticker/label, return %, period,
-- site path, language. Never prices, share counts or $ amounts.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.share_cards (
  id          uuid primary key,
  label       text not null check (char_length(label) between 1 and 40),
  pct         numeric not null check (pct > -100000 and pct < 1000000),
  start_date  date,
  end_date    date,
  path        text not null check (path ~ '^/[A-Za-z0-9/_-]*$' and char_length(path) <= 120),
  lang        text not null default 'ko' check (lang in ('ko', 'en')),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.share_cards enable row level security;

-- Logged-in users create their own cards; anyone (the Worker, via anon key)
-- can read them — the post is public anyway.
drop policy if exists "share_cards insert own" on public.share_cards;
create policy "share_cards insert own" on public.share_cards
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "share_cards public read" on public.share_cards;
create policy "share_cards public read" on public.share_cards
  for select to anon, authenticated using (true);

drop policy if exists "share_cards delete own" on public.share_cards;
create policy "share_cards delete own" on public.share_cards
  for delete to authenticated using (created_by = auth.uid());

-- Public reads must not expose who made a card.
revoke select on public.share_cards from anon;
grant select (id, label, pct, start_date, end_date, path, lang, created_at)
  on public.share_cards to anon;

-- ── Storage bucket: public PNGs, ≤ 1 MB ───────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('share-cards', 'share-cards', true, 1048576, array['image/png'])
on conflict (id) do update
  set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/png'];

drop policy if exists "share-cards upload own" on storage.objects;
create policy "share-cards upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'share-cards' and name ~ '^[0-9a-f-]{36}\.png$');

drop policy if exists "share-cards delete own" on storage.objects;
create policy "share-cards delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'share-cards' and owner_id = auth.uid()::text);
