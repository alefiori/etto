-- Body metrics: the inputs an energy-balance model needs, plus a weight history.
--
-- Why this exists:
--
--   1. The app can currently only ask "how many grams did you eat?". To ever
--      estimate what a user actually burns, it needs their body (sex, age,
--      height) and a record of how their weight moves over time.
--   2. The body/goal settings go on `profiles` rather than a new table: profiles
--      is already 1:1 with auth.users, already carries per-user settings, and
--      already has the updated_at trigger. A separate table would add a join and
--      a second seeding path for no benefit.
--   3. Weight lives in its own table because it is a time series, one row per
--      day. `unique (user_id, log_date)` makes re-weighing on the same day an
--      upsert rather than a duplicate — people step on the scale twice.
--   4. Everything is stored metric (kg, cm). Display units are a *preference*
--      (profiles.unit_system), converted at the UI edge — the same rule the app
--      already applies to imported foods, which are all normalized to 100 g.
--
-- All new profile columns are nullable: existing rows predate them, and NULL
-- consistently means "not answered yet" so the app can prompt for what it needs
-- rather than inventing a default body.

-- ---------------------------------------------------------------------------
-- profiles: body + goal settings
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists sex text
    check (sex in ('female', 'male')),
  add column if not exists birthdate date,
  add column if not exists height_cm numeric
    check (height_cm > 0 and height_cm < 300),
  add column if not exists activity_level text
    check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  add column if not exists goal_direction text
    check (goal_direction in ('lose', 'maintain', 'gain')),
  add column if not exists goal_rate_kg_per_week numeric
    check (goal_rate_kg_per_week >= 0 and goal_rate_kg_per_week <= 1.5),
  add column if not exists unit_system text not null default 'metric'
    check (unit_system in ('metric', 'imperial'));

comment on column public.profiles.sex is
  'Biological sex, used only as a BMR-equation coefficient. Null until answered.';
comment on column public.profiles.goal_rate_kg_per_week is
  'Unsigned magnitude; goal_direction carries the sign. 0 = maintain.';
comment on column public.profiles.unit_system is
  'Display units only. Everything is stored metric and converted at the UI edge.';

-- ---------------------------------------------------------------------------
-- weight_logs: one weigh-in per day, always kilograms
-- ---------------------------------------------------------------------------
create table if not exists public.weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  log_date   date not null default current_date,
  weight_kg  numeric not null check (weight_kg > 0 and weight_kg < 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create index if not exists weight_logs_user_date_idx
  on public.weight_logs (user_id, log_date);

create trigger weight_logs_set_updated_at
  before update on public.weight_logs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: owner-only, same shape as macro_targets.
-- ---------------------------------------------------------------------------
alter table public.weight_logs enable row level security;

drop policy if exists "weight_logs owner select" on public.weight_logs;
create policy "weight_logs owner select" on public.weight_logs
  for select using (auth.uid() = user_id);

drop policy if exists "weight_logs owner insert" on public.weight_logs;
create policy "weight_logs owner insert" on public.weight_logs
  for insert with check (auth.uid() = user_id);

drop policy if exists "weight_logs owner update" on public.weight_logs;
create policy "weight_logs owner update" on public.weight_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "weight_logs owner delete" on public.weight_logs;
create policy "weight_logs owner delete" on public.weight_logs
  for delete using (auth.uid() = user_id);
