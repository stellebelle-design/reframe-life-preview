-- Store Stripe payment intent IDs so full refunds can revoke access.
-- Run in the PREVIEW Supabase project only.
alter table public.client_purchases
  add column if not exists stripe_payment_intent_id text;

create index if not exists client_purchases_payment_intent_idx
  on public.client_purchases (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
