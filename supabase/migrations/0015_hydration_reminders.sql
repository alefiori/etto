-- Hydration reminders (Pro).
--
-- The reminders themselves are *local* notifications scheduled on the device by
-- @capacitor/local-notifications — nothing is sent from a server, so there is no
-- push token, no device registry and no reason for this app to know which
-- devices a user has. What has to be stored is only the user's intent: whether
-- they want reminding, how often, and between which hours.
--
-- That intent belongs on `profiles` for the same reasons the appearance
-- preference did in 0013 — the table is already 1:1 with auth.users, already
-- carries per-user settings, already has the updated_at trigger, and the app
-- already loads the whole row on start-up, so the reminder settings arrive with
-- everything else rather than costing a second query on the path that arms them.
--
-- Why the window is stored as two integer hours rather than two `time` columns:
-- the scheduler only ever asks "which hours of today are in range", the picker
-- only ever offers whole hours, and an integer needs no timezone reasoning at
-- the boundary. Reminders fire in the device's local time by design — the point
-- is to drink during *your* waking day, and a user who flies to Tokyo wants the
-- 9-to-21 window there, not the one they left behind.
--
-- Defaults describe a sane schedule but do not turn anything on:
-- water_reminders_enabled is false, so nothing about deploying this migration
-- makes an existing user's phone start buzzing. The Pro gate lives in the app
-- and in the paywall, not here — an expired subscriber keeps their settings,
-- they just stop being armed, which is what makes resubscribing pick up where
-- they left off.

alter table public.profiles
  add column if not exists water_reminders_enabled boolean not null default false;

alter table public.profiles
  add column if not exists water_reminder_start_hour smallint not null default 9
    check (water_reminder_start_hour between 0 and 23);

alter table public.profiles
  add column if not exists water_reminder_end_hour smallint not null default 21
    check (water_reminder_end_hour between 1 and 24);

-- 30 minutes is the floor because anything tighter is an app you uninstall, and
-- 8 hours the ceiling because beyond that the window itself is the schedule.
alter table public.profiles
  add column if not exists water_reminder_interval_minutes smallint not null default 120
    check (water_reminder_interval_minutes between 30 and 480);

-- An inverted window would schedule nothing at all, silently. Reject it here so
-- a bad write fails loudly instead of looking like a broken feature. The end
-- hour is exclusive-ish — 24 means "up to midnight" — which is why this is `<`
-- rather than `<=` and why the end check above starts at 1.
alter table public.profiles
  drop constraint if exists profiles_water_reminder_window;
alter table public.profiles
  add constraint profiles_water_reminder_window
    check (water_reminder_start_hour < water_reminder_end_hour);

comment on column public.profiles.water_reminders_enabled is
  'When true, the device schedules local hydration reminders. Pro-gated in the app; storing it is not.';
comment on column public.profiles.water_reminder_start_hour is
  'First hour of the reminder window, in the device''s local time (0-23).';
comment on column public.profiles.water_reminder_end_hour is
  'Last hour of the reminder window, exclusive, in the device''s local time (1-24).';
comment on column public.profiles.water_reminder_interval_minutes is
  'Gap between reminders inside the window.';

-- No policy changes: the owner-only policies from 0003 are defined over the
-- table rather than a column list, so they already cover these columns.
