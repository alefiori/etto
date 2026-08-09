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
> targets card.
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
      **the paywall must not advertise features the binary does not have.** As
      of this writing the in-app paywall lists four Pro features and only
      adaptive targets exists; that is an App Store 2.3.1 rejection waiting to
      happen and it is not fixed by anything in this folder.
- [ ] Purchases actually work. `src/lib/purchases.ts` is still a stub that
      reports every purchase as unavailable, so there is nothing to buy yet.
