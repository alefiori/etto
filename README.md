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

The UI is **Liquid Glass**: a violet system tint, floating chrome, and content
that scrolls underneath translucent, specular-edged lenses. Its information
architecture and layout still come from the Google Stitch export in
[`design/stitch_macrotrack_health_dashboard/`](design/stitch_macrotrack_health_dashboard/) —
typography, spacing and the four destinations are unchanged — but the material
and the palette are not; see [Theming](#theming).

## Features

- **Email/password auth** (sign up, sign in, sign out, forgot password) with a
  persisted session; all app routes are gated behind an auth guard.
- **Guest by default** — opening the app starts an anonymous session
  automatically, so a first-time visitor can log a meal before deciding whether
  to sign up. The account is real: a persistent banner offers to **upgrade to a
  permanent account** later, keeping the same `user_id` so everything logged in
  the meantime carries over. To use an **existing** account instead, the sign-in
  screen opens directly over the live guest session — reachable from the Profile
  page, the sidebar, or the banner, with **no need to sign out first**. Signing
  out simply drops back to a fresh guest (the default state) rather than a login
  wall. If anonymous sign-in is disabled on the project (or its per-IP hourly
  limit is hit), the app falls back to the sign-in screen rather than stalling.
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
- **Light & dark themes** — every screen has a dark counterpart: deep
  navy-tinted surfaces, brightened macro accents, and chrome one step lighter
  than the page. Like the language, it **follows the device by default**; the
  Appearance control on the Profile page (System / Light / Dark) pins a choice
  to the account, and the native status bar and splash screen follow along.
- **Weight tracking** — one weigh-in a day with a trend chart that separates the
  signal from the noise: raw readings are dots, the smoothed EWMA is the line,
  and the reported weekly rate uses a Theil–Sen fit so an overnight water swing
  doesn't read as a gain.
- **Water tracking** — quick-add glasses and bottles against a daily goal that
  derives itself from your bodyweight until you set one.
- **Adaptive targets** *(Pro)* — estimates what you actually burn from logged
  intake versus measured weight change, rather than multiplying a BMR formula by
  an activity guess, and explains every adjustment. Refuses to answer, by name,
  when the data can't support one.
- **Installable PWA** — add to home screen / install as an app; the app shell is
  precached so it launches offline.
- **Native iOS, iPadOS and Android** via Capacitor, from the same bundle. The
  layout has three window classes rather than two: bottom nav on a phone, a
  Material 3 **navigation rail** at tablet widths, and the full drawer on a
  desktop — so an iPad in portrait, in Split View or in Stage Manager gets a
  layout built for its size instead of stretched phone chrome.

## Tech stack

| Concern    | Choice                                                            |
| ---------- | ---------------------------------------------------------------- |
| Build      | Vite + React 19 + TypeScript                                     |
| Styling    | Tailwind CSS v4 (via PostCSS, not the CDN)                       |
| Routing    | React Router v7                                                  |
| Backend    | Supabase (Postgres + Auth + RLS + Edge Functions)               |
| Food data  | Open Food Facts + USDA FoodData Central + Edamam (server-side proxy) |
| Barcode    | `@zxing/browser` + `@zxing/library` (camera scanning)           |
| i18n       | Zero-dependency in-house catalog (7 locales)                    |
| PWA        | `vite-plugin-pwa` (Workbox) + `@vite-pwa/assets-generator`      |
| Native     | Capacitor 8 (iOS + Android) from the same Vite bundle           |
| Payments   | RevenueCat → webhook → Supabase (entitlement decided server-side) |

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
each migration file **in order** (`0001_init.sql` → `0013_theme.sql`).

Together the migrations create `macro_targets`, `foods`, `food_logs`,
`profiles`, and `meals`; enable RLS with owner-only policies (global foods with a
null `user_id` are readable by everyone); add the `usda` and `edamam` food
sources; add per-user profile settings (preferred language); add **community
foods** (`foods.is_public`) — including the guards that keep a shared food safe
to unshare and prevent deleting one that other people have logged; and make
meals **per-user rows** (seeded with the defaults for new and existing accounts)
instead of a fixed enum on `food_logs.meal`; make `profiles.off_language`
nullable, where NULL means "no explicit choice — follow the device language";
and add `profiles.theme`, which follows the same rule for light/dark.

### 3. Enable guest sign-in (optional but recommended)

The "continue as guest" flow uses Supabase **anonymous sign-ins**. Enable them
under **Authentication → Providers → Anonymous Sign-Ins** in the dashboard.
Without this the app cannot start a session on its own and every visitor lands
on the sign-in screen, so it is effectively required rather than optional.

> **Note for the web deploy:** every first visit now creates an `auth.users`
> row, which crawler traffic will inflate. Supabase's per-IP hourly limit on
> anonymous sign-ins (`anonymous_users`, default 30) caps the damage, and you
> can additionally require a CAPTCHA on anonymous sign-ins under
> **Authentication → Settings**. On the native apps this is a non-issue.

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
VITE_SITE_URL=https://macros-track.netlify.app
VITE_SUPPORT_EMAIL=support@your-domain.example
```

The last two feed the legal documents. `scripts/build-legal.mjs` renders
[`legal/`](legal) into `public/legal/` at build time with them substituted, and
[`src/lib/legal.ts`](src/lib/legal.ts) builds the app's links from the same
values, so the published documents and the in-app links can't disagree.
`VITE_SUPPORT_EMAIL` is **published** — it is the privacy contact in the policy
and the support address in both store listings — so a release build refuses to
render without it (`build-legal --strict`).

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
npm run lint          # ESLint (warnings are informational; errors fail CI)
npm run lint:fix      # ESLint with --fix
npm run test          # unit + component tests (Vitest)
npm run test:watch    # Vitest in watch mode
npm run test:coverage # unit tests with a V8 coverage report
npm run e2e           # end-to-end tests (Playwright)
npm run build:legal   # render legal/ into public/legal/
npm run store:assets  # marketing icon + Play feature graphic
npm run store:screenshots  # store screenshots at each required device size
```

## Mobile app (iOS + Android)

The same bundle runs on the web and inside a [Capacitor](https://capacitorjs.com)
shell — there is no separate native codebase. `capacitor.config.ts` points at
Vite's `dist/`, and the app adapts at runtime via
[`src/lib/platform.ts`](src/lib/platform.ts).

```bash
npm run build:native      # bundle without the service worker
npx cap add ios           # once, on macOS with Xcode
npx cap add android       # once, with Android Studio / SDK installed
npm run sync:native       # rebuild + copy into the native projects
npx cap open ios          # or: npx cap open android
```

**Running on a physical iPhone or iPad** needs one more thing. Capacitor's
template ships `DEVELOPMENT_TEAM = ""` with automatic signing, so Xcode stops
with *"Signing for 'App' requires a development team"* — the simulator is
unaffected, and so is CI, which builds unsigned. Setting the team in Xcode's
Signing & Capabilities editor does not stick: `ios/` is gitignored and
regenerated, so the next `npm run sync:native` hands the empty string back and
the error returns looking new. Put it in `.env` instead:

```bash
APPLE_TEAM_ID=XXXXXXXXXX   # developer.apple.com/account → Membership details
```

[`scripts/patch-ios-project.mjs`](scripts/patch-ios-project.mjs) writes it into
both build configurations after every sync. A real environment variable wins
over `.env`, which is how the release workflow supplies the same value from a
secret. Leave it unset and the script says so and carries on — the simulator
still builds.

**What differs natively, and why:**

| Concern | Web | Native |
| --- | --- | --- |
| Router | `BrowserRouter` | `HashRouter` — a WebView has no server to fall back to `index.html`, and the service worker that provided `navigateFallback` never registers, so a reload on a path would land on a white screen |
| Service worker | Precached app shell | Skipped (`--mode native`) — never registers under `capacitor://` |
| `detectSessionInUrl` | `true` | `false` — under hash routing the fragment is `#/signin`, which supabase-js would try to parse as an auth callback it doesn't own |
| Share / clipboard | Web Share API → clipboard | `@capacitor/share` → `@capacitor/clipboard`; both Web APIs are unavailable on the custom scheme |
| Hardware back | — | Closes the topmost overlay, else goes back, else exits ([`nativeBootstrap.ts`](src/lib/nativeBootstrap.ts)) |
| Purchases | Reported unavailable | RevenueCat (see below) |

### iPad

The iPad build is the same target as iPhone — Capacitor's template already sets
`TARGETED_DEVICE_FAMILY = "1,2"` and ships all four `~ipad` orientations, so
nothing native needed patching. What did need doing was the layout: between
768px and the drawer's 1024px breakpoint the app used to render phone chrome,
which on an iPad in portrait meant a bottom bar stretched across 820pt and a
floating button marooned in the corner. That range now gets a
[navigation rail](src/components/layout/AppLayout.tsx) — 80px, icons over short
labels, primary action at the top — which is what Material 3 specifies for its
"medium" window class.

Orientation is deliberately **not** locked. The PWA manifest asks for portrait,
which is right on a phone, but an iPad app that refuses to rotate cannot support
Split View and reads as a blown-up phone app.

Because `ios/` is regenerated on every build, [`scripts/verify-ipad.mjs`](scripts/verify-ipad.mjs)
re-checks three invariants after `cap sync` — device family includes iPad, the
iPad orientation list includes portrait and both landscapes, and
`UIRequiresFullScreen` is not set (it would disable Split View). It runs in CI
and from `npm run sync:native`, so a Capacitor upgrade that changes the template
fails loudly instead of quietly shipping an iPhone-only app.

`e2e/tablet.spec.ts` covers all of it at real device widths: iPhone, iPad
portrait and landscape, half-width Split View, and the 320pt Slide Over pane
(where it also asserts nothing overflows horizontally).

**Fonts are self-hosted** ([`public/fonts/`](public/fonts)) rather than loaded
from the Google Fonts CDN. This is not an optimization:
[`Icon.tsx`](src/components/ui/Icon.tsx) renders Material Symbols as a
*ligature*, so if that font fails to load every icon in the app renders as the
literal word — "dashboard", "close", "barcode_scanner". On the web a service
worker cached it; in a WebView none registers, making an offline first launch
exactly that failure. Both files are subsets (the icon font carries only the
glyphs this app uses — ~61 KB against ~3.6 MB for the full set; Manrope carries
latin + latin-ext, covering all 7 languages). The icon subset is regenerated by
[`scripts/subset-icon-font.py`](scripts/subset-icon-font.py); adding a new
`<Icon name="…">` means re-running it, or that glyph ships missing and renders
as its literal word — the very failure the ligature note above describes.

**Safe-area insets** come from spacing tokens in the `@theme` block of
[`src/index.css`](src/index.css) (`safe-top`, `safe-bottom`,
`safe-left`, `safe-right`, and the `topbar`/`bottomnav`/`fab` composites) that
read the `--safe-*` custom properties defined in [`src/index.css`](src/index.css).
Those resolve to `env(safe-area-inset-*)` — the notch and home-indicator insets
natively, `0` on the web — so the tokens can be applied unconditionally.

The indirection through variables is what makes them testable:
`env(safe-area-inset-*)` cannot be overridden, and a desktop browser reports no
insets, so a notch bug is invisible in a headless run.
[`e2e/safe-area.spec.ts`](e2e/safe-area.spec.ts) sets `--safe-*` on `<html>` to
fake an iPhone 15 and asserts geometrically that the chrome, the full-screen
modals and the bottom sheets all keep their controls inside the safe rectangle.

Every full-bleed surface needs its own inset — the shell's top bar and bottom
nav do not inset anything drawn over them. That means the `Modal` panel (which
is full-screen on a phone, so its header, and the only close button, would sit
under the status bar), the bottom sheets (`ConfirmDialog`, `FoodInfoModal`, the
guest upgrade sheet — flush with the bottom edge, padded clear of the home
indicator), and the `/signin` and `/forgot-password` routes, which render
outside `AppLayout` entirely. The insets go on the modal *panel* rather than its
backdrop so the panel's surface colour sits behind the status bar; the bar's
text is dark (set once in [`nativeBootstrap.ts`](src/lib/nativeBootstrap.ts))
and needs a light backing.

Because `ios.scrollEnabled` is `false`, a route that relies on the *document*
scrolling cannot scroll at all in the native shell. Pages inside `AppLayout`
scroll via `<main>`; the two auth routes own an `overflow-y-auto` container of
their own for the same reason.

### What the generated native projects get patched with

`ios/` and `android/` are gitignored and regenerated by `npx cap add` on every
build, so nothing about them can be a checked-in edit. Three post-sync scripts
add what Capacitor's templates don't, and each fails loudly rather than silently
if a Capacitor upgrade reshapes what it patches:

| Script | What and why |
| --- | --- |
| [`patch-android-webview.mjs`](scripts/patch-android-webview.mjs) | Pins WebView text zoom at 100%, so a large system font can't overflow the fixed chrome |
| [`patch-ios-project.mjs`](scripts/patch-ios-project.mjs) | `NSCameraUsageDescription` (without it iOS **terminates** the app on the first barcode scan), `CFBundleLocalizations` (the app localizes itself in JS, so iOS would otherwise advertise it as English-only), and the app's `PrivacyInfo.xcprivacy` — written *and* registered in the pbxproj Resources phase, since an unregistered file is never copied into the bundle. Also sets `DEVELOPMENT_TEAM` from `$APPLE_TEAM_ID` when one is set, since the template's empty team blocks every device build and Xcode's own fix is undone by the next sync |
| [`verify-ipad.mjs`](scripts/verify-ipad.mjs) | Asserts the iPad invariants Capacitor currently supplies for free |

### Still to do before shipping to the stores

- `npx cap add ios` / `android` need macOS + Xcode and the Android SDK
  respectively; the generated projects are gitignored.
- **Purchases don't work yet.** [`src/lib/purchases.ts`](src/lib/purchases.ts)
  is a stub that reports every purchase as unavailable, even on a device. Wire
  the RevenueCat SDK; `appUserID` **must** be the Supabase user id — that is
  what the webhook reads from `event.app_user_id` — and the prices shown must
  come from the store's offering rather than the hardcoded `PLANS` strings.
- **The paywall advertises four Pro features and only one exists.** Adaptive
  targets is built and gated; weight trends are built but ungated; hydration
  reminders and export don't exist. Listing features the binary doesn't contain
  is an App Store 2.3.1 rejection. Either cut the list or build them.
- Swap [`BarcodeScanner.tsx`](src/components/addfood/BarcodeScanner.tsx) to
  `@capacitor-mlkit/barcode-scanning`. Keep its `{ onDetected, onClose }` props
  and `AddFoodModal` needs no change; the existing `scanner.denied|notFound|inUse`
  translations map straight onto ML Kit's states. Native ML Kit renders *behind*
  the WebView, so `body`/`#root` need a transparent background while scanning.
  (The camera usage string is already in place either way.)
- Password reset needs a real Universal Link / App Link and a `/reset-password`
  route; `AuthContext.resetPassword` still builds its `redirectTo` from
  `window.location.origin`, which is `capacitor://localhost` natively.
- Enable anonymous sign-ins on the **production** Supabase project.
  [`supabase/config.toml`](supabase/config.toml) only configures a local
  `supabase start`; with them off in production the app falls back to a sign-in
  screen and a reviewer with no demo account meets a login wall.

Everything else a submission is refused for — the legal documents, in-app
account deletion, the camera usage string, the privacy manifest, version numbers
that increment, the listing copy and graphics — is in place. See
[`store/README.md`](store/README.md) for the form answers and the pre-upload
checklist.

## Legal documents and account deletion

The Terms and Privacy Policy are written in [`legal/`](legal) with `{{TOKEN}}`
placeholders and rendered into `public/legal/` by
[`build-legal.mjs`](scripts/build-legal.mjs) at build time. They are static
files rather than app routes on purpose: a store reviewer and a regulator both
load them directly, often on a bad connection, and they must render with no
JavaScript, no external stylesheet and no font request. The app links out to the
same copies rather than embedding a second one that would drift.

**Account deletion** (Apple 5.1.1(v)) lives at Profile → Delete account and runs
through the [`delete-account`](supabase/functions/delete-account) Edge Function.
It takes the user id from the caller's own JWT, never from the request body, so
a request cannot express "delete someone else"; it is deployed **with** JWT
verification, unlike `revenuecat-webhook`.

One thing that is not obvious: deleting an account used to be able to destroy
*other people's* data. `foods.user_id` cascades from `auth.users` and
`food_logs.food_id` cascades from `foods`, so removing an account that had
shared a food to the community would have deleted every other user's log entry
pointing at it. [`0014_account_deletion.sql`](supabase/migrations/0014_account_deletion.sql)
adds a `before delete` trigger that orphans shared foods first — `user_id NULL`
is a state the schema already means "global food", and the select policy already
allows it.

## Pro subscription

Pro unlocks adaptive targets, weight trends, hydration reminders and data
export. Everything the app shipped with — logging, barcode scanning, custom and
community foods, water tracking, all 7 languages — stays free.

**Entitlements are decided server-side.** `public.subscriptions` is the one
table here that is not owner-read-write: it has a `select` policy and
deliberately **no** insert, update or delete policy, so the database denies any
client write. The only writer is the
[`revenuecat-webhook`](supabase/functions/revenuecat-webhook) Edge Function,
running with the service role. RevenueCat is the source of truth because it is
the only party that has verified the receipt with Apple or Google; the on-device
SDK cache is a UI fast path, never authority.

```bash
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase secrets set REVENUECAT_WEBHOOK_SECRET=<same value as RevenueCat's
  webhook Authorization header>
```

`--no-verify-jwt` is required: RevenueCat is not a Supabase client and sends no
Supabase JWT — the shared secret authenticates it instead.

`expires_at` being NULL means "never expires", which is how the lifetime unlock
is stored. Webhook retries can arrive out of order, so an event stamped earlier
than the state already stored is ignored — otherwise a redelivered `EXPIRATION`
could revoke a customer whose `RENEWAL` had already landed.

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

## Theming

The color scheme is one layer of CSS variables. Every Material 3 role that
differs between light and dark is declared as space-separated RGB channels on
`:root` and redeclared under `.dark` in
[`src/index.css`](src/index.css); the `@theme` block in the same file points
each color token at its variable as `rgb(var(--token))`, and Tailwind v4
applies opacity modifiers with `color-mix()`. So `bg-surface`, `text-on-surface` and
`bg-primary/10` are all written once and mean the right thing in both schemes —
the `dark` class on `<html>` is the only switch, and there are barely any
`dark:` variants in the components.

Three things can't ride on a Tailwind class and are handled explicitly:

- **Macro accents** (`MACROS` / `WATER_COLOR` in
  [`src/lib/constants.ts`](src/lib/constants.ts)) reach the DOM as inline styles
  and SVG paints, so they are `rgb(var(--carbs))`-style references rather than
  literals. That keeps the swap in CSS: no theme hook threaded through eight
  files, and no React re-render when the scheme flips. Note that SVG *presentation
  attributes* don't substitute `var()`, which is why `ProgressRing`/`TrendChart`
  set `style={{ stroke }}` instead of `stroke=`.
- **Elevation.** A 4%-black card shadow is invisible on a dark page, so
  `shadow-card` is a variable too — dark deepens it and drops the bottom
  highlight, because a bright lower edge at night reads as a seam between two
  panels rather than as the underside of one.
- **The glass itself.** A lens is a translucent fill, a specular rim and a blur
  of whatever is behind it, so it can't be a Tailwind color: `bg-x/50` would
  multiply the baked-in alpha rather than replace it, and the rim is an inset
  shadow, not a border. Five classes in `src/index.css` cover every surface —
  `.glass` (cards), `.glass-chrome` (the floating bars), `.glass-sheet` (modals
  and bottom sheets), `.glass-row` (a lens inside a lens) and `.glass-field`
  (inputs) — composed with the usual utilities for radius, padding and layout.
- **`.grad-primary`, not `bg-primary`,** for large filled actions. `--primary`
  names the *accent* in both schemes, and in dark it is a light violet that
  cannot carry white type; the CTAs run on a gradient that can. Compact filled
  controls (a selected pill, a toggle) still use `bg-primary text-on-primary`,
  which is why `--on-primary` is white in light and near-black in dark.

⚠️ **`backdrop-filter` makes an element a containing block for `position: fixed`
descendants**, not just a stacking context. A meal card holds food rows, and a
food row holds a `fixed inset-0` entry sheet — put the filter on the card and
that sheet is laid out *inside the card* and painted at the card's depth, which
made its Save button unclickable. So the fill, rim and blur all live on a
`::before` layer at `z-index: -1`, leaving the card an ordinary
`position: relative` box. Anything added to those classes must stay on the
pseudo-element.

**The default is the device scheme**, exactly like the language:
`profiles.theme` is NULL until someone picks one, and NULL resolves against
`prefers-color-scheme` on every load (and follows it live, without a reload). An
explicit choice is written to the profile and mirrored to local storage — which
[`index.html`](index.html) reads in a tiny inline script *before* the module
bundle runs, since a module only executes after the document is parsed and the
app would otherwise flash white on every dark-mode load.

## Project structure

```
src/
  components/   # layout (incl. guest banner), UI primitives, profile settings,
                #   Add Food modal, barcode scanner
  context/      # AuthContext, ProfileContext, ThemeContext, I18nContext,
                #   MealsContext, AppShellContext
  hooks/        # useFoodLogs, useTargets, useFoodSearch, useDebounce, useScrollLock
  lib/          # supabase client, macros math, foodApi (Edge Function client),
                #   foods (CRUD/copy/share), meals (rename/reorder), exportText
                #   (chat share), i18n, theme (light/dark), types
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
gated), the **E2E** suite, an **Android build** and an **iOS build**. Then, on
`main` pushes only, the
existing **Netlify deploy status** check and a **Supabase deploy** that applies
database migrations (`supabase db push`) and redeploys both Edge Functions —
`food-search` and `revenuecat-webhook` (the latter with `--no-verify-jwt`, since
RevenueCat sends no Supabase JWT). The Supabase job is skipped (with a warning,
not a failure) unless these repository secrets are set:

| Secret                  | Purpose                                                        |
| ----------------------- | ------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Personal access token (Supabase dashboard → Account → Tokens) |
| `SUPABASE_PROJECT_REF`  | Hosted project ref (the `<ref>` in `<ref>.supabase.co`)       |
| `SUPABASE_DB_PASSWORD`  | Database password, used by `supabase db push`                 |

The Edge Function deploy pushes **code only** — it doesn't touch the function
secrets from step 4 (`USDA_API_KEY`, `EDAMAM_*`, `OFF_*`). If a first `db push`
fails because the remote schema diverged from the migration history, run a
one-time [`supabase migration repair`](https://supabase.com/docs/reference/cli/supabase-migration-repair).

### Native builds

`ios/` and `android/` are gitignored, so both jobs run `npx cap add` to generate
the projects from scratch. That is deliberate: it means CI validates
`capacitor.config.ts` and the installed plugin set on every run, not just the
platform build.

Because the projects are regenerated each run, a few post-`cap sync` scripts
re-apply what the Capacitor template doesn't carry: `generate-native-icons.mjs`
renders the app icons from [`assets/`](assets/) with `@capacitor/assets` — the
same rings/brand as the web [`public/icon.svg`](public/icon.svg), as a full-bleed
`icon-only.svg` for iOS and `icon-foreground`/`icon-background.svg` for the
Android adaptive icon, plus `splash[-dark].svg` (the icon on the app's aurora
ground) for the launch screen; `patch-android-webview.mjs` pins the Android
WebView text zoom; and `verify-ipad.mjs` asserts the iPad invariants.

The **web** icon set is generated instead of committed by hand: everything in
`public/` except the SVGs is rendered from
[`public/icon.svg`](public/icon.svg) by `npx pwa-assets-generator` (see
[`pwa-assets.config.ts`](pwa-assets.config.ts)), so re-run that after editing
the artwork or the PNGs silently keep the old brand. Three SVGs are hand-authored
and each has a different job:

| File | Used by | Note |
| --- | --- | --- |
| `public/icon.svg` | PWA + apple-touch PNGs, and the `assets/` native variants | The full 512 artwork |
| `public/favicon.svg` | the `<link rel="icon">` the generator emits | Three concentric rings turn to mush in a 16px tab, so this drops to one ring and a solid centre |
| `public/icon-dark.svg` | `assets/splash-dark.svg` | Neither vite-pwa nor `@capacitor/assets` has a dark-icon slot, so nothing generates from it yet — keep it in step with `icon.svg` anyway |

### The icon font

`Icon.tsx` renders Material Symbols as a **ligature** — the text `dashboard` is
substituted for the glyph — and
[`public/fonts/material-symbols-outlined.woff2`](public/fonts/) is a subset
carrying only the icons this app uses (64KB against ~3.6MB for the full set). So
adding an `<Icon name="…">` whose glyph was never subsetted ships the literal
word to users: `MAIL`, `GAVEL`, `OPEN_IN_NEW`. Regenerate with
`python3 scripts/subset-icon-font.py` (needs `pip install fonttools brotli`),
then `npm run sync:native` to copy it into `ios/`.

"Remember to re-run it" is not a guarantee and has already been missed once, so
each build records what it produced in `scripts/icon-font-manifest.json` and
CI runs `python3 scripts/subset-icon-font.py --check` on every push, which fails
on any icon name in src that the shipped font can't render. That mode is
stdlib-only and offline — it diffs against the manifest rather than reading the
woff2 or downloading the full font.

Neither job needs a secret. Android assembles a **debug APK** (uploaded as an
artifact) and iOS does an **unsigned simulator build** plus the
[iPad configuration check](#ipad) — enough to prove the projects compile and
still target iPad.

**Cost note.** macOS runners bill at 10× the minutes of Linux ones, so the iOS
job is by far the most expensive here — on the order of 80 billed minutes per
run against a 2,000-minute free monthly allowance. The workflow sets
`cancel-in-progress` for pull requests so that pushing repeatedly to a PR
supersedes the earlier run instead of paying for both; `main` pushes are never
cancelled, since those runs deploy. If the spend becomes a problem, gating the
`ios` job with `if: github.event_name != 'pull_request'` restores main-only
builds — the Android job still covers everything the two platforms share.

### Signed releases

[`.github/workflows/release-mobile.yml`](.github/workflows/release-mobile.yml)
produces store-ready builds — a signed Android **AAB** and **APK**, and a signed
iOS **IPA**. It runs on a `v*` tag or on manual dispatch, and each job skips with
a warning when its secrets are missing, so it is harmless to merge before you
have a developer account.

| Secret | Used by | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | both | Inlined into the bundle at build time — a release build must carry the real project's values |
| `VITE_SITE_URL`, `VITE_SUPPORT_EMAIL` | both | Substituted into the legal documents. Missing either fails the build (`build-legal --strict`) rather than shipping a placeholder privacy contact |
| `ANDROID_KEYSTORE_BASE64` | Android | `base64 -w0 release.jks` |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Android | Keystore credentials |
| `APPLE_CERTIFICATE_P12_BASE64`, `APPLE_CERTIFICATE_PASSWORD` | iOS | Distribution certificate |
| `APPLE_PROVISIONING_PROFILE_BASE64`, `APPLE_PROVISIONING_PROFILE_NAME` | iOS | App Store provisioning profile |
| `APPLE_TEAM_ID` | iOS | Team identifier |

Android signing is injected via Gradle properties rather than a checked-in
`signingConfig`, because the project is generated fresh each run. iOS signing
uses an ephemeral keychain created and deleted inside the job with the `security`
CLI, keeping this workflow's dependencies to first-party `actions/*` only.

On a **tag push**, a final `release` job attaches the **APK and IPA** to a
**GitHub Release** for that tag, with auto-generated notes. It reuses the same
secret-gating — an all-skip run (no signing secrets) publishes nothing rather
than failing, and re-running a tag refreshes the assets — and uses the
preinstalled `gh` CLI, so the workflow's only dependencies stay first-party
`actions/*`. A manual dispatch run just builds the artifacts for inspection and
leaves the Releases page untouched.

The **AAB** stays a build artifact rather than a release asset, since the Play
Console wants the bundle; uploading it there, or the IPA to App Store Connect, is
still a manual step — neither store has been exercised against a real developer
account yet.

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
