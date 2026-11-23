-- Google Calendar sync for Reframe Life coaching dates.
-- Stores only the dedicated calendar ID and IDs of events created by this integration.
create table if not exists public.google_calendar_sync_state (
  id integer primary key check (id = 1),
  calendar_id text not null,
  calendar_name text not null default 'Reframe Life Coaching',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz
);
alter table public.google_calendar_sync_state enable row level security;
revoke all on public.google_calendar_sync_state from anon, authenticated;

create table if not exists public.google_calendar_event_map (
  event_key text primary key,
  google_event_id text not null,
  updated_at timestamptz not null default now()
);
alter table public.google_calendar_event_map enable row level security;
revoke all on public.google_calendar_event_map from anon, authenticated;
