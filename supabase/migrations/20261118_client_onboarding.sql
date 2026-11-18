-- Reframe Life client onboarding
-- Run this in the Supabase SQL Editor for the PREVIEW project only.
-- Do not run against production until the preview workflow has been tested.

create table if not exists public.client_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_checkout_session_id text not null unique,
  stripe_subscription_id text,
  product_key text not null check (
    product_key in (
      'personalised_programme',
      'coaching_4_week',
      'coaching_8_week',
      'coaching_12_week',
      'coaching_6_month'
    )
  ),
  payment_status text not null default 'paid' check (
    payment_status in ('paid', 'active', 'inactive', 'refunded')
  ),
  created_at timestamptz not null default now()
);

create index if not exists client_purchases_user_created_idx
  on public.client_purchases (user_id, created_at desc);

alter table public.client_purchases enable row level security;

drop policy if exists "Clients can view own purchases" on public.client_purchases;
create policy "Clients can view own purchases"
  on public.client_purchases
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins can view all purchases" on public.client_purchases;
create policy "Admins can view all purchases"
  on public.client_purchases
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
    )
  );

drop policy if exists "Service role can manage purchases" on public.client_purchases;
create policy "Service role can manage purchases"
  on public.client_purchases
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.client_onboarding (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references public.client_purchases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_key text not null check (
    product_key in (
      'personalised_programme',
      'coaching_4_week',
      'coaching_8_week',
      'coaching_12_week',
      'coaching_6_month'
    )
  ),
  responses jsonb not null default '{}'::jsonb,
  health_responses jsonb not null default '{}'::jsonb,
  health_information_consent boolean not null default false,
  health_information_consented_at timestamptz,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint client_onboarding_consent_check
    check (
      (
        health_information_consent = false
        and health_information_consented_at is null
        and health_responses = '{}'::jsonb
      )
      or
      (
        health_information_consent = true
        and health_information_consented_at is not null
      )
    ),
  constraint client_onboarding_responses_object_check
    check (
      jsonb_typeof(responses) = 'object'
      and jsonb_typeof(health_responses) = 'object'
    )
);

create index if not exists client_onboarding_user_submitted_idx
  on public.client_onboarding (user_id, submitted_at desc);

alter table public.client_onboarding enable row level security;

drop policy if exists "Clients can view own onboarding" on public.client_onboarding;
create policy "Clients can view own onboarding"
  on public.client_onboarding
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins can view all onboarding" on public.client_onboarding;
create policy "Admins can view all onboarding"
  on public.client_onboarding
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
    )
  );

drop policy if exists "Clients can submit own onboarding" on public.client_onboarding;
create policy "Clients can submit own onboarding"
  on public.client_onboarding
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      health_responses = '{}'::jsonb
      or (
        health_information_consent = true
        and health_information_consented_at is not null
      )
    )
    and exists (
      select 1
      from public.client_purchases cp
      where cp.id = purchase_id
        and cp.user_id = auth.uid()
        and cp.product_key = product_key
        and cp.payment_status in ('paid', 'active')
    )
  );

drop policy if exists "Clients can update own onboarding" on public.client_onboarding;
create policy "Clients can update own onboarding"
  on public.client_onboarding
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      health_responses = '{}'::jsonb
      or (
        health_information_consent = true
        and health_information_consented_at is not null
      )
    )
    and exists (
      select 1
      from public.client_purchases cp
      where cp.id = purchase_id
        and cp.user_id = auth.uid()
        and cp.product_key = product_key
        and cp.payment_status in ('paid', 'active')
    )
  );

-- Clients cannot create or alter purchase records. Only the Stripe webhook
-- using the Supabase service-role key should write to client_purchases.
