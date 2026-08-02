-- Adaptive targets opt-in.
--
-- When enabled, the app recalculates the seven macro_targets rows from measured
-- intake and weight change instead of leaving them to be typed in by hand. It
-- is a per-user mode rather than a separate table of settings because the
-- calculation's inputs already live on profiles (sex, height, activity, goal)
-- and its outputs already live in macro_targets — this flag only decides which
-- of the two is authoritative.
--
-- Default false: an existing user's hand-set targets must not start moving
-- underneath them on deploy.

alter table public.profiles
  add column if not exists adaptive_targets_enabled boolean not null default false;

comment on column public.profiles.adaptive_targets_enabled is
  'When true, macro_targets is written by the adaptive engine and the manual editor is read-only.';
