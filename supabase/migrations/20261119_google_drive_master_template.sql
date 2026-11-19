-- Securely store the single master programme spreadsheet for the PREVIEW project.
-- Only the Supabase service role can read or write this table.
create table if not exists public.google_drive_master_templates (
  id integer primary key check (id = 1),
  spreadsheet_id text not null,
  spreadsheet_name text not null,
  tab_names text[] not null default '{}',
  connected_at timestamptz not null default now()
);
alter table public.google_drive_master_templates enable row level security;
revoke all on public.google_drive_master_templates from anon, authenticated;
