-- Google Drive OAuth storage for the PREVIEW project only.
-- Rows are accessible only to the Supabase service role / database owner.
create table if not exists public.google_drive_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.google_drive_oauth_states enable row level security;
revoke all on public.google_drive_oauth_states from anon, authenticated;

create table if not exists public.google_drive_connections (
  id integer primary key check (id = 1),
  connected_by uuid not null references auth.users(id),
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  scope text not null default '',
  connected_at timestamptz not null default now()
);
alter table public.google_drive_connections enable row level security;
revoke all on public.google_drive_connections from anon, authenticated;
