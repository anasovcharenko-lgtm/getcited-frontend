-- Waiting list for the public landing pages.
--
-- Run this in Supabase → SQL Editor before deploying the waitlist form, or
-- every signup fails silently.
--
-- The form writes with the publishable key, which ships inside the JavaScript
-- bundle and is therefore public. So the table must allow exactly one thing:
-- INSERT. There is no SELECT policy on purpose — with one, anyone could open
-- the browser console and read every address on the list.

create table if not exists public.waitlist (
  id          bigint generated always as identity primary key,
  email       text        not null,
  source      text,                  -- which page and language the signup came from
  locale      text,
  created_at  timestamptz not null default now()
);

-- Signing up twice is not two leads. The unique index makes the second insert
-- fail with 23505, which the form shows as "you're already on the list".
create unique index if not exists waitlist_email_key
  on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

drop policy if exists "anyone can join the waitlist" on public.waitlist;
create policy "anyone can join the waitlist"
  on public.waitlist for insert
  to anon, authenticated
  with check (
    -- Bound what an anonymous caller can write. Without these an open insert
    -- policy accepts a megabyte of anything in the email column.
    char_length(email) between 5 and 254
    and email like '%@%.%'
  );

-- No select, update or delete policy. Read the list in the Supabase dashboard,
-- which goes through the service role and ignores RLS:
--   select created_at, email, source from public.waitlist order by created_at desc;
