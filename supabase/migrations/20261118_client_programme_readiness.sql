-- Reframe Life: per-purchase programme readiness
create table if not exists public.client_programme_readiness (
  purchase_id uuid primary key references public.client_purchases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_ready boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.client_programme_readiness enable row level security;
revoke all on public.client_programme_readiness from anon;
grant select, insert, update, delete on public.client_programme_readiness to authenticated;
drop policy if exists "Clients can read their own programme readiness" on public.client_programme_readiness;
create policy "Clients can read their own programme readiness"
on public.client_programme_readiness for select to authenticated
using (auth.uid() = user_id);
drop policy if exists "Admins can manage programme readiness" on public.client_programme_readiness;
create policy "Admins can manage programme readiness"
on public.client_programme_readiness for all to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (exists (select 1 from public.admin_users where user_id = auth.uid()));
