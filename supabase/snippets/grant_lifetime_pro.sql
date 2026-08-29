-- Grant one user an unlimited (never-expiring) Pro entitlement.
--
-- Run this from the Supabase SQL editor, or with the service role. The
-- subscriptions table has a select policy and deliberately no write policies
-- (see migration 0012), so an anon/authenticated connection cannot run this —
-- that is the point, not an obstacle to route around.
--
-- "Unlimited" is expires_at = NULL: the app reads a null expiry as "never
-- expires" (isSubscriptionActive / isActive), so nothing else needs a special
-- case.
--
-- last_event_at is set far in the future on purpose. The revenuecat-webhook
-- applies an event only when its timestamp is >= the row's last_event_at, so a
-- future stamp makes this grant immune to a later real store event revoking it
-- (a trial EXPIRATION, a REFUND). The cost: this user's row is now frozen
-- against the webhook for good. If you would rather the store stay
-- authoritative — e.g. this is a temporary comp on an account that will
-- genuinely subscribe — use now() there instead.

insert into public.subscriptions (
  user_id,
  entitlement,
  product_id,
  store,
  period_type,
  expires_at,
  billing_issue,
  last_event_id,
  last_event_at
)
select
  u.id,
  'pro',
  'manual_grant',
  'promotional',
  'normal',
  null,                          -- never expires
  false,
  'manual-grant-' || u.id::text, -- not a RevenueCat id; won't collide with one
  timestamptz '2099-01-01'       -- see note above; use now() to stay revocable
from auth.users u
where u.email = 'person@example.com'  -- <- the user
on conflict (user_id) do update set
  entitlement    = excluded.entitlement,
  product_id     = excluded.product_id,
  store          = excluded.store,
  period_type    = excluded.period_type,
  expires_at     = excluded.expires_at,
  billing_issue  = excluded.billing_issue,
  last_event_id  = excluded.last_event_id,
  last_event_at  = excluded.last_event_at;

-- Verify (expect one row, expires_at null):
-- select s.user_id, u.email, s.entitlement, s.store, s.expires_at
-- from public.subscriptions s join auth.users u on u.id = s.user_id
-- where u.email = 'person@example.com';

-- Revoke it again (ends access immediately):
-- update public.subscriptions s
-- set expires_at = now(), last_event_at = now()
-- from auth.users u
-- where u.id = s.user_id and u.email = 'person@example.com';
