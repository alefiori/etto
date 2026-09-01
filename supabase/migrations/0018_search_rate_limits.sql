-- Per-user rate limiting for the food-search Edge Function.
--
-- THE GAP: food-search is called with the anon key, which is public by
-- construction — it ships in the browser bundle and in both app binaries. The
-- function is nonetheless deployed *with* JWT verification (CI passes
-- --no-verify-jwt only to revenuecat-webhook), so a caller must present a token
-- the platform accepts. What it does not do is bound how much any one caller
-- may ask for.
--
-- The function already has a 60-second, 200-entry in-isolate LRU cache, but
-- that only collapses *repeated identical* queries. A single account issuing
-- distinct queries in a loop still fans out to Open Food Facts and USDA on
-- every one, and burns quota that is not ours to burn: the USDA key falls back
-- to the shared DEMO_KEY when USDA_API_KEY is unset, and OFF throttles per
-- account. Exhausting either degrades search for every user at once, silently —
-- a failing source returns [] rather than an error.
--
-- WHY A TABLE AND NOT MEMORY: the existing cache is per Deno isolate. Isolates
-- are recycled freely and several run concurrently, so an in-memory counter is
-- reset by the platform at unpredictable moments and is trivially outrun by
-- spreading requests across isolates. A row per user survives all of that, and
-- is the only shared state these functions have.
--
-- WHY KEYED ON auth.uid() AND NOT ON IP: an IP is both too broad and too
-- narrow. Carrier-grade NAT puts thousands of unrelated phone users behind one
-- address, so an IP limit punishes bystanders; and an attacker rotates
-- addresses for free. Since JWT verification is already on, every caller with a
-- session carries a `sub` claim, which is a far better signal and costs nothing
-- extra to read.
--
-- WHAT THIS DOES NOT DO: it is a quota guard, not a security control. A fixed
-- window can let a determined caller spend up to 2x the limit across a window
-- boundary. That is an accepted trade — the alternative is a row per request
-- and a sliding-window scan, for a limit whose only job is to keep one account
-- from draining a shared upstream key. See the note on fixed vs sliding windows
-- in supabase/functions/food-search/rateLimit.ts.

-- ---------------------------------------------------------------------------
-- search_rate_limits: one row per user, rewritten in place.
--
-- Deliberately not an append-only log of requests. This table answers exactly
-- one question ("how many searches has this user made in the current window?")
-- and a log would make it grow without bound to answer it no better.
-- ---------------------------------------------------------------------------

create table if not exists public.search_rate_limits (
  -- The JWT `sub` of the caller. Cascades so a deleted account leaves nothing
  -- behind — delete-account relies on auth.users being the single root of every
  -- cascade (see 0014).
  user_id           uuid primary key references auth.users (id) on delete cascade,
  -- When the current fixed window opened. Reset to now() by the RPC below when
  -- the previous window has expired.
  window_started_at timestamptz not null default now(),
  -- Requests counted since window_started_at, including the one being served.
  request_count     integer not null default 0 check (request_count >= 0),
  updated_at        timestamptz not null default now()
);

comment on table public.search_rate_limits is
  'Fixed-window per-user request counters for the food-search Edge Function. '
  'Written only by public.increment_and_check_rate_limit(); see '
  'supabase/migrations/0018_search_rate_limits.sql.';

-- ---------------------------------------------------------------------------
-- RLS + grants
--
-- No policies at all, on purpose. This is infrastructure bookkeeping, not user
-- data: a user has no reason to read their own counter (the 429 response says
-- everything they need) and every reason not to be able to write it. With RLS
-- enabled and no policy, `anon` and `authenticated` match no rows for any
-- operation; only the service role, which bypasses RLS, can touch it — and the
-- Edge Function is the only holder of that key.
--
-- The grants are not decorative: config.toml's auto_expose_new_tables is unset,
-- so a table created here is NOT reachable through the Data API roles without
-- them. See the note at the end of 0017 — a new table must grant explicitly or
-- it 404s through PostgREST while working perfectly in psql.
-- ---------------------------------------------------------------------------

alter table public.search_rate_limits enable row level security;

grant select, insert, update, delete on public.search_rate_limits to service_role;

-- ---------------------------------------------------------------------------
-- increment_and_check_rate_limit: count one request and say whether it is over.
--
-- ATOMICITY IS THE POINT. The obvious implementation — select the row, decide,
-- then update it — is a read-then-write race: two concurrent searches both read
-- count = 119, both decide they are fine, and both write 120. Under a burst,
-- which is precisely when the limit matters, that undercounts by however many
-- requests are in flight, and the limit stops being a limit.
--
-- So the count, the window rollover and the decision are one INSERT ... ON
-- CONFLICT DO UPDATE. Postgres takes a row lock on the conflicting row for the
-- duration of the update, so concurrent callers serialize on it and each sees
-- the previous one's increment. One statement, one round trip, no race.
--
-- The window rollover rides along in the same statement: if the stored window
-- is already a full p_window_seconds old, the count restarts at 1 (not 0 — the
-- request being counted is itself the first of the new window) and the window
-- start moves to now(). Both CASE arms test the same condition as
-- windowIsCurrent() in rateLimit.ts, which is where the same arithmetic is unit
-- tested.
--
-- security invoker (the default) is deliberate, following 0016: the only caller
-- is the service role, which bypasses RLS anyway, so definer rights would be
-- gratuitous privilege. Should the execute grant below ever be widened by
-- mistake, an invoker-rights function still hits RLS-with-no-policies and
-- writes nothing, rather than cheerfully resetting another user's counter.
-- ---------------------------------------------------------------------------

create or replace function public.increment_and_check_rate_limit(
  p_user_id        uuid,
  p_limit          integer default 120,
  p_window_seconds integer default 3600
)
returns table (
  allowed           boolean,
  request_count     integer,
  window_started_at timestamptz
)
language sql
set search_path = public
as $$
  with bumped as (
    insert into public.search_rate_limits as l (user_id, window_started_at, request_count, updated_at)
    values (p_user_id, now(), 1, now())
    on conflict (user_id) do update
      set request_count =
            case
              when l.window_started_at <= now() - make_interval(secs => p_window_seconds)
                then 1
              else l.request_count + 1
            end,
          window_started_at =
            case
              when l.window_started_at <= now() - make_interval(secs => p_window_seconds)
                then now()
              else l.window_started_at
            end,
          updated_at = now()
    returning l.request_count, l.window_started_at
  )
  -- Post-increment, so the request that takes the count to exactly p_limit is
  -- the last one allowed and the next one is refused.
  select b.request_count <= p_limit, b.request_count, b.window_started_at
    from bumped b;
$$;

comment on function public.increment_and_check_rate_limit is
  'Atomically counts one food-search request for a user and reports whether the '
  'fixed window is over its limit. Called by the food-search Edge Function with '
  'the service role.';

-- A function is granted EXECUTE to PUBLIC on creation, which here would let any
-- authenticated caller inflate — or, by waiting out a window, reset — another
-- user's counter straight through PostgREST. Revoked first, then granted to
-- the one role that is meant to call it. `public` covers anon/authenticated,
-- but they are named too so a future default change cannot quietly re-add them.
revoke execute on function public.increment_and_check_rate_limit(uuid, integer, integer)
  from public, anon, authenticated;

grant execute on function public.increment_and_check_rate_limit(uuid, integer, integer)
  to service_role;
