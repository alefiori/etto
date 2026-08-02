-- Hydration logging.
--
-- Why this exists:
--
--   1. Water is the one thing people track alongside macros that this app had
--      no answer for, and it is a daily-habit feature — it brings someone back
--      into the app on days they don't feel like logging food.
--   2. One row per drink, not one aggregate row per day. That mirrors food_logs
--      (also append-only, also summed client-side), makes "undo the last glass"
--      a plain delete, and avoids the read-modify-write race an incrementing
--      daily upsert would hit when someone taps +250ml twice in a second.
--   3. Stored in millilitres always; profiles.unit_system decides whether the
--      user sees ml or fl oz. Same rule as weight and as imported foods.
--   4. profiles.water_goal_ml is nullable and NULL means "derive it from
--      bodyweight" — the convention profiles.off_language already established,
--      where NULL means "follow the device" rather than "no value". A derived
--      goal keeps working as the user's weight changes, and only becomes fixed
--      if they deliberately override it.

alter table public.profiles
  add column if not exists water_goal_ml numeric
    check (water_goal_ml > 0 and water_goal_ml <= 10000);

comment on column public.profiles.water_goal_ml is
  'Explicit daily hydration goal in ml. NULL means derive it from bodyweight.';

-- ---------------------------------------------------------------------------
-- water_logs: one row per drink
-- ---------------------------------------------------------------------------
create table if not exists public.water_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  log_date   date not null default current_date,
  amount_ml  numeric not null check (amount_ml > 0 and amount_ml <= 5000),
  created_at timestamptz not null default now()
);

create index if not exists water_logs_user_date_idx
  on public.water_logs (user_id, log_date);

-- ---------------------------------------------------------------------------
-- Row Level Security: owner-only, same shape as macro_targets and weight_logs.
-- ---------------------------------------------------------------------------
alter table public.water_logs enable row level security;

drop policy if exists "water_logs owner select" on public.water_logs;
create policy "water_logs owner select" on public.water_logs
  for select using (auth.uid() = user_id);

drop policy if exists "water_logs owner insert" on public.water_logs;
create policy "water_logs owner insert" on public.water_logs
  for insert with check (auth.uid() = user_id);

drop policy if exists "water_logs owner update" on public.water_logs;
create policy "water_logs owner update" on public.water_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "water_logs owner delete" on public.water_logs;
create policy "water_logs owner delete" on public.water_logs
  for delete using (auth.uid() = user_id);
