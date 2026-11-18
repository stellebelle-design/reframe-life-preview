-- Reframe Life: client four-week reflections (PREVIEW project only).
create table if not exists public.client_progress_reflections (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 period_start date not null,
 what_went_well text not null default '',
 proud_of text not null default '',
 challenging text not null default '',
 next_focus text not null default '',
 updated_at timestamptz not null default now(),
 constraint client_progress_reflections_user_period_unique unique(user_id,period_start),
 constraint client_progress_reflections_text_lengths check (char_length(what_went_well)<=3000 and char_length(proud_of)<=3000 and char_length(challenging)<=3000 and char_length(next_focus)<=3000)
);
create index if not exists client_progress_reflections_user_period_idx on public.client_progress_reflections(user_id,period_start desc);
alter table public.client_progress_reflections enable row level security;
drop policy if exists "Clients can read own progress reflections" on public.client_progress_reflections;
create policy "Clients can read own progress reflections" on public.client_progress_reflections for select to authenticated using(auth.uid()=user_id);
drop policy if exists "Clients can create own progress reflections" on public.client_progress_reflections;
create policy "Clients can create own progress reflections" on public.client_progress_reflections for insert to authenticated with check(auth.uid()=user_id and exists(select 1 from public.client_progress_reviews r where r.user_id=auth.uid() and r.period_start=client_progress_reflections.period_start));
drop policy if exists "Clients can update own progress reflections" on public.client_progress_reflections;
create policy "Clients can update own progress reflections" on public.client_progress_reflections for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id and exists(select 1 from public.client_progress_reviews r where r.user_id=auth.uid() and r.period_start=client_progress_reflections.period_start));
drop policy if exists "Admins can view client progress reflections" on public.client_progress_reflections;
create policy "Admins can view client progress reflections" on public.client_progress_reflections for select to authenticated using(exists(select 1 from public.admin_users au where au.user_id=auth.uid()));

grant select, insert, update on public.client_progress_reflections to authenticated;
