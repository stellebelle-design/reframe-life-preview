-- Reframe Life: persistent admin communication task tracker
create table if not exists public.client_communication_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  communication_type text not null check (communication_type in ('Welcome message','Programme email','Progress review follow-up','Coaching ending message','Other')),
  details text not null default '',
  status text not null default 'pending' check (status in ('pending','sent')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists client_communication_tasks_status_created_idx
  on public.client_communication_tasks (status, created_at desc);
create index if not exists client_communication_tasks_user_idx
  on public.client_communication_tasks (user_id);

alter table public.client_communication_tasks enable row level security;

drop policy if exists "Admins can manage client communication tasks" on public.client_communication_tasks;
create policy "Admins can manage client communication tasks"
  on public.client_communication_tasks
  for all
  to authenticated
  using (exists (
    select 1 from public.admin_users
    where admin_users.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.admin_users
    where admin_users.user_id = auth.uid()
  ));

grant select, insert, update, delete on public.client_communication_tasks to authenticated;
