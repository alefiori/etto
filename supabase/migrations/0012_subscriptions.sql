-- Pro entitlements.
--
-- Why this table is shaped differently from every other one here:
--
--   1. **The client must never be able to grant itself Pro.** Every other table
--      in this schema is owner-read-write, because the user owning their own
--      data is the whole point. This one is the exception: a user may read
--      their entitlement and may never write it. So there is a select policy
--      and deliberately no insert, update or delete policy at all. Postgres
--      denies anything without a matching policy, so the omission *is* the
--      protection — do not add the missing three "for symmetry".
--
--   2. Writes arrive only from the revenuecat-webhook Edge Function using the
--      service role, which bypasses RLS. RevenueCat is the source of truth
--      because it is the only party that has verified the receipt with Apple or
--      Google. The on-device SDK cache is a fast path for the UI, never
--      authority — it is trivially spoofable on a rooted device.
--
--   3. One row per user, not one per transaction. The app only ever asks "is
--      this person Pro right now?", and a transaction log would make that a
--      scan with ordering rules instead of a primary-key lookup. The webhook
--      keeps the row current; last_event_at is what makes that safe when
--      events arrive out of order (see below).
--
-- expires_at NULL means "does not expire" — that is how the lifetime unlock is
-- represented, so a non-renewing purchase needs no special case when checking.

create table if not exists public.subscriptions (
  user_id                  uuid primary key references auth.users (id) on delete cascade,
  -- The entitlement identifier configured in RevenueCat, e.g. 'pro'.
  entitlement              text not null default 'pro',
  product_id               text,
  store                    text
    check (store in ('app_store', 'play_store', 'stripe', 'promotional', 'unknown')),
  period_type              text
    check (period_type in ('normal', 'trial', 'intro')),
  original_transaction_id  text,
  -- NULL = never expires (the lifetime unlock).
  expires_at               timestamptz,
  -- Set when the store reports a billing problem; the grace period is still
  -- honoured by expires_at, this only lets the UI warn.
  billing_issue            boolean not null default false,
  -- Replay/ordering guards. RevenueCat retries, and retries can arrive out of
  -- order, so an older event must never overwrite a newer state.
  last_event_id            text,
  last_event_at            timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

comment on column public.subscriptions.expires_at is
  'NULL means the entitlement does not expire — this is how a lifetime unlock is stored.';
comment on column public.subscriptions.last_event_at is
  'Timestamp of the webhook event this row reflects. Older events are ignored.';

-- ---------------------------------------------------------------------------
-- Row Level Security: read-only to the owner. See the header — the absence of
-- write policies is intentional and load-bearing.
-- ---------------------------------------------------------------------------
alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions owner select" on public.subscriptions;
create policy "subscriptions owner select" on public.subscriptions
  for select using (auth.uid() = user_id);
