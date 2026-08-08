-- Appearance preference (light / dark), stored per account.
--
-- Modelled on `profiles.off_language` after 0008: NULL means "no explicit
-- choice yet: follow the device", which the app re-resolves against
-- prefers-color-scheme on every load rather than freezing whatever the device
-- happened to be when the choice was made. "System" in the picker is therefore
-- the *absence* of a value, not a third one — picking it clears the column, so
-- every device the account is signed into goes back to following itself.
--
-- It goes on `profiles` for the same reason the body metrics did in 0009: the
-- table is already 1:1 with auth.users, already carries per-user settings, and
-- already has the updated_at trigger.

alter table public.profiles
  add column if not exists theme text
    check (theme in ('light', 'dark'));

comment on column public.profiles.theme is
  'Explicit appearance choice. NULL = follow the device color scheme.';

-- No policy changes: the owner-only policies from 0003 are defined over the
-- table rather than a column list, so they already cover this column.
