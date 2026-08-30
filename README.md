# Etto

[![CI](https://github.com/alefiori/etto/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/alefiori/etto/actions/workflows/ci.yml)
[![Netlify Status](https://api.netlify.com/api/v1/badges/711ad0e3-f068-4066-8538-38bab13b2bab/deploy-status)](https://app.netlify.com/sites/etto/deploys)

A responsive, installable daily macros tracker built with **React + Vite +
TypeScript**, **Tailwind CSS**, and **Supabase** (Postgres + Auth). Set
per-weekday macro targets, log foods against them, and watch your daily carbs /
protein / fats fill up. Food data comes from your own custom foods, foods shared
by the community, two free databases —
[Open Food Facts](https://world.openfoodfacts.org) and
[USDA FoodData Central](https://fdc.nal.usda.gov) — and three national
food-composition tables imported into our own database: **ANSES-Ciqual**
(France), **CoFID** (UK) and **CREA** (Italy).

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
  the national composition tables, and live Open Food Facts / USDA results
  (each tagged with its source);
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
- **Weight tracking** — one weigh-in a day, free. The **trends** *(Pro)*
  separate the signal from the noise: raw readings are dots, the smoothed EWMA is
  the line, and the reported weekly rate uses a Theil–Sen fit so an overnight
  water swing doesn't read as a gain, over 30, 90 or 365 days.
- **Water tracking** — quick-add glasses and bottles against a daily goal that
  derives itself from your bodyweight until you set one.
- **Hydration reminders** *(Pro)* — local notifications through the waking hours
  you pick, at the interval you pick, that **stop for the day once the goal is
  met**. Scheduled on the device, in its own local time, so nothing about your
  drinking is pushed from a server.
- **Adaptive targets** *(Pro)* — estimates what you actually burn from logged
  intake versus measured weight change, rather than multiplying a BMR formula by
  an activity guess, and explains every adjustment. Refuses to answer, by name,
  when the data can't support one.
- **Data export** *(Pro)* — the food log as a CSV with the macros already scaled
  to what you logged, or the whole account as JSON with its units named in the
  file. Downloads in a browser; goes to the share sheet as a real file natively.
- **Installable PWA** — add to home screen / install as an app; the app shell is
  precached so it launches offline.
- **Native iOS, iPadOS and Android** via Capacitor, from the same bundle. The
  layout has three window classes rather than two: a floating tab bar on a
  phone — four destinations and the add button in one pill — a Material 3
  **navigation rail** at tablet widths, and the full drawer on a desktop, so an
  iPad in portrait, in Split View or in Stage Manager gets a layout built for
  its size instead of stretched phone chrome.

## Tech stack

| Concern    | Choice                                                            |
| ---------- | ---------------------------------------------------------------- |
| Build      | Vite + React 19 + TypeScript                                     |
| Styling    | Tailwind CSS v4 (via PostCSS, not the CDN)                       |
| Routing    | React Router v7                                                  |
| Backend    | Supabase (Postgres + Auth + RLS + Edge Functions)               |
| Food data  | ANSES-Ciqual + CoFID + CREA (local tables) · Open Food Facts + USDA FoodData Central (server-side proxy) |
| Barcode    | `@zxing/browser` + `@zxing/library` (camera scanning)           |
| i18n       | Zero-dependency in-house catalog (7 locales)                    |
| PWA        | `vite-plugin-pwa` (Workbox) + `@vite-pwa/assets-generator`      |
| Native     | Capacitor 8 (iOS + Android) from the same Vite bundle           |
| Payments   | RevenueCat → webhook → Supabase (entitlement decided server-side). Store billing natively, Web Billing (Stripe rails) in the browser |
| Reminders  | `@capacitor/local-notifications`, scheduled on-device (no push) |

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
pnpm add -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B — Supabase SQL Editor:** open the SQL Editor in the dashboard and run
each migration file **in order** (`0001_init.sql` → `0017_data_api_grants.sql`).

Together the migrations create `macro_targets`, `foods`, `food_logs`,
`profiles`, and `meals`; enable RLS with owner-only policies (global foods with a
null `user_id` are readable by everyone); add the `usda`, `edamam`, `ciqual`,
`cofid` and `crea` food sources, plus the world-readable `reference_foods` table
and its ranked `search_reference_foods()` lookup; grant the API roles access to
every table (see below); add per-user profile settings (preferred language); add
**community foods** (`foods.is_public`) — including the guards that keep a shared food safe
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
sends no CORS headers, so browsers can't call it directly, and the USDA API key
must not ship in the client bundle. The function fans out to every source in
parallel — including the local `reference_foods` tables, which it queries first
because they are instant, never rate-limited and cannot fail — normalizes
results to a shared shape, and de-duplicates them.
It also caches each merged result briefly (60 s per query + language) so the
burst of requests a debounced search box fires as you type collapses onto a
single upstream fan-out — keeping the app well under the sources' rate limits.

```bash
supabase functions deploy food-search --project-ref <your-project-ref>

# Optional: set the USDA key as a function secret (defaults to DEMO_KEY)
supabase secrets set USDA_API_KEY=your-fdc-api-key --project-ref <your-project-ref>

# Optional: authenticate Open Food Facts to skip its anonymous rate limit
supabase secrets set OFF_USERNAME=your-off-user OFF_PASSWORD=your-off-password --project-ref <your-project-ref>
```

A free USDA key comes from the
[FoodData Central signup](https://fdc.nal.usda.gov/api-key-signup.html); without
it the function uses the shared `DEMO_KEY`, which works but is heavily
rate-limited (and may return 429s under load). The key is also what backs the
barcode fallback: when Open Food Facts has no record of a scanned code, the
function looks it up against USDA's branded `gtinUpc` data.

The reference tables need no key at all — the function reads them from our own
database with the auto-injected anon key.

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
VITE_SITE_URL=https://etto.fitness
VITE_SUPPORT_EMAIL=support@etto.fitness
```

The last two feed the legal documents. `scripts/build-legal.mjs` renders
[`legal/`](legal) into `public/legal/` at build time with them substituted, and
[`src/lib/legal.ts`](src/lib/legal.ts) builds the app's links from the same
values, so the published documents and the in-app links can't disagree.
`VITE_SUPPORT_EMAIL` is **published** — it is the privacy contact in the policy
and the support address in both store listings — so a release build refuses to
render without it (`build-legal --strict`).

It also has to **receive** mail, which is a separate problem from sending it:
the Resend setup below is send-only, and a privacy contact that bounces is a
GDPR problem as well as a rejected submission. Point the address at a real
mailbox — Cloudflare Email Routing forwards it for free — before publishing a
build that advertises it.

No food-API keys live here — they're function secrets (see step 4), kept out of
the client bundle. `.env` is gitignored — never commit secrets. The anon key is
safe to ship in a client bundle; RLS is what protects your data.

> **Email confirmation:** by default Supabase requires email confirmation on
> sign-up. For local testing you can disable it under
> **Authentication → Providers → Email** so new accounts can sign in
> immediately.

### 6. Install and run

```bash
pnpm install
pnpm run dev
```

This repo uses **pnpm**, pinned in the `packageManager` field. If you do not have
it yet: `npm install -g pnpm` (or `corepack enable` on a Node build that still
ships Corepack).

Open the printed local URL (default <http://localhost:5173>).

Other scripts:

```bash
pnpm run build         # type-check + production build
pnpm run preview       # preview the production build
pnpm run typecheck     # type-check only (no emit)
pnpm run lint          # ESLint (warnings are informational; errors fail CI)
pnpm run lint:fix      # ESLint with --fix
pnpm run test          # unit + component tests (Vitest)
pnpm run test:watch    # Vitest in watch mode
pnpm run test:coverage # unit tests with a V8 coverage report
pnpm run e2e           # end-to-end tests (Playwright)
pnpm run build:legal   # render legal/ into public/legal/
pnpm run store:assets  # marketing icon + Play feature graphic
pnpm run store:screenshots  # store screenshots at each required device size
pnpm run build:test    # production build against .env.test (used by the E2E run)
```

## Mobile app (iOS + Android)

The same bundle runs on the web and inside a [Capacitor](https://capacitorjs.com)
shell — there is no separate native codebase. `capacitor.config.ts` points at
Vite's `dist/`, and the app adapts at runtime via
[`src/lib/platform.ts`](src/lib/platform.ts).

```bash
pnpm run build:native      # bundle without the service worker
pnpm exec cap add ios           # once, on macOS with Xcode
pnpm exec cap add android       # once, with Android Studio / SDK installed
pnpm run sync:native       # rebuild + copy into the native projects
pnpm exec cap open ios          # or: pnpm exec cap open android
```

**Running on a physical iPhone or iPad** needs one more thing. Capacitor's
template ships `DEVELOPMENT_TEAM = ""` with automatic signing, so Xcode stops
with *"Signing for 'App' requires a development team"* — the simulator is
unaffected, and so is CI, which builds unsigned. Setting the team in Xcode's
Signing & Capabilities editor does not stick: `ios/` is gitignored and
regenerated, so the next `pnpm run sync:native` hands the empty string back and
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
| Purchases | RevenueCat Web Billing (Stripe rails), in-browser checkout | RevenueCat over App Store / Play billing, as 3.1.1 requires. May additionally *link* to web checkout where the stores permit it |
| Hydration reminders | Settings save, nothing fires — a closed tab wakes for nobody, and the card says so | `@capacitor/local-notifications`, scheduled on the device in its local time |
| Data export | `Blob` download | Written to the cache directory with `@capacitor/filesystem`, then handed to the share sheet as a file — a year of logs is not a chat message |

### iPad

The iPad build is the same target as iPhone — Capacitor's template already sets
`TARGETED_DEVICE_FAMILY = "1,2"` and ships all four `~ipad` orientations, so
nothing native needed patching. What did need doing was the layout: between
768px and the drawer's 1024px breakpoint the app used to render phone chrome,
which on an iPad in portrait meant the tab bar stretched across 820pt with its
four destinations swimming in it. That range now gets a
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
and from `pnpm run sync:native`, so a Capacitor upgrade that changes the template
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
exactly that failure. Every file is a subset (the icon font carries only the
glyphs this app uses — ~61 KB against ~3.6 MB for the full set; Figtree, the UI
text face, and Instrument Serif, the `headline-lg` display face, carry latin +
latin-ext — Instrument Serif latin only — covering all 7 languages; Manrope is
kept as the first fallback face). The icon subset is regenerated by
[`scripts/subset-icon-font.py`](scripts/subset-icon-font.py); adding a new
`<Icon name="…">` means re-running it, or that glyph ships missing and renders
as its literal word — the very failure the ligature note above describes.

**Safe-area insets** come from spacing tokens in the `@theme` block of
[`src/index.css`](src/index.css) (`safe-top`, `safe-bottom`,
`safe-left`, `safe-right`, and the `topbar`/`bottomnav`/`chrome-inset`/`above-chrome`
composites) that
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

`ios/` and `android/` are gitignored and regenerated by `pnpm exec cap add` on every
build, so nothing about them can be a checked-in edit. Three post-sync scripts
add what Capacitor's templates don't, and each fails loudly rather than silently
if a Capacitor upgrade reshapes what it patches:

| Script | What and why |
| --- | --- |
| [`patch-android-webview.mjs`](scripts/patch-android-webview.mjs) | Clamps the WebView text zoom to 200% — the system font-size setting is honoured, up to the scale the layout is built and tested to absorb. It used to *pin* it at 100%, which ignored the setting outright; see [Accessibility](#accessibility) |
| [`patch-android-manifest.mjs`](scripts/patch-android-manifest.mjs) | Declares `android.permission.CAMERA`. The scanner opens the camera with `getUserMedia`, not a Capacitor plugin, so nothing contributes it and the template ships INTERNET only — Android then denies the WebView's request **without prompting**, and the scanner reports a denial the user was never asked to make. Also marks `android.hardware.camera{,.autofocus}` optional, which declaring the permission would otherwise imply as required and delist the app for devices without an autofocus rear camera |
| [`patch-android-notification-icon.mjs`](scripts/patch-android-notification-icon.mjs) | Writes `ic_stat_water_drop`, the hydration reminders' small icon. Android draws a small icon as a silhouette — alpha only — so the full-colour launcher icon Capacitor falls back to arrives in the status bar as a solid grey blob |
| [`patch-ios-project.mjs`](scripts/patch-ios-project.mjs) | `NSCameraUsageDescription` (without it iOS **terminates** the app on the first barcode scan), `CFBundleLocalizations` (the app localizes itself in JS, so iOS would otherwise advertise it as English-only), and the app's `PrivacyInfo.xcprivacy` — written *and* registered in the pbxproj Resources phase, since an unregistered file is never copied into the bundle. Also sets `DEVELOPMENT_TEAM` from `$APPLE_TEAM_ID` when one is set, since the template's empty team blocks every device build and Xcode's own fix is undone by the next sync |
| [`verify-ipad.mjs`](scripts/verify-ipad.mjs) | Asserts the iPad invariants Capacitor currently supplies for free |

### Still to do before shipping to the stores

- `pnpm exec cap add ios` / `android` need macOS + Xcode and the Android SDK
  respectively; the generated projects are gitignored.
- **Pro needs its store-side accounts filled in.** The code is done — see
  [Pro subscription](#pro-subscription) — but three products
  (`etto_pro_monthly` / `_yearly` / `_lifetime`) have to exist in App Store
  Connect, the Play Console and RevenueCat Web Billing, be attached to a `pro`
  entitlement in RevenueCat and offered through its **current** offering, and the
  three publishable SDK keys have to be set. Unset, the paywall reports purchases
  as unavailable rather than failing on the first tap, which is what CI does.
  Sandbox-test a purchase, a restore and an expiry on a real device, and a live
  purchase on the deployed web app: nothing below the `purchasesAvailable()` line
  can be exercised by the test suites.
- **Web sales make you the merchant of record.** Apple and Google handle consumer
  VAT on their own sales; on Web Billing you (through Stripe) do not get that for
  free. Enable Stripe Tax, or move web sales to a merchant-of-record vendor,
  before taking money in the EU.
- **The external-purchase link stays off until Apple grants the entitlement.**
  `VITE_EXTERNAL_PURCHASE_LINK` is unset by default and every gate around it
  fails closed; see [Linking out of the native apps](#linking-out-of-the-native-apps).
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
- **Auth email needs a real SMTP sender.** Supabase's built-in one is rate
  limited to a couple of messages an hour and sends from a `supabase.io`
  address, so in production a confirmation or password reset either never
  arrives or lands in spam — and a store reviewer who cannot confirm an account
  never reaches the app. Etto sends through Resend. Verify `etto.fitness` at
  [resend.com/domains](https://resend.com/domains), add the DKIM and SPF records
  it returns to the domain's DNS (Netlify DNS holds the zone), then fill in
  **Authentication → SMTP Settings** on the production project:

  ```
  Host: smtp.resend.com   Port: 465   User: resend
  Pass: <Resend API key>  Sender: noreply@etto.fitness   Sender name: Etto
  ```

  Use a **sending-scope** key, not a full-access one: it cannot manage domains
  or read your account, which is what you want sitting in a dashboard field.
  This is the one place the key belongs — the app itself sends no mail, so it
  does not go in `.env`, Netlify, or GitHub secrets.

  Then raise the limit under **Authentication → Rate Limits**. Supabase keeps
  its *own* auth email cap — 30 an hour — after custom SMTP is configured, and
  it is not obvious that a stalled signup burst is that and not Resend. Add a
  `_dmarc` TXT record at `p=none` once DKIM and SPF verify.

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

Pro unlocks adaptive targets, weight tracking, water tracking, hydration
reminders and data export. Logging, barcode scanning, custom and community
foods, meals, weekly targets and all 7 languages stay free.

**Where the line falls, and why it is drawn card-by-card.** Water and weight are
gated *whole* rather than split into a free input and a paid readout. The split
the weight card used to have — log for free, pay for the trend — reads better on
paper than it works: half a card is an odd thing to own, and the free half
produced data whose only use was locked. Gating the card whole makes the offer
legible from the dashboard, and the heading stays behind so a free user can still
see that the feature exists. Both cards ask for no rows at all while locked, so a
free session pays for neither query.

Gating is client-side, through `ProGate` and `useEntitlement`, exactly as it is
for the other Pro features. The `water_logs` and `weight_logs` policies stay
owner-read-write: an entitlement check in RLS would fight the provider's
never-revoke-on-read-failure policy below, locking a paying customer out of
writing while the UI still — correctly — shows them Pro.

**Entitlements are decided server-side.** `public.subscriptions` is the one
table here that is not owner-read-write: it has a `select` policy and
deliberately **no** insert, update or delete policy, so the database denies any
client write. The only writer is the
[`revenuecat-webhook`](supabase/functions/revenuecat-webhook) Edge Function,
running with the service role. RevenueCat is the source of truth because it is
the only party that has verified the receipt with Apple, Google or Stripe; an
SDK's local cache is a UI fast path, never authority.

**Three storefronts, one table.** Pro can be bought in the iOS app, in the
Android app, or on the web, and all three arrive through that one webhook — which
is why `subscriptions.store` has allowed `'stripe'` alongside the two app stores
since 0012, and why `normalize.ts` has always mapped RevenueCat's `STRIPE`. The
consequence worth stating plainly: **a web purchase unlocks Pro in the native
apps, and vice versa, with no extra code.** `isPro` is read from the server row,
never from a store SDK, so honouring a subscription bought elsewhere — which
Apple's guideline 3.1.3(b) explicitly permits — costs nothing.

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

### The client half

[`src/lib/purchases/`](src/lib/purchases) is the only place a RevenueCat SDK is
touched. It is one interface over two backends, chosen at runtime:

| | Backend | SDK | Why it has to be this one |
| --- | --- | --- | --- |
| iOS / Android | [`native.ts`](src/lib/purchases/native.ts) | `@revenuecat/purchases-capacitor` | Apple 3.1.1 and Google Play Billing require store billing for purchases made inside an app |
| Browser | [`web.ts`](src/lib/purchases/web.ts) | `@revenuecat/purchases-js` (Web Billing, on Stripe rails) | There is no store in a browser |

[`types.ts`](src/lib/purchases/types.ts) holds the seam the two implement and the
vocabulary the UI speaks; [`index.ts`](src/lib/purchases/index.ts) picks between
them. Both SDKs load through dynamic imports, so neither reaches a bundle that
cannot use it, and a session that never opens the paywall downloads neither.

**Why Web Billing rather than talking to Stripe directly.** Purchases land
through the *existing* webhook as `store: 'STRIPE'`. That means one webhook to
secure, one place with replay guards and signature verification to get right, and
one answer to "is this person Pro?" — against a second billing integration with
its own copy of all three. The trade is a fee on top of Stripe's, and one
operational fact worth knowing before launch: on App Store and Play sales Apple
and Google are the merchant of record and handle consumer VAT; on web sales
**you** are, so enable Stripe Tax or use a merchant-of-record vendor.

Three things about the backends are load-bearing:

- **`appUserID` is the Supabase user id, always.** That is the only value
  `event.app_user_id` can be resolved back to a row, and the webhook rejects
  anything else — RevenueCat's own `$RCAnonymousID:` included, which both SDKs
  will happily mint if left to themselves. Either SDK is therefore *only* ever
  configured through `identifyPurchaser(userId)`, called
  from `EntitlementProvider` whenever the signed-in user changes, and
  `forgetPurchaser()` on sign-out so the next person to sign in on a shared
  device cannot buy Pro for the last one. Guests are identified too: an anonymous
  Supabase account's id survives being upgraded, so a purchase stays attached
  across it.
- **Prices come from the store's offering**, matched onto the three plans by
  RevenueCat's package types first and by product identifier second, so a
  dashboard assembled from custom packages still resolves. Any plan the store
  doesn't answer for falls back to the `PLANS` strings and reports itself as
  unbuyable on tap, rather than leaving a hole in the paywall. Introductory
  offers and free trials are disclosed on the plan they belong to, which is where
  both stores require them.
- **A purchase does not unlock anything by itself.** `purchasePackage` returns
  the moment payment clears, seconds before the webhook writes the row the app
  actually gates on, so the paywall calls `syncAfterPurchase()` →
  `waitForProEntitlement()`, which re-reads `public.subscriptions` with backoff
  for about ten seconds. If it hasn't landed by then the paywall stays open and
  says the purchase is still syncing — never "something went wrong", which is
  what a paying customer would otherwise be told.

Set the three publishable keys — `VITE_REVENUECAT_IOS_KEY`,
`VITE_REVENUECAT_ANDROID_KEY` and `VITE_REVENUECAT_WEB_KEY` (see
[`.env.example`](.env.example)). Unset, `purchasesAvailable()` is false for that
platform and the paywall says so in the platform's own words — deliberately not a
crash on the first tap. That is the state CI and the e2e suite build in.

### Linking out of the native apps

Store billing is the only purchase path *inside* the native shell, but both
stores have been compelled to permit an external *link* in some regions — the US
after the *Epic* injunctions, the EU under the DMA. That link is built
([`externalPurchase.ts`](src/lib/purchases/externalPurchase.ts)) and lands on
`?checkout=pro`, which AppShellProvider reads to open the paywall on arrival
rather than dropping the user on a dashboard to go hunting.

It is shown only when **all** of these hold, and the default is off:

1. `VITE_EXTERNAL_PURCHASE_LINK=1`. This stands in for a fact the app cannot
   detect: that Apple has granted
   `com.apple.developer.storekit.external-purchase-link` for the same regions. A
   link without the entitlement is a rejection, so no build made before that
   paperwork exists can carry one.
2. The **storefront** country is in `EXTERNAL_PURCHASE_COUNTRIES` — read from the
   store, not from the device language, because the storefront is what decides
   which regional rules apply to an install.
3. The user has a real account. A guest's anonymous session cannot be signed into
   on the web, so linking one out would strand them at a checkout they cannot
   authenticate against.

That country list is **legal policy, not a constant.** It has changed repeatedly
and will again; re-check it before every submission. Turning the flag on also
makes [`patch-ios-project.mjs`](scripts/patch-ios-project.mjs) write the matching
`SKExternalPurchaseLink` into Info.plist, from its own copy of the region list —
a test compares the two, since a link with no matching declaration is refused.

### The four features, and where each one's gate is

| Feature | Free | Pro | Gate |
| --- | --- | --- | --- |
| Adaptive targets | Upgrade prompt in place of the panel | The panel, and the queries behind it | [`AdaptiveTargets`](src/components/targets/AdaptiveTargets.tsx) — `enabled` folds `isPro` in, so a non-subscriber issues no adaptive queries at all |
| Weight trends | Logging a weigh-in, and the latest reading | The EWMA line, the weekly rate, and the 30/90/365 windows | [`WeightCard`](src/components/dashboard/WeightCard.tsx) — the card is split rather than gated whole: without free logging there is no data for a trend to be made of, and no reason to subscribe |
| Hydration reminders | Upgrade prompt | The toggle, window and interval — and a device that actually fires them | [`HydrationReminders`](src/components/profile/HydrationReminders.tsx) for the UI, and `syncReminders({ isPro })` again at the scheduler, so a lapsed subscription silences the phone rather than leaving a week of queued notifications behind |
| Data export | Upgrade prompt | CSV and JSON | [`DataExport`](src/components/profile/DataExport.tsx) |

`ProGate` renders the locked state rather than hiding the feature, and resolves
to locked while the entitlement is still loading, so a slow network cannot
briefly hand out a paid feature.

### Hydration reminders

Local notifications, not push: [`0015_hydration_reminders.sql`](supabase/migrations/0015_hydration_reminders.sql)
stores only the *intent* (on/off, window, interval) and every device the account
is signed into arms itself from that, in its own local time. There is no device
token, no per-device registry, and a user who flies to Tokyo gets their 9-to-21
window *there* — which a server-side scheduler would get wrong.

The plugin has no "every two hours between 9 and 21" primitive, so
[`plannedReminders`](src/lib/reminders.ts) materializes the schedule as
individual notifications a week ahead, and the whole queue is rebuilt — never
diffed — whenever anything it depends on changes: the settings, the entitlement,
a drink being logged, or the app returning to the foreground
([`useReminderSync`](src/hooks/useReminderSync.ts)). That last one is what fixes
"the queue was built yesterday and it is now tomorrow". The policy lives in one
pure function and is tested as such: today's passed slots are dropped, the rest
of today is dropped once the goal is met, and the total is capped at 60 because
iOS keeps only the 64 soonest and would otherwise silently drop the *later* days.

Permission is requested when the toggle is turned on, never at start-up, and a
refusal leaves the stored setting `false` — a `true` the OS will not honour is a
claim the settings card would then keep making.

### Data export

Two formats, because they answer different questions.
[`exportData.ts`](src/lib/exportData.ts) reads the whole account (no date range —
an export that quietly stopped at 90 days is the kind of half-answer that makes
people distrust the feature) and then formats it purely: **CSV** is the food log,
one row per logged food with the macros already scaled to the amount logged,
because a spreadsheet is what people actually do this with and stored `servings`
against per-serving macros is not one; **JSON** is the complete record with a
header naming the app, the schema version and every unit, so the file is still
readable by someone who no longer has the app.

The billing row is deliberately excluded. It is store-side state the client can
only read, it says nothing about the user's own logging, and an export is not the
place to hand someone back their transaction identifiers.

## How external food data is modeled

Every source reports nutrients **per 100 g**, so every imported food is stored
on a fixed **100 g basis** (`serving_amount=100`, `serving_unit='g'`) using the
per-100g values directly — logging then works in multiples of 100 g (1.5 servings
= 150 g). The one exception is CoFID's alcoholic beverages, which are tabulated
per 100 ml; those carry `serving_unit='ml'` rather than being restated as a mass.

When a search result is logged, the app **upserts** it into `foods` with the
appropriate `source`, `off_id=<the source's id>` (barcode/code for OFF, `fdcId`
for USDA, the dataset's own food code for the composition tables), and
`is_custom=false` — de-duplicating on `(source, off_id)` — before inserting the
`food_logs` row. Logs always reference a stable local food, and the macros are
**snapshotted at log time**. That is what makes refreshing a reference dataset
safe: replacing `reference_foods` wholesale cannot rewrite what someone already
ate.

Missing macros are handled differently per source, deliberately:

- **Open Food Facts** — a result with no macro data at all is skipped, but one
  carrying only *some* macros is kept with the blanks treated as `0`. This keeps
  the many newly-added / community-entered products, which often have partial
  nutrition, visible in search rather than silently dropped; the imported food
  can be edited as a custom food to correct any blank.
- **USDA and the composition tables** — all three macros are required. Their
  entries are curated, so a blank means "not determined" rather than "zero", and
  publishing it as `0` would invent a nutrition value. The import pipeline drops
  such foods before they ever reach the database and reports each one.

### The reference tables

ANSES-Ciqual, CoFID and CREA are **imported into our own database** rather than
queried over the network, in a separate `reference_foods` table (see
[`0016_reference_foods.sql`](supabase/migrations/0016_reference_foods.sql)). They
deliberately do *not* live in `foods` as `user_id IS NULL` rows: the client's
local food query is ordered newest-first and capped at 20, so ~6,200 imported
rows would crowd out both the user's own foods and community foods, and because
`food_logs.food_id` cascades, pruning a food dropped upstream would delete
people's logs with it.

Search goes through `search_reference_foods()`, a ranked Postgres lookup
combining weighted full-text matching with trigram similarity, over
accent-folded text — French and Italian food names are unusable otherwise.
Language **ranks** rather than filters, so an English speaker still finds
*camembert* and the five locales with no table of their own still get results.

Two committed scripts maintain it:
[`build-reference-foods.mjs`](scripts/build-reference-foods.mjs) parses upstream
into the CSVs under `data/reference/`, and
[`import-reference-foods.mjs`](scripts/import-reference-foods.mjs) projects those
CSVs into Postgres, no-opping when the checksum already matches. The committed
CSV is the source of truth and the database is a projection of it, so a dataset
refresh arrives as a **reviewable diff of real nutrition values** and `git`
answers which edition is live. A [monthly workflow](.github/workflows/reference-foods.yml)
checks upstream metadata and opens a PR when a new edition appears.

One caveat worth knowing: CoFID's carbohydrate figure is **available
carbohydrate as monosaccharide equivalent**, not the "by difference" value on EU
labels, so it runs slightly higher — pure sucrose comes out at 105 g/100 g. That
is correct, not a mapping error.

### The search path

Search ([`useFoodSearch`](src/hooks/useFoodSearch.ts)) queries the user's own
foods (locally, via Supabase) alongside a single call to the
[`food-search` Edge Function](supabase/functions/food-search/index.ts) through a
thin client ([`src/lib/foodApi.ts`](src/lib/foodApi.ts)). The function holds a
small registry of source adapters — the reference tables first, then Open Food
Facts and USDA — runs them in parallel, normalizes each to the shared
`ExternalFood` shape, and merges + de-duplicates across sources; a failing source
degrades gracefully to no results from that source. Registry order *is* the
ranking knob, since de-duplication is first-seen-wins. The pure
raw-JSON-to-`ExternalFood` mapping lives in a Deno-free
[`normalize.ts`](supabase/functions/food-search/normalize.ts) so it can be
unit-tested from Vitest ([`normalize.test.ts`](supabase/functions/food-search/normalize.test.ts)),
while `index.ts` keeps the fetch / env / caching concerns. **Adding a new
network-backed source** is a server-side-only change: add an adapter to the
function's `SOURCES` array. A source backed by our own tables additionally needs
a migration and a data load. All math (4/4/9 kcal per gram, per-serving scaling,
per-100g conversion, remaining-vs-target, ring offsets) lives in
[`src/lib/macros.ts`](src/lib/macros.ts).

> **Adding a table? Grant on it.** Supabase no longer auto-exposes new tables in
> `public` to the `anon` / `authenticated` / `service_role` API roles (the
> `auto_expose_new_tables` note in `supabase/config.toml`). A table with RLS
> policies but no `GRANT` is invisible through PostgREST while working perfectly
> in `psql` — which is how migrations 0001-0015 ended up shipping without them,
> and why `0017_data_api_grants.sql` exists. Every new migration that creates a
> table must grant on it explicitly, as `0016` and `0017` do. Default privileges
> are deliberately *not* used, because they would make every future table
> exposed-by-default again.

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
  shadow, not a border. A handful of classes in `src/index.css` cover every
  surface — `.glass` (cards), `.glass-chrome` (the floating bars), `.glass-sheet`
  (modals and bottom sheets), `.glass-menu` (the long-press menu), `.glass-row`
  (a lens inside a lens) and `.glass-field` (inputs) — composed with the usual
  utilities for radius, padding and layout.
- **`.grad-primary`, not `bg-primary`,** for large filled actions. `--primary`
  names the *accent* in both schemes, and in dark it is a light violet that
  cannot carry white type; the CTAs run on a gradient that can. Compact filled
  controls (a selected pill, a toggle) still use `bg-primary text-on-primary`,
  which is why `--on-primary` is white in light and near-black in dark.

⚠️ **`backdrop-filter` makes an element a containing block for `position: fixed`
descendants**, not just a stacking context. A meal card holds food rows, and a
food row holds a `fixed inset-0` entry sheet — put the filter on the card and
that sheet is laid out *inside the card* and painted at the card's depth, which
made its Save button unclickable. `.glass` therefore keeps its fill, rim and blur
on a `::before` layer at `z-index: -1`, leaving the card an ordinary
`position: relative` box, and anything added to it must stay on the
pseudo-element.

That dodge has a price: **Chromium does not render `backdrop-filter` on a
`z-index: -1` pseudo-element at all** — it samples an empty backdrop and
composites as if no filter were asked for, so such a surface is glass on iOS
(WebKit) and a flat tinted panel in every Android WebView. It goes unnoticed over
the aurora, since a blurred gradient is the same gradient, and shows immediately
over the app's own content. So the surfaces that sit over content —
`.glass-chrome`, `.glass-sheet`, `.glass-menu` — carry the filter on the element
itself and blur on both platforms. That is only safe because none of them
contains a `fixed inset-0` overlay: the bars *are* the fixed elements, and every
sheet and dialog is the sole child of its own scrim. **Adding a fixed overlay
inside one of those three means portalling it out**, not nesting it.

Also, on those three the cast shadow and the specular rim are one `box-shadow` in
the class, so don't add a `shadow-*` utility alongside them — it replaces the rim
rather than joining it.

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
                #   Add Food modal, barcode scanner, paywall (modal + ProGate)
  context/      # AuthContext, ProfileContext, ThemeContext, I18nContext,
                #   MealsContext, AppShellContext, EntitlementContext
  hooks/        # useFoodLogs, useTargets, useFoodSearch, useDebounce,
                #   useScrollLock, useReminderSync, useFocusTrap,
                #   useOverlayDismiss, useRadioGroupKeys, useChromeMetrics
  lib/          # supabase client, macros math, foodApi (Edge Function client),
                #   foods (CRUD/copy/share), meals (rename/reorder), exportText
                #   (chat share), exportData (full CSV/JSON export), purchases
                #   (RevenueCat), entitlement (Pro read + purchase sync),
                #   reminders (local notification scheduling), i18n,
                #   theme (light/dark), textScale (OS text-size support), types
  pages/        # Auth, ForgotPassword, Dashboard, Targets, MyFoods, CreateCustomFood, Profile
supabase/
  functions/    # food-search + revenuecat-webhook + delete-account Edge Functions
  migrations/   # SQL schema + RLS + profiles + community foods + editable meals
                #   + subscriptions + hydration reminders + reference foods
scripts/        # build/native/verification tooling, plus the reference-food
                #   pipeline (build-* parses upstream, import-* loads Postgres)
data/
  reference/    # committed food-composition CSVs + UPSTREAM.json (the source of
                #   truth for public.reference_foods; .cache/ is gitignored)
```

## Accessibility

The app targets WCAG 2.2 AA, on the web and in both native shells. The pieces
that are easy to lose in a refactor are the ones worth naming here.

**Text size is the reader's to choose.** This used to be refused outright:
`text-size-adjust: 100%` in the stylesheet, with `setTextZoom(100)` in the
Android shell behind it, because a larger system font overflowed chrome built
out of fixed pixel heights. That is WCAG 1.4.4 failing on the one setting a
low-vision reader is most likely to have already turned on. The layout absorbs
the scale now, up to the 200% WCAG asks for:

- The type scale in [`src/index.css`](src/index.css) is in `rem`, so a browser's
  default-font setting, Android's font scale and iOS Dynamic Type all move it.
- [`src/lib/textScale.ts`](src/lib/textScale.ts) supplies the one platform that
  needs help. WKWebView ignores Dynamic Type, so the scale is measured off an
  `-apple-system-body` probe and written to the root font size. It also detects
  the *rendered* scale off a second probe, which is the only way to see
  Android's `textZoom` — that multiplies font sizes at layout without changing
  any style value.
- [`src/hooks/useChromeMetrics.ts`](src/hooks/useChromeMetrics.ts) measures the
  top bar and tab bar with a `ResizeObserver` and publishes their real heights,
  which the content lane reserves. Chrome that holds text is not a fixed height
  once the text can grow, and the old 72px/112px constants slid the first and
  last card underneath it.
- Past ~1.35× the tab bar and rail drop their 10px destination labels — clipped
  to a screen-reader-only box, never `display: none`, which would take the
  links' only accessible name with it.

`e2e/a11y.spec.ts` holds this down: every route is driven at 100%, 150% and
200% and asserted to reflow without a horizontal scrollbar and without any
element crossing the viewport edge.

**Keyboard and focus.** [`useFocusTrap`](src/hooks/useFocusTrap.ts) confines Tab
to the open overlay and returns focus to whatever opened it —
`aria-modal="true"` only constrains a screen reader, never the Tab key, so both
are needed. [`useOverlayDismiss`](src/hooks/useOverlayDismiss.ts) stacks Escape
the way `pushOverlay` already stacked Android's back button, so cancelling a
confirm dialog no longer takes the sheet underneath it down too. A skip link is
the first thing in the tab order, and `:focus-visible` is defined once for
everything (with a `forced-colors` variant) — before this there was no focus
indicator in the app at all.

**Announcements.** Errors carry `role="alert"`, confirmations `role="status"`.
Roughly two dozen messages were previously drawn and never spoken, including
every sign-in failure. The barcode scanner narrates its own state, since a
camera preview and a reticle convey nothing without sight of them.

**Names and roles.** The progress rings are single labelled images rather than
loose fragments ("84 g" then "/220g"). The long-press food menu implements the
menu pattern it advertises — arrow keys, Home/End — and the two radio groups
implement theirs, with a roving tabindex. Icon-only controls smaller than 44px
carry `.tap-target`, which grows the hit area without moving the design.

## Testing

- **Unit + component tests** run on [Vitest](https://vitest.dev) with
  [React Testing Library](https://testing-library.com/). Test files live next to
  the code they cover (`src/**/*.test.ts[x]`); shared helpers and fixture
  factories are in [`src/test/`](src/test/). Run `pnpm run test` (or
  `pnpm run test:coverage` for a report). The Supabase client is mocked, so no
  backend is needed.
- **End-to-end tests** run on [Playwright](https://playwright.dev) from the
  [`e2e/`](e2e/) directory and are **fully hermetic** — every Supabase request
  (auth, PostgREST, the Edge Function) is stubbed in
  [`e2e/fixtures/supabase.ts`](e2e/fixtures/supabase.ts), backed by an in-memory
  store, so the suite needs no secrets and never hits the network. Run
  `pnpm run e2e` (first time locally: `pnpm exec playwright install chromium`). The
  build is driven by [`.env.test`](.env.test), whose stub host the fixtures
  intercept.
- **Accessibility** has a suite of its own,
  [`e2e/a11y.spec.ts`](e2e/a11y.spec.ts), covering the contracts that are
  invisible in a screenshot and easy to break by accident: the skip link, the
  named landmarks, the focus trap and its restore, live-region announcement of a
  real failure, the labelled rings, and reflow at 100/150/200% text on every
  route. See [Accessibility](#accessibility).

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
secrets from step 4 (`USDA_API_KEY`, `OFF_*`). If a first `db push`
fails because the remote schema diverged from the migration history, run a
one-time [`supabase migration repair`](https://supabase.com/docs/reference/cli/supabase-migration-repair).

### Native builds

`ios/` and `android/` are gitignored, so both jobs run `pnpm exec cap add` to generate
the projects from scratch. That is deliberate: it means CI validates
`capacitor.config.ts` and the installed plugin set on every run, not just the
platform build.

Because the projects are regenerated each run, a few post-`cap sync` scripts
re-apply what the Capacitor template doesn't carry: `generate-native-icons.mjs`
renders the app icons from [`assets/`](assets/) with `@capacitor/assets` — the
same rings/brand as the web [`public/icon.svg`](public/icon.svg), as a full-bleed
`icon-only.svg` for iOS and `icon-foreground`/`icon-background.svg` for the
Android adaptive icon, plus `splash[-dark].svg` (the icon on the app's aurora
ground) for the launch screen; `patch-android-webview.mjs` clamps the Android
WebView text zoom to 200% (it is honoured below that — see
[Accessibility](#accessibility)); and `verify-ipad.mjs` asserts the iPad
invariants.

The **web** icon set is generated instead of committed by hand: everything in
`public/` except the SVGs is rendered from
[`public/icon.svg`](public/icon.svg) by `pnpm exec pwa-assets-generator` (see
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
then `pnpm run sync:native` to copy it into `ios/`.

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
- **[ANSES-Ciqual](https://doi.org/10.57745/RDMHWY)** — Anses. 2025. Table de
  composition nutritionnelle des aliments Ciqual. Licence Ouverte / Open Licence
  2.0 (Etalab).
- **[CoFID](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid)**
  — McCance and Widdowson's The Composition of Foods Integrated Dataset 2021,
  Office for Health Improvement and Disparities. Contains public sector
  information licensed under the Open Government Licence v3.0.
- **[CREA](https://www.crea.gov.it/alimenti-e-nutrizione)** — CREA Research
  Centre for Food and Nutrition, Tabelle di composizione degli alimenti (2019),
  used with attribution.
</content>
</invoke>
