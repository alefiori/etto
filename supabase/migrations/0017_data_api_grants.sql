-- Restore the Data API grants that migrations 0001-0015 never wrote.
--
-- THE BUG: none of the earlier migrations grant table privileges to the API
-- roles. Until recently that did not matter, because Postgres roles created by
-- `postgres` in `public` were auto-exposed to `anon`, `authenticated` and
-- `service_role`. Supabase has reversed that default (see the
-- `auto_expose_new_tables` note in supabase/config.toml, and the fact that the
-- field is removed on 2026-10-30 once always-revoked is permanent).
--
-- The result is that a database built from these migrations today — a fresh
-- `supabase db reset`, a new environment, a restored project — comes up with
-- every table unreadable and the app dead on arrival ("permission denied for
-- table foods" on the first query). The existing production database still
-- works only because its tables predate the change and kept the grants they
-- were auto-given.
--
-- So this migration is a no-op where it is already true, and the difference
-- between a working and a broken app everywhere else.
--
-- WHAT THIS IS NOT: this does not decide who may read what. Every table here has
-- RLS enabled with owner-scoped policies, and RLS remains the authorization
-- boundary. A GRANT only says "this role may reach this table through the Data
-- API at all"; the policies still decide which rows. Both are required — a table
-- with policies and no grant is invisible, and a table with a grant and no
-- policies is empty.
--
-- Deliberately granted per table rather than with `grant ... on all tables in
-- schema public`, because two tables are meant to be narrower than the rest and
-- a blanket grant would silently widen them:
--
--   * reference_foods / reference_datasets — read-only to users, written only by
--     the service role from scripts/import-reference-foods.mjs. 0016 already
--     grants exactly that, so they are absent below.
--   * subscriptions — a user may read their entitlement and must never write it
--     (0012 gives it a select policy and deliberately no insert/update/delete
--     policy). It gets select only, so the intent holds in the grants too and
--     not just in the policies.
--
-- NOTE FOR FUTURE MIGRATIONS: new tables are no longer exposed automatically.
-- Any migration that creates a table must grant on it explicitly, the way 0016
-- does, or that table will 404 through PostgREST while working perfectly in
-- `psql`. `alter default privileges` is intentionally NOT used here: it would
-- recreate the blanket auto-exposure that is being removed, and make every
-- future table public-by-default again.

-- ---------------------------------------------------------------------------
-- Schema access. Without usage on the schema the table grants below are unreachable.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- User-owned data: full DML, gated row-by-row by the owner policies from
-- 0001 (macro_targets, foods, food_logs), 0003 (profiles), 0007 (meals),
-- 0009 (weight_logs) and 0010 (water_logs).
--
-- `anon` is granted alongside `authenticated` to match the Supabase default the
-- rest of this schema was built against, so that a fresh database and the
-- existing production one behave identically. It gains very little in practice:
-- every policy on these tables keys off auth.uid(), so an unauthenticated
-- request matches no rows — the one exception being the global/public foods in
-- 0004/0006, which are readable by design. The app itself never relies on it,
-- since guest mode uses anonymous *sign-in* and therefore the authenticated role.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.macro_targets to anon, authenticated;
grant select, insert, update, delete on public.foods         to anon, authenticated;
grant select, insert, update, delete on public.food_logs     to anon, authenticated;
grant select, insert, update, delete on public.profiles      to anon, authenticated;
grant select, insert, update, delete on public.meals         to anon, authenticated;
grant select, insert, update, delete on public.weight_logs   to anon, authenticated;
grant select, insert, update, delete on public.water_logs    to anon, authenticated;

-- Read-only to users: entitlements are decided server-side from the RevenueCat
-- webhook, never by the client.
grant select on public.subscriptions to anon, authenticated;

-- ---------------------------------------------------------------------------
-- service_role bypasses RLS, but still needs the table privilege. Two Edge
-- Functions depend on this: revenuecat-webhook writes public.subscriptions, and
-- delete-account clears a departing user's rows. Both would fail with
-- "permission denied" on a database built from these migrations.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.macro_targets to service_role;
grant select, insert, update, delete on public.foods         to service_role;
grant select, insert, update, delete on public.food_logs     to service_role;
grant select, insert, update, delete on public.profiles      to service_role;
grant select, insert, update, delete on public.meals         to service_role;
grant select, insert, update, delete on public.weight_logs   to service_role;
grant select, insert, update, delete on public.water_logs    to service_role;
grant select, insert, update, delete on public.subscriptions to service_role;
