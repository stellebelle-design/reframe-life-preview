-- Reframe Life coaching-data retention (PREVIEW project only).
-- This migration prepares a controlled six-month deletion process.
-- It deliberately preserves auth accounts, client_purchases, payment references,
-- Stripe records and accounting information.

create table if not exists public.client_retention_schedule (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coaching_ended_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null
);

alter table public.client_retention_schedule enable row level security;
revoke all on public.client_retention_schedule from anon, authenticated;
grant all on public.client_retention_schedule to service_role;

create or replace function public.record_client_coaching_end(
  p_user_id uuid,
  p_coaching_ended_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'Only an authorised Reframe Life admin can record a coaching end date.';
  end if;

  if p_user_id is null or p_coaching_ended_at is null then
    raise exception 'A client and coaching end date are required.';
  end if;

  if p_coaching_ended_at > now() then
    raise exception 'The coaching end date cannot be in the future.';
  end if;

  insert into public.client_retention_schedule(user_id, coaching_ended_at, recorded_by, recorded_at)
  values (p_user_id, p_coaching_ended_at, auth.uid(), now())
  on conflict (user_id) do update
    set coaching_ended_at = excluded.coaching_ended_at,
        recorded_by = excluded.recorded_by,
        recorded_at = now();
end;
$$;

revoke all on function public.record_client_coaching_end(uuid, timestamptz) from public, anon;
grant execute on function public.record_client_coaching_end(uuid, timestamptz) to authenticated;

create or replace function public.purge_expired_client_coaching_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_table text;
  v_deleted integer;
  v_total integer := 0;
  v_clients integer := 0;
  v_results jsonb := '{}'::jsonb;
  v_tables text[] := array[
    'client_onboarding',
    'client_programme_readiness',
    'client_checkins',
    'client_progress_reflections',
    'client_progress_reviews',
    'client_programme_schedules'
  ];
begin
  -- This function is intended for the scheduled server-side job only.
  if coalesce(current_setting('role', true), '') <> 'service_role'
     and current_user <> 'postgres' then
    raise exception 'Not authorised to run the retention purge.';
  end if;

  for v_user_id in
    select s.user_id
    from public.client_retention_schedule s
    where s.coaching_ended_at <= now() - interval '6 months'
    for update skip locked
  loop
    foreach v_table in array v_tables loop
      if to_regclass('public.' || v_table) is not null then
        execute format('delete from public.%I where user_id = $1', v_table)
          using v_user_id;
        get diagnostics v_deleted = row_count;
        v_total := v_total + v_deleted;
        v_results := v_results || jsonb_build_object(v_table, coalesce((v_results->>v_table)::integer, 0) + v_deleted);
      end if;
    end loop;

    -- Keep purchase/payment and auth records; remove only the retention marker
    -- once the coaching records have been purged.
    delete from public.client_retention_schedule where user_id = v_user_id;
    v_clients := v_clients + 1;
  end loop;

  return jsonb_build_object(
    'clients_processed', v_clients,
    'coaching_rows_deleted', v_total,
    'deleted_by_table', v_results,
    'financial_and_auth_records_preserved', true
  );
end;
$$;

revoke all on function public.purge_expired_client_coaching_data() from public, anon, authenticated;
grant execute on function public.purge_expired_client_coaching_data() to service_role;
