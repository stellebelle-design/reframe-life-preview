-- Private record of one Google Sheets programme copy per client questionnaire.
create table if not exists public.client_programme_copies (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null unique references public.client_onboarding(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id text,
  product_key text,
  client_name text not null,
  spreadsheet_name text not null,
  drive_file_id text not null unique,
  drive_file_url text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.client_programme_copies enable row level security;
revoke all on public.client_programme_copies from anon, authenticated;
