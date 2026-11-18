-- Per-client coaching start date. The coach sets this to the day the client actually begins.
create table if not exists public.client_programme_schedules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  programme_start_date date not null,
  updated_at timestamptz not null default now()
);

alter table public.client_programme_schedules enable row level security;
revoke all on public.client_programme_schedules from anon;
grant select, insert, update, delete on public.client_programme_schedules to authenticated;

drop policy if exists "Clients can read their own programme schedule" on public.client_programme_schedules;
create policy "Clients can read their own programme schedule"
on public.client_programme_schedules for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can manage programme schedules" on public.client_programme_schedules;
create policy "Admins can manage programme schedules"
on public.client_programme_schedules for all to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (exists (select 1 from public.admin_users where user_id = auth.uid()));
