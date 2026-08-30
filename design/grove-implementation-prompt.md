# Implement the Grove redesign in the Etto app

## Goal

Bring the **Grove** visual direction into the running app: Etto's identity moves from
violet + liquid-glass to **sage green + solid tonal cards**, with a warm oat-green
ground, softer warm-tinted shadows, and a serif display face for large headings.

## References

- **Screen canvas** (all screens, light + dark): https://claude.ai/code/artifact/1244fa48-5c54-49c1-b165-6fec36de9533
  — Dashboard, Weekly Targets, My Foods, Profile, plus Add Food flow, Pro paywall,
  dark mode, and onboarding (the last four are sketches, not in scope here — see below).
- **Token spec** (paste-ready CSS + in-page WCAG-AA contrast checks):
  https://claude.ai/code/artifact/3e61687e-4195-48f5-a62d-5e4e168409e1
  — local copy at `design/grove-tokens.html`. This is the source of truth for every value.

## Already landed (uncommitted on the working tree — run `git diff` to see it)

- `src/index.css`: `:root` + `.dark` token blocks swapped to Grove; `--glass-*`
  collapsed to opaque fills with `--glass-blur: none` and `--glass-rim` emptied
  (the `@utility` classes still resolve, they just produce solid surfaces); aurora
  → a 2-stop near-flat gradient; shadows warm-tinted with the inset rim pair
  removed; radii `28/18/33` → `26/16/30`; the dead `@supports not(backdrop-filter)`
  block deleted.
- `src/lib/theme.ts` `CHROME_COLOR`, the inline theme script + `theme-color` meta in
  `index.html`, `vite.config.ts` PWA `theme_color` / `background_color`, and the two
  icon-glow shadows in `src/components/layout/BootScreen.tsx` → Grove values.
- e2e assertions updated: chrome colours in `e2e/theme.spec.ts`; the
  `backdrop-filter: blur` guards in `e2e/logging.spec.ts` and `e2e/tablet.spec.ts`
  swapped for opaque-surface checks (Grove has no blur).
- Green: `pnpm build`, 772 unit tests, 131 e2e, `pnpm lint`.

**Do not redo the above.** Start from the working tree as-is.

## Remaining work — do in order, one commit per step, tests green after each

### 1. Fonts

The app is still rendering in Manrope. Grove uses **Figtree** for UI text and
**Instrument Serif** for the two `headline-lg` roles (the "Today" greeting and page
titles).

- **No CDN fonts** — hard project rule (Capacitor WebViews register no service
  worker, and a failed font load turns every Material Symbols icon into its literal
  ligature word). See the comment in `index.html`. Self-host exactly like Manrope:
  subset `.woff2` in `public/fonts/`, `@font-face` in the `@layer utilities` block
  of `src/index.css`, `<link rel="preload">` in `index.html`.
- Figtree: variable, weight 300–900, latin + latin-ext (covers all 7 locales).
  Instrument Serif: single weight, latin.
- In `@theme` (`src/index.css`):
  - `--font-sans: "Figtree", "Manrope", system-ui, sans-serif` (Manrope stays as
    first fallback so a failed load still looks deliberate).
  - Add `--font-display: "Instrument Serif", "Newsreader", Georgia, serif`.
  - Point `--font-headline-lg` and `--font-headline-lg-mobile` at `var(--font-display)`.
  - `--text-headline-lg`: `2.25rem` / line-height `2.5rem` / letter-spacing `0` /
    weight `400`. `--text-headline-lg-mobile`: `1.75rem` / `2rem` / `0` / `400`.
    (Instrument Serif has one weight and wants no negative tracking.)
  - `--text-headline-md--font-weight: 700` (Figtree 700 for section titles).
  - **Leave every other `--text-*` size alone.** The rem type scale is load-bearing
    for the OS text-scaling the app honours — see `src/lib/textScale.ts` and
    `e2e/a11y.spec.ts`.

**Acceptance:** "Today" / page titles render serif, body in Figtree; with fonts
blocked it degrades to Manrope → system with no icon-ligature breakage; the 200%
text-scaling specs in `e2e/a11y.spec.ts` still pass.

### 2. Flatten `@utility glass`

The `::before` + `backdrop-filter` plumbing on `glass` is now inert. Replace the
`@utility glass` body with a plain solid card:

```
@utility glass {
  position: relative;               /* cards anchor absolutely-positioned decoration */
  background: var(--color-surface-bright);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-card);
}
```

- Drop the hardcoded `backdrop-filter: blur(36px) saturate(190%)` from
  `@utility glass-sheet`, and the `var(--glass-*-blur)` filters from `glass-chrome`
  and `glass-menu`.
- Delete the long `.glass::before` explanatory comment (the fixed-descendant
  containing-block hazard it documents is moot with no filter). **Keep** the
  parallel note about `transform` in the motion section — that one still applies.
- Re-check that meal cards, food rows, and the long-press menu still position their
  sheets / dialogs correctly (this is what the old comment was guarding).

**Acceptance:** cards, chrome, sheets and menus look identical to step 1's output;
`e2e/logging.spec.ts` (menu) and `e2e/tablet.spec.ts` (chrome) pass; `grep` the
built `dist/` CSS — no `backdrop-filter` left on these classes.

### 3. Icon & brand art

`public/icon.svg`, `public/icon-dark.svg`, `public/favicon.svg`,
`public/apple-touch-icon-*.png`, and the maskable / pwa PNGs are still violet.

- Redraw in sage (`#5c8466` accent on the Grove grounds `#f2f4ec` / `#14180f`).
- Regenerate: `pnpm exec pwa-assets-generator`, then `pnpm run sync:native` for the
  native icon set. `BootScreen.tsx` references `/icon.svg` + `/icon-dark.svg` and
  will pick up the new art.

**Acceptance:** install prompt, boot screen, and favicon are sage;
`scripts/generate-native-icons.test.mjs` passes.

### 4. Screen polish to match the canvas

Only where the redesign changed **layout or hierarchy**, not just colour — compare
each screen to its artboard, in both themes, at 375px:

- **Dashboard** — calorie card leads with *calories left* as the headline number,
  with a `Goal · Eaten · Left` strip; each macro card carries a `N g left` chip;
  meal-header copy/share icons are lighter-weight.
- **Weekly Targets** — serif page title; each macro field is a labelled row
  (colour dot + name + value box), not label-stacked-over-input.
- **My Foods** — "Create a custom food" as a full-width primary button under the
  title; source filter as sage pills.
- **Profile** — settings as icon-led rows with a trailing chevron; the Pro block as
  a sage-tinted highlighted card.

Keep all existing behaviour, i18n keys, ARIA roles, and rem sizing. These are
refinements — **if a change fights the existing component structure, stop and flag
it** rather than restructuring.

**Acceptance:** each screen matches its artboard in both themes; full e2e green.

## Out of scope (sketched in the canvas, not to build here)

The Add Food search / scan / custom-food redesign, the paywall redesign, and the
onboarding target-setting screen. These are feature work, not a reskin — leave them.

## Constraints & verification (every step)

- Brand name is **Etto**, never "MacroTrack".
- `pnpm build && pnpm test && pnpm lint && pnpm e2e` all green before each commit.
  If a test asserts a value Grove deliberately changes, update the assertion and
  say so in the commit message — don't weaken the check.
- Verify visually in **light and dark**, and at **200% browser text zoom**, on a
  375px viewport.
- Branch off `main` before the first commit; one commit per numbered step; short
  conventional messages, each ending with:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- Do not deploy. Leave the Supabase deploy and native release to the maintainer.
