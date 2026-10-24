-- Life Tracker schema. Run once in Supabase → SQL Editor.

-- All tracker data lives in one JSON document.
create table if not exists public.life_data (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Lock the table down: no public access. The website reads/writes with the server-side secret key only.
alter table public.life_data enable row level security;

-- Private bucket for uploaded books (PDF). 100 MB per file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('books', 'books', false, 104857600, array['application/pdf'])
on conflict (id) do nothing;
