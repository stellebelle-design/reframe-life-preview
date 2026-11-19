-- Admin-only read access to coaching end dates for the Reframe Life retention panel.
-- The underlying retention table remains inaccessible to anon/authenticated roles.

create or replace function public.get_client_retention_schedule()
returns table (
  user_id uuid,
  coaching_ended_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  ) then
    raise exception 'Only an authorised Reframe Life admin can view coaching retention dates.';
  end if;

  return query
    select s.user_id, s.coaching_ended_at
    from public.client_retention_schedule s
    order by s.coaching_ended_at desc;
end;
$$;

revoke all on function public.get_client_retention_schedule() from public, anon;
grant execute on function public.get_client_retention_schedule() to authenticated;
