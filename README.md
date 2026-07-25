# MacroTrack

[![CI](https://github.com/alefiori/macro-track/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/alefiori/macro-track/actions/workflows/ci.yml)
[![Netlify Status](https://api.netlify.com/api/v1/badges/711ad0e3-f068-4066-8538-38bab13b2bab/deploy-status)](https://app.netlify.com/sites/macros-track/deploys)

A responsive, installable daily macros tracker built with **React + Vite +
TypeScript**, **Tailwind CSS**, and **Supabase** (Postgres + Auth). Set
per-weekday macro targets, log foods against them, and watch your daily carbs /
protein / fats fill up. Food data comes from your own custom foods, foods shared
by the community, and three free databases:
[Open Food Facts](https://world.openfoodfacts.org),
[USDA FoodData Central](https://fdc.nal.usda.gov), and
[Edamam](https://developer.edamam.com/food-database-api).

The app is a **PWA** (installable, works offline via a precached shell), is fully
**localized into 7 languages**, and lets you **try it instantly as a guest**
before creating an account.

The UI is a faithful port of the Google Stitch design export in
[`design/stitch_macrotrack_health_dashboard/`](design/stitch_macrotrack_health_dashboard/) —
colors, typography, spacing, radii, and components are taken from `DESIGN.md`
and the per-screen `code.html` files.

## Features

- **Email/password auth** (sign up, sign in, sign out, forgot password) with a
  persisted session; all app routes are gated behind an auth guard.
- **Guest mode** — "continue as guest" starts an anonymous session so you can
  try the app with zero signup. A persistent banner offers to **upgrade to a
  permanent account** later, keeping the same `user_id` so all logged data
  carries over.
- **My Targets** — per-weekday carbs/protein/fats goals with live calorie totals
  and "copy one day to all days".
- **Daily Tracker** — date selector, three macro progress rings (consumed vs.
  target + remaining), foods grouped by meal with inline edit/delete, and a
  calorie summary.
- **Copy day & copy meal** — duplicate a whole day's logs onto another date, or
  copy a single meal into any meal slot on any day (appends, preserving
  servings).
- **Editable meals** — rename your meals, add or remove them, and reorder them
  from the Profile page. Everyone starts from breakfast, lunch, snack, dinner;
  logged items follow a meal when it's renamed or moved, and deleting a meal
  moves its items to the one above it rather than losing them.
- **Add Food** — debounced search merging your own foods, community foods, and
  live Open Food Facts / USDA / Edamam results (each tagged with its source);
  pick a meal, adjust servings, and log. Includes a **barcode scanner**
  (camera-based, via ZXing) for looking foods up by their UPC/EAN.
- **Create Custom Food** — name, serving, per-serving macros with live calorie
  calc, plus "save & add to today".
- **My Foods** — manage your custom and imported foods, and **share them to the
  community** (or unshare) so other users can find and reuse them.
- **Share meals & days** — export a meal or a whole day as compact,
  emoji-annotated plain text via the native share sheet (WhatsApp, iMessage, …),
  falling back to the clipboard where no share sheet exists.
- **Internationalization** — the whole UI, sign-in and reset-password screens
  included, is available in English, Italian, French, Spanish, German,
  Portuguese, and Dutch. **First run follows the device language**; picking one
  (before signing in, or from the Profile page) pins it, and that single
  preference drives both the interface language **and** the language of Open
  Food Facts results.
- **Installable PWA** — add to home screen / install as an app; the app shell is
  precached so it launches offline.

## Tech stack

| Concern    | Choice                                                            |
| ---------- | ---------------------------------------------------------------- |
| Build      | Vite + React 18 + TypeScript                                     |
| Styling    | Tailwind CSS (via PostCSS, not the CDN)                          |
| Routing    | React Router v6                                                  |
| Backend    | Supabase (Postgres + Auth + RLS + Edge Functions)               |
| Food data  | Open Food Facts + USDA FoodData Central + Edamam (server-side proxy) |
| Barcode    | `@zxing/browser` + `@zxing/library` (camera scanning)           |
| i18n       | Zero-dependency in-house catalog (7 locales)                    |
| PWA        | `vite-plugin-pwa` (Workbox) + `@vite-pwa/assets-generator`      |

## Getting started

### 1. Create a Supabase project

1. Sign in at [supabase.com](https://supabase.com) and create a new project.
2. Once it's provisioned, open **Settings → API** and note the
   **Project URL** and the **anon/public** API key.

### 2. Run the database migrations

The schema (tables + row-level security, profiles, community foods, and the
extra food sources) lives in the ordered SQL files under
[`supabase/migrations/`](supabase/migrations/).

**Option A — Supabase CLI (recommended, applies every migration):**

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B — Supabase SQL Editor:** open the SQL Editor in the dashboard and run
each migration file **in order** (`0001_init.sql` → `0008_device_default_language.sql`).

Together the migrations create `macro_targets`, `foods`, `food_logs`,
`profiles`, and `meals`; enable RLS with owner-only policies (global foods with a
null `user_id` are readable by everyone); add the `usda` and `edamam` food
sources; add per-user profile settings (preferred language); add **community
foods** (`foods.is_public`) — including the guards that keep a shared food safe
to unshare and prevent deleting one that other people have logged; and make
meals **per-user rows** (seeded with the defaults for new and existing accounts)
instead of a fixed enum on `food_logs.meal`; and make `profiles.off_language`
nullable, where NULL means "no explicit choice — follow the device language".

### 3. Enable guest sign-in (optional but recommended)

The "continue as guest" flow uses Supabase **anonymous sign-ins**. Enable them
under **Authentication → Providers → Anonymous Sign-Ins** in the dashboard.
Without this, only email/password auth works.

### 4. Deploy the `food-search` Edge Function

All external food lookups (text search + barcode) run **server-side** in a
Supabase [Edge Function](supabase/functions/food-search), not from the browser.
This is required: [Open Food Facts](https://world.openfoodfacts.org)' search API
sends no CORS headers, so browsers can't call it directly, and the USDA/Edamam
API keys must not ship in the client bundle. The function fans out to every
source in parallel, normalizes results to a shared shape, and de-duplicates them.
It also caches each merged result briefly (60 s per query + language) so the
burst of requests a debounced search box fires as you type collapses onto a
single upstream fan-out — keeping the app well under the sources' rate limits.

```bash
supabase functions deploy food-search --project-ref <your-project-ref>

# Optional: set the USDA key as a function secret (defaults to DEMO_KEY)
supabase secrets set USDA_API_KEY=your-fdc-api-key --project-ref <your-project-ref>

# Optional: enable the Edamam source (skipped entirely when unset)
supabase secrets set EDAMAM_APP_ID=your-app-id EDAMAM_APP_KEY=your-app-key --project-ref <your-project-ref>

# Optional: authenticate Open Food Facts to skip its anonymous rate limit
supabase secrets set OFF_USERNAME=your-off-user OFF_PASSWORD=your-off-password --project-ref <your-project-ref>
```

A free USDA key comes from the
[FoodData Central signup](https://fdc.nal.usda.gov/api-key-signup.html); without
it the function uses the shared `DEMO_KEY`, which works but is heavily
rate-limited (and may return 429s under load). Edamam credentials come from the
[Edamam Food Database API](https://developer.edamam.com/food-database-api)
(free tier available); without them the Edamam source is silently skipped and
the other sources still work.

Open Food Facts needs no API key — read access is fully open. Text search uses
OFF's **Search-a-licious** endpoint (`search.openfoodfacts.org`), which OFF
actively maintains and which stays responsive under the bursty traffic a search
box generates; the legacy CGI `search.pl` endpoint, by contrast, 503s after only
a few rapid anonymous calls, which would silently drop OFF — and the newer/niche
products only OFF covers — from results. Barcode lookup still uses OFF's v2
product endpoint, which can throttle **anonymous** traffic during peak load
(returning 503s). To lift that, set `OFF_USERNAME` / `OFF_PASSWORD` to a free
[Open Food Facts account](https://world.openfoodfacts.org): the function then
sends those over HTTP Basic Auth (OFF's only credential — there are no keys) and
the requests skip the anonymous limit. When unset, OFF calls stay anonymous.

> **Until the function is deployed, food search and barcode lookup return
> nothing** — the client no longer calls the food APIs directly.

### 5. Configure environment variables

```bash
cp .env.example .env
```

Then fill in `.env` with your project's values:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

No food-API keys live here — they're function secrets (see step 4), kept out of
the client bundle. `.env` is gitignored — never commit secrets. The anon key is
safe to ship in a client bundle; RLS is what protects your data.

> **Email confirmation:** by default Supabase requires email confirmation on
> sign-up. For local testing you can disable it under
> **Authentication → Providers → Email** so new accounts can sign in
> immediately.

### 6. Install and run

```bash
npm install
npm run dev
```

Open the printed local URL (default <http://localhost:5173>).

Other scripts:

```bash
npm run build         # type-check + production build
npm run preview       # preview the production build
npm run typecheck     # type-check only (no emit)
npm run test          # unit + component tests (Vitest)
npm run test:watch    # Vitest in watch mode
npm run test:coverage # unit tests with a V8 coverage report
npm run e2e           # end-to-end tests (Playwright)
```

## How external food data is modeled

Open Food Facts, USDA FoodData Central, and Edamam all report nutrients
**per 100 g**, so every imported food is stored on a fixed **100 g basis**
(`serving_amount=100`, `serving_unit='g'`) using the per-100g values directly —
logging then works in multiples of 100 g (1.5 servings = 150 g). When a search
result is logged, the app **upserts** it into `foods` with the appropriate
`source` (`'openfoodfacts'`, `'usda'`, or `'edamam'`), `off_id=<the source's id>`
(barcode/code for OFF, `fdcId` for USDA, `foodId` for Edamam), and
`is_custom=false` — de-duplicating on
`(source, off_id)` — before inserting the `food_logs` row. Logs always reference
a stable local food. A result with **no** macro data at all is skipped, but one
that carries only *some* macros is kept with the missing values treated as `0`
(mirroring how Edamam omits zero-valued nutrients). This keeps the many
newly-added / community-entered Open Food Facts products — which often have
partial nutrition — visible in search rather than silently dropped; the imported
food can be edited as a custom food to correct any blank. (USDA, whose entries
are curated and macro-complete, still requires all three.)

Search ([`useFoodSearch`](src/hooks/useFoodSearch.ts)) queries the user's own
foods (locally, via Supabase) alongside a single call to the
[`food-search` Edge Function](supabase/functions/food-search/index.ts) through a
thin client ([`src/lib/foodApi.ts`](src/lib/foodApi.ts)). The function holds a
small registry of source adapters — currently Open Food Facts, USDA, and
Edamam — runs them in parallel, normalizes each to the shared
`ExternalFood` shape, and merges + de-duplicates across sources; a failing source
degrades gracefully to no results from that source. The pure
raw-JSON-to-`ExternalFood` mapping lives in a Deno-free
[`normalize.ts`](supabase/functions/food-search/normalize.ts) so it can be
unit-tested from Vitest ([`normalize.test.ts`](supabase/functions/food-search/normalize.test.ts)),
while `index.ts` keeps the fetch / env / caching concerns. **Adding a new source**
(e.g. FatSecret, Nutritionix) is a server-side-only change: add an adapter to the
function's `SOURCES` array — no client or env changes needed. All math (4/4/9 kcal
per gram, per-serving scaling, per-100g conversion, remaining-vs-target, ring
offsets) lives in [`src/lib/macros.ts`](src/lib/macros.ts).

## Community foods

Any custom food can be **shared to the community** by toggling `foods.is_public`
from **My Foods**; shared foods then show up in every user's search. Sharing
preserves attribution (the owner's `user_id` is kept), so publishers keep
edit/delete rights. Two safety guards back this (see
[`0006_community_food_safety.sql`](supabase/migrations/0006_community_food_safety.sql)):

- **Unsharing is always safe** — a user can still read any food they've logged,
  even after the owner unshares it, so a logged entry never breaks.
- **A shared food that others have logged can't be deleted** — deletion would
  cascade to other people's logs, so the owner must unshare it instead.

## Meals

Meals are rows in the `meals` table, one set per user, so their **names, count
and order** are all editable from the Profile page. `meals.key` is a stable slug
that `food_logs.meal` points at: renaming a meal only changes its `name`, so
logged items follow it. A null `name` means "use the built-in translated label",
which keeps the four defaults localized until someone renames them; meals a user
creates carry their own name in every language.

New accounts are seeded (by the `handle_new_user` trigger) with **breakfast,
lunch, snack, dinner** — snack sits third, between lunch and dinner, which is
when most people actually eat it. Existing accounts were backfilled by the same
migration, and the app re-seeds any account that somehow has no meals. Deleting a
meal first moves anything logged in it to the meal above, so no entry is lost,
and the last remaining meal can't be deleted.

## Internationalization

The UI ships in 7 languages (English, Italian, French, Spanish, German,
Portuguese, Dutch) — including the **sign-in, sign-up and reset-password
screens**, which carry their own language picker. The i18n core
([`src/lib/i18n/`](src/lib/i18n/)) is dependency-free: catalogs are plain nested
objects and `translate()` resolves dot-paths with `{name}` interpolation, falling
back to English then the raw key so a missing translation never throws. The
English catalog ([`locales/en.ts`](src/lib/i18n/locales/en.ts)) is canonical —
TypeScript enforces that every other locale matches its shape.

**The default is the device language.** `profiles.off_language` is NULL until
someone actually picks a language, and a NULL resolves against
`navigator.languages` on every load — so a first run (and every run after it, on
an account nobody has set a language for) speaks the device's language, and
follows it if the device changes. The Profile page says as much while that's the
case.

Picking a language pins it: it's written to `profiles.off_language` and mirrored
to local storage, so it survives a reload, applies before sign-in on the auth
pages, and **one preference then drives both the UI language and the Open Food
Facts result language**. A choice made on the auth pages rides along as sign-up
metadata, which the database trigger uses to seed the new profile; without one,
the account starts with no preference rather than being frozen at English.

## Project structure

```
src/
  components/   # layout (incl. guest banner), UI primitives, profile settings,
                #   Add Food modal, barcode scanner
  context/      # AuthContext, ProfileContext, I18nContext, MealsContext, AppShellContext
  hooks/        # useFoodLogs, useTargets, useFoodSearch, useDebounce, useScrollLock
  lib/          # supabase client, macros math, foodApi (Edge Function client),
                #   foods (CRUD/copy/share), meals (rename/reorder), exportText
                #   (chat share), i18n, types
  pages/        # Auth, ForgotPassword, Dashboard, Targets, MyFoods, CreateCustomFood, Profile
supabase/
  functions/    # food-search Edge Function (external food data proxy)
  migrations/   # SQL schema + RLS + profiles + community foods + editable meals
```

## Testing

- **Unit + component tests** run on [Vitest](https://vitest.dev) with
  [React Testing Library](https://testing-library.com/). Test files live next to
  the code they cover (`src/**/*.test.ts[x]`); shared helpers and fixture
  factories are in [`src/test/`](src/test/). Run `npm run test` (or
  `npm run test:coverage` for a report). The Supabase client is mocked, so no
  backend is needed.
- **End-to-end tests** run on [Playwright](https://playwright.dev) from the
  [`e2e/`](e2e/) directory and are **fully hermetic** — every Supabase request
  (auth, PostgREST, the Edge Function) is stubbed in
  [`e2e/fixtures/supabase.ts`](e2e/fixtures/supabase.ts), backed by an in-memory
  store, so the suite needs no secrets and never hits the network. Run
  `npm run e2e` (first time locally: `npx playwright install chromium`). The
  build is driven by [`.env.test`](.env.test), whose stub host the fixtures
  intercept.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and PR:
the app **build**, the **unit** suite (coverage uploaded as an artifact, not
gated), and the **E2E** suite. On pushes to `main` only, two deploy jobs also
run: the existing **Netlify deploy status** check, and a **Supabase deploy** that
applies database migrations (`supabase db push`) and redeploys the `food-search`
Edge Function. The Supabase job is skipped (with a warning, not a failure) unless
these repository secrets are set:

| Secret                  | Purpose                                                        |
| ----------------------- | ------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Personal access token (Supabase dashboard → Account → Tokens) |
| `SUPABASE_PROJECT_REF`  | Hosted project ref (the `<ref>` in `<ref>.supabase.co`)       |
| `SUPABASE_DB_PASSWORD`  | Database password, used by `supabase db push`                 |

The Edge Function deploy pushes **code only** — it doesn't touch the function
secrets from step 4 (`USDA_API_KEY`, `EDAMAM_*`, `OFF_*`). If a first `db push`
fails because the remote schema diverged from the migration history, run a
one-time [`supabase migration repair`](https://supabase.com/docs/reference/cli/supabase-migration-repair).

## Credits

Food data is provided by:

- **[Open Food Facts](https://world.openfoodfacts.org)** — a collaborative,
  free and open database of food products from around the world, made available
  under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).
  Requests identify this app via a descriptive `User-Agent`, as OFF requests.
- **[USDA FoodData Central](https://fdc.nal.usda.gov)** — U.S. Department of
  Agriculture, Agricultural Research Service. FoodData Central data is in the
  public domain.
- **[Edamam Food Database](https://developer.edamam.com/food-database-api)** —
  nutrition data provided by the Edamam Food Database API.
</content>
</invoke>
