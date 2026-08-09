-- Make deleting an account safe for everyone else.
--
-- Apple's guideline 5.1.1(v) requires any app offering account creation to
-- offer account deletion from inside the app, so `delete-account` (the Edge
-- Function) calls auth.admin.deleteUser(). Everything owned by that user then
-- cascades away, which is exactly what should happen — with one exception that
-- would quietly destroy *other* people's data:
--
--   public.foods.user_id   references auth.users on delete cascade
--   public.food_logs.food_id references public.foods on delete cascade
--
-- A food the departing user had **shared with the community** is still a food
-- other users have logged. Following those two cascades, deleting one account
-- would delete that shared food and then every other user's food_logs row
-- pointing at it — silently rewriting strangers' diaries.
--
-- So shared foods are orphaned instead of deleted: user_id is set to NULL,
-- which the schema already has a meaning for. `foods` has allowed NULL user_id
-- since 0001 for global foods, and the select policy from 0004 reads
-- `auth.uid() = user_id or user_id is null or is_public` — so an orphaned row
-- stays readable by everyone, exactly as it was while shared. It simply no
-- longer has an owner who can edit or unshare it.
--
-- The user's **private** foods are not touched here and cascade away normally:
-- nobody else can have logged them, because the select policy never showed
-- them to anyone else.
--
-- BEFORE DELETE, not AFTER: the update has to land while the auth.users row is
-- still present, or the cascade has already taken the rows with it.

create or replace function public.handle_user_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.foods
     set user_id = null
   where user_id = old.id
     and is_public;
  return old;
end;
$$;

comment on function public.handle_user_delete is
  'Orphans community-shared foods before an account is deleted, so other users'' '
  'logs that reference them survive. See supabase/migrations/0014_account_deletion.sql.';

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function public.handle_user_delete();
