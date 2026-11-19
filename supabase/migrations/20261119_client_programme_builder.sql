-- Private per-questionnaire programme drafts for the Reframe Life admin workspace.
-- Run in the PREVIEW Supabase project only.
create table if not exists public.client_programme_builds (
  onboarding_id uuid primary key references public.client_onboarding(id) on delete cascade,
  purchase_id uuid not null references public.client_purchases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_key text not null,
  programme_data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','ready')),
  updated_at timestamptz not null default now(),
  constraint client_programme_builds_data_object check (jsonb_typeof(programme_data)='object')
);
create index if not exists client_programme_builds_user_idx on public.client_programme_builds(user_id);
alter table public.client_programme_builds enable row level security;
revoke all on public.client_programme_builds from anon, authenticated;
grant select, insert, update, delete on public.client_programme_builds to authenticated;
drop policy if exists "Admins can manage private programme drafts" on public.client_programme_builds;
create policy "Admins can manage private programme drafts"
on public.client_programme_builds for all to authenticated
using (exists (select 1 from public.admin_users where user_id=auth.uid()))
with check (exists (select 1 from public.admin_users where user_id=auth.uid()));
