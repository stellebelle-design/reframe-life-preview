-- Add the task category field to the central admin task table.
alter table public.admin_tasks
add column if not exists category text not null default 'Other';
