-- Fleet Defense: run this once in Supabase -> SQL Editor -> New query -> Run

create table if not exists public.runs (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email         text not null,
  score         int  not null check (score >= 0),
  wave          int  not null default 1,
  partner_email text,
  run_key       text,                       -- same value for both players of one co-op run
  created_at    timestamptz not null default now()
);

create index if not exists runs_score_idx on public.runs (score desc);
create index if not exists runs_user_idx  on public.runs (user_id);

alter table public.runs enable row level security;

-- Everyone logged in can READ every run (needed so player B sees what player A did)
create policy "logged in users can read all runs"
  on public.runs for select to authenticated
  using (true);

-- You can only INSERT runs that belong to you
create policy "users insert their own runs"
  on public.runs for insert to authenticated
  with check (user_id = auth.uid());

-- Live updates: new runs appear in other browsers without reloading
alter publication supabase_realtime add table public.runs;
