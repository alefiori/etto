# Store submission

Everything the App Store and Play ask for that isn't the binary: the listing
copy, the graphics, the screenshots, and the answers to the forms neither store
lets you skip.

None of it is generated at build time — a store listing is not a build artifact,
it is a decision. What *is* generated (screenshots, graphics) is gitignored and
regenerated on demand, because it is derived from the current UI and stale
copies are worse than none.

## What's here

| Path | What it is |
| --- | --- |
| `listings/<locale>.md` | Listing copy for all 7 languages, with each field's character limit in its heading |
| `listings.test.mjs` | Asserts every field fits its limit — an over-length field is rejected at *upload*, after you've already built and signed |
| `screenshots.spec.ts`, `seed.ts` | Screenshot generation, driven by the same hermetic fixtures the e2e suite uses |
| `assets/` *(generated)* | Marketing icon and Play feature graphic |
| `screenshots/` *(generated)* | `<locale>/<device>/NN-screen.png` — one folder per upload |

## Regenerating

```bash
npm run store:assets        # marketing icon + feature graphic
npm run store:screenshots   # all four device sizes, English
STORE_LOCALE=it npm run store:screenshots   # …and again per language
```

Screenshots need a Playwright browser (`npx playwright install chromium`). The
device sizes and why each exists are documented in `playwright.store.config.ts`
— confirm them against what the stores currently ask for before an upload, since
both change the required sizes from time to time.

## Form answers

Neither store publishes without these, and both treat a wrong answer as a policy
violation rather than a mistake. They are recorded here so the next submission
doesn't have to re-derive them from the schema.

### Data safety (Play) / App Privacy (App Store)

Everything below is **collected**, **linked to the user's identity**, and **not
used for tracking**. Nothing is shared with third parties for advertising, and
there is no advertising, analytics, attribution or crash-reporting SDK in the
app at all — which is why the iOS privacy manifest declares an empty
`NSPrivacyTrackingDomains` (see `scripts/patch-ios-project.mjs`).

| Data type | Collected | Purpose | Optional? |
| --- | --- | --- | --- |
| Email address | Yes | Account management | Yes — guest accounts have none |
| User ID | Yes | Account management, app functionality | No |
| Health & fitness (weight, body measurements, food and water logs) | Yes | App functionality | Yes — every field is optional |
| Purchase history | Yes | App functionality (unlocking Pro) | Yes |
| Approximate/precise location, contacts, photos, messages, browsing history, device identifiers | **No** | — | — |

Also true, and asked in both forms:

- **Encrypted in transit:** yes.
- **Users can request deletion:** yes — in-app, Profile → Delete account, plus
  by email. Play asks for a deletion URL as well; use the support address in the
  privacy policy.
- **Data collection is optional:** partly. The app cannot function without an
  account identifier and the logs the user creates; everything else is optional.

### Health apps declaration (Play)

MacroTrack is a **health and fitness** app that handles user-entered dietary and
body-measurement data. It is:

- **not** a medical device, and makes no diagnostic or treatment claims;
- **not** connected to Health Connect, Apple Health, or Google Fit;
- **not** using health data for advertising or any automated decision-making.

The in-app disclaimer (Profile → About & legal, and on the Body & goal card) and
section 1 of the Terms both state that it is not medical advice. Play asks for a
declaration URL for health apps — the Terms page serves that purpose.

### Age rating

**12+ / PEGI 12** is the honest answer for a calorie tracker: no objectionable
content, but weight and dietary tracking is not appropriate for young children,
and both the Terms and the Privacy Policy set a floor of 13 (or the local age of
digital consent, where higher). Do **not** opt into Play's "Designed for
Families" programme.

### App Review notes (Apple) — paste into the submission

> MacroTrack opens as a guest: an anonymous account is created automatically on
> first launch, so no demo credentials are needed. Every feature except
> purchases is reachable immediately.
>
> To review the paywall, open Weekly Targets and tap "See Pro" on the Adaptive
> targets card, or Profile → MacroTrack Pro. Pro unlocks four things: adaptive
> targets (Weekly Targets), the weight trend chart and its 30/90/365-day history
> (Dashboard → Weight), hydration reminders (Profile → Hydration reminders,
> which asks for notification permission when switched on), and data export
> (Profile → Export your data). Everything else — logging, barcode scanning,
> custom and community foods, water and weight logging, all 7 languages — is
> free and needs no purchase.
>
> Restore purchases is available without a subscription, at Profile →
> MacroTrack Pro and on the paywall itself.
>
> The same subscription can also be bought on our website, and the app honours a
> subscription bought there (Guideline 3.1.3(b)). Purchases made *inside* the app
> go through In-App Purchase only.
>
> The barcode scanner needs camera permission; any food product barcode works.
>
> Account deletion is at Profile → Delete account.

This depends on anonymous sign-ins being **enabled on the production Supabase
project** — see `supabase/config.toml`. With them off, the app falls back to a
sign-in screen and a reviewer meets a login wall with no account, which is a
Guideline 2.1 rejection.

## Before you upload

- [ ] `VITE_SUPPORT_EMAIL` and `VITE_SITE_URL` set as repository secrets, so
      `build-legal --strict` passes and the policy names a real contact
- [ ] The legal documents resolve at `<site>/legal/privacy.html` and
      `/legal/terms.html`
- [ ] Anonymous sign-ins enabled on the production Supabase project
- [ ] `delete-account` deployed (CI does this on `main`)
- [ ] Listing copy matches what the build actually contains — in particular,
      **the paywall must not advertise features the binary does not have** (an
      App Store 2.3.1 rejection). All four of the features it lists now exist:
      adaptive targets, weight trends, hydration reminders and data export. If
      one is ever pulled, its line comes out of `FEATURE_KEYS` in
      `src/components/paywall/PaywallModal.tsx` first.
- [ ] The three products exist and are **approved** in App Store Connect and the
      Play Console: `macrotrack_pro_monthly`, `macrotrack_pro_yearly`,
      `macrotrack_pro_lifetime`. Apple will not review a build whose IAPs are
      still in "Missing Metadata".
- [ ] In RevenueCat: all three attached to an entitlement named exactly `pro`,
      offered through the **current** offering, and the webhook pointed at the
      deployed `revenuecat-webhook` with the shared secret set both sides
- [ ] `VITE_REVENUECAT_IOS_KEY`, `VITE_REVENUECAT_ANDROID_KEY` and
      `VITE_REVENUECAT_WEB_KEY` set as repository secrets. Unset, the paywall
      reports purchases as unavailable — honest, but nothing can be bought.
- [ ] Web Billing enabled in RevenueCat and connected to Stripe, with the same
      three products, and **Stripe Tax enabled** (or web sales moved to a
      merchant-of-record vendor). Apple and Google are the merchant of record on
      their own sales; on web sales you are, and EU consumer VAT comes with it.
- [ ] `VITE_EXTERNAL_PURCHASE_LINK` left **unset** unless Apple has granted
      `com.apple.developer.storekit.external-purchase-link` for the regions in
      `EXTERNAL_PURCHASE_COUNTRIES`. A link out with no entitlement is a
      rejection, and can be a removal. Re-check the permitted regions and both
      declaration key names against Apple's current documentation each time —
      this is the fastest-moving corner of the guidelines.
- [ ] A sandbox purchase, a **restore** on a second install, and an expiry
      tested on real devices. Restore is at Profile → MacroTrack Pro as well as
      on the paywall; Apple rejects builds where it is missing or buried.
- [ ] Play Console → App content → **Notifications**: the app posts local
      hydration reminders only (no push, no FCM). Android 13+ asks for
      POST_NOTIFICATIONS at the moment the toggle is turned on, never at launch.
