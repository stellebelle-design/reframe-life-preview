-- Reframe Life: central admin task centre
-- Manual tasks and workflow-generated tasks share one private admin list.
create table if not exists public.admin_tasks (
  id uuid primary key default gen_random_uuid(),
  task_type text not null default 'manual' check (task_type in ('manual','workflow')),
  source_key text unique,
  title text not null,
  details text not null default '',
  user_id uuid references auth.users(id) on delete set null,
  due_date date,
  status text not null default 'open' check (status in ('open','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists admin_tasks_status_due_idx
  on public.admin_tasks (status, due_date, created_at desc);
create index if not exists admin_tasks_user_idx
  on public.admin_tasks (user_id);

alter table public.admin_tasks enable row level security;

drop policy if exists "Admins can manage central admin tasks" on public.admin_tasks;
create policy "Admins can manage central admin tasks"
  on public.admin_tasks
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

grant select, insert, update, delete on public.admin_tasks to authenticated;
