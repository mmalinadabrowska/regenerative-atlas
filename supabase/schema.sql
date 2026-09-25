-- The Regenerative Atlas in Postgres.
--
-- Run this once against the Supabase project (SQL Editor → New query → Run).
-- It is the same shape as the SQLite schema the server runs on locally, so a
-- record means the same thing in both places and either can be rebuilt from the
-- other. Nothing here is Supabase-specific except the row-level security at the
-- bottom, which is what makes it safe to point a browser at.

create table if not exists sources (
  id          bigint generated always as identity primary key,
  url         text not null,
  url_key     text not null unique,
  title       text not null,
  authors     text not null default '',
  publisher   text not null default '',
  year        integer,
  summary     text not null default '',
  note        text not null default '',
  contributor text not null default '',
  status      text not null default 'published',
  origin      text not null default 'submitted',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists tags (
  id    bigint generated always as identity primary key,
  slug  text not null unique,
  label text not null,
  facet text not null default 'open',
  note  text,
  core  boolean not null default false
);

create table if not exists source_tags (
  source_id bigint not null references sources(id) on delete cascade,
  tag_id    bigint not null references tags(id) on delete cascade,
  primary key (source_id, tag_id)
);

create index if not exists idx_source_tags_tag on source_tags(tag_id);
create index if not exists idx_sources_status on sources(status);

-- Keep updated_at honest.
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sources_touch on sources;
create trigger sources_touch before update on sources
  for each row execute function touch_updated_at();

-- Row-level security: the library is public to read and closed to write.
-- Writes go through the server, which holds the service role key; the anon key
-- can be handed to a browser and still cannot add, edit or delete anything.
alter table sources     enable row level security;
alter table tags        enable row level security;
alter table source_tags enable row level security;

drop policy if exists "read published sources" on sources;
create policy "read published sources" on sources
  for select using (status = 'published');

drop policy if exists "read tags" on tags;
create policy "read tags" on tags for select using (true);

drop policy if exists "read source tags" on source_tags;
create policy "read source tags" on source_tags for select using (true);

-- ---------------------------------------------------------------------------
-- Submissions: where an entry waits.
--
-- The Atlas is curated, and its form is open to anyone, so the two facts have
-- to meet somewhere. They meet here: a submission from the site is written to
-- this table and nowhere else, the curator is emailed, and only a decision
-- moves the record across into `sources`, where the map can see it.
--
-- `token` is what stands for the entry in that email — a long random string,
-- unguessable, and the only key to the review page. It is not a password and
-- is not tied to a person: whoever holds the link decides.

create table if not exists submissions (
  id          bigint generated always as identity primary key,
  token       text not null unique,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  url         text not null,
  url_key     text not null,
  title       text not null,
  authors     text not null default '',
  publisher   text not null default '',
  year        integer,
  summary     text not null default '',
  note        text not null default '',
  contributor text not null default '',
  tags        text[] not null default '{}',
  source_id   bigint references sources(id) on delete set null,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists idx_submissions_status on submissions(status);
create index if not exists idx_submissions_url_key on submissions(url_key);

-- Security by absence: the table has row-level security on and no policy at
-- all, so the anon key — the one a browser may hold — can neither read the
-- queue nor write to it. Only the service role, which bypasses these rules and
-- lives on the server, can. An unreviewed submission is somebody's half-formed
-- suggestion; it is not published, and it is not public.
alter table submissions enable row level security;
