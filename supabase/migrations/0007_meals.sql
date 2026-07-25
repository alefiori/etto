-- Editable meals.
--
-- Meals used to be a fixed enum (breakfast/lunch/dinner/snack) baked into a
-- check constraint on food_logs.meal. They are now rows in `meals`, one set per
-- user, so people can rename them, add or remove them, and change their order.
--
-- `meals.key` is the stable slug stored on food_logs.meal — renaming a meal
-- changes `name` only, so existing logs keep pointing at the same meal. A null
-- `name` means "use the built-in localized label for this key", which keeps the
-- four defaults translated until the user renames them.

-- ---------------------------------------------------------------------------
-- meals
-- ---------------------------------------------------------------------------
create table if not exists public.meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null,
  name       text,
  icon       text not null default 'restaurant',
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key),
  constraint meals_key_format check (key ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint meals_name_length check (name is null or char_length(btrim(name)) between 1 and 40),
  constraint meals_position_range check (position >= 0)
);

create index if not exists meals_user_position_idx on public.meals (user_id, position);

create trigger meals_set_updated_at
  before update on public.meals
  for each row execute function public.set_updated_at();

alter table public.meals enable row level security;

create policy "meals owner select" on public.meals
  for select using (auth.uid() = user_id);
create policy "meals owner insert" on public.meals
  for insert with check (auth.uid() = user_id);
create policy "meals owner update" on public.meals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "meals owner delete" on public.meals
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- food_logs.meal is now a free-form key referencing the user's meals.key, so
-- the fixed-enum check has to go. Keep it non-blank.
-- ---------------------------------------------------------------------------
alter table public.food_logs drop constraint if exists food_logs_meal_check;
alter table public.food_logs drop constraint if exists food_logs_meal_not_blank;
alter table public.food_logs add constraint food_logs_meal_not_blank check (btrim(meal) <> '');

-- ---------------------------------------------------------------------------
-- Default meal set. Snack sits third — between lunch and dinner — which is
-- where most people actually eat it.
-- ---------------------------------------------------------------------------
create or replace function public.default_meals()
returns table (meal_key text, meal_icon text, meal_position int)
language sql
immutable
as $$
  select * from (values
    ('breakfast', 'wb_sunny',    0),
    ('lunch',     'light_mode',  1),
    ('snack',     'cookie',      2),
    ('dinner',    'nights_stay', 3)
  ) as m(k, i, p);
$$;

create or replace function public.seed_default_meals(uid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.meals (user_id, key, icon, position)
  select uid, d.meal_key, d.meal_icon, d.meal_position from public.default_meals() d
  on conflict (user_id, key) do nothing;
$$;

-- Only the sign-up trigger (and migrations) may seed: the function is SECURITY
-- DEFINER, so leaving it callable would let any user write meals for any uid.
revoke all on function public.seed_default_meals(uuid) from public;
revoke all on function public.default_meals() from public;

-- ---------------------------------------------------------------------------
-- New users get a profile *and* the default meals. The profile language now
-- comes from the sign-up metadata when the client sent one (the language picker
-- on the auth pages), so a user who signs up in Italian stays in Italian.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := nullif(new.raw_user_meta_data ->> 'locale', '');
begin
  insert into public.profiles (id, off_language)
  values (
    new.id,
    case when requested in ('en', 'it', 'fr', 'es', 'de', 'pt', 'nl') then requested else 'en' end
  )
  on conflict (id) do nothing;

  perform public.seed_default_meals(new.id);
  return new;
end;
$$;

-- Backfill the default meals for everyone who signed up before this migration.
insert into public.meals (user_id, key, icon, position)
select u.id, d.meal_key, d.meal_icon, d.meal_position
from auth.users u
cross join public.default_meals() d
on conflict (user_id, key) do nothing;
