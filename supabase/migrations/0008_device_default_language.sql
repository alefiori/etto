-- Default the language to the device's, until the user picks one.
--
-- `profiles.off_language` was NOT NULL DEFAULT 'en', so every account that had
-- never touched the language picker was pinned to English — even on a device
-- set to Italian. The column is now nullable, and NULL means "no explicit
-- choice yet: follow the device language". The app resolves NULL against
-- `navigator.languages` on every load, so the default follows the device
-- instead of being frozen at sign-up time.

alter table public.profiles alter column off_language drop default;
alter table public.profiles alter column off_language drop not null;

comment on column public.profiles.off_language is
  'Explicit language choice (UI + Open Food Facts). NULL = follow the device language.';

-- The existing `off_language in (...)` check still holds: a NULL makes the IN
-- expression NULL, which a CHECK treats as satisfied.

-- Clear the language of every profile nobody has ever updated — those rows only
-- say 'en' because that used to be the column default, not because anyone chose
-- it. A row whose language was actually saved has updated_at > created_at
-- (see the profiles_set_updated_at trigger), so real choices are left alone.
update public.profiles
   set off_language = null
 where off_language = 'en'
   and updated_at = created_at;

-- ---------------------------------------------------------------------------
-- Sign-up seeds the language only when the client sent an explicit choice (the
-- picker on the auth pages). Otherwise the profile starts with no preference
-- and the app follows the device. Meal seeding is unchanged from 0007.
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
    case when requested in ('en', 'it', 'fr', 'es', 'de', 'pt', 'nl') then requested else null end
  )
  on conflict (id) do nothing;

  perform public.seed_default_meals(new.id);
  return new;
end;
$$;
