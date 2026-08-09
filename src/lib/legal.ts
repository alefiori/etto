/**
 * Where the legal documents live, and how to reach support.
 *
 * Both stores need these as **public URLs**, not just in-app text: App Store
 * Connect asks for a privacy policy URL and a support URL in the listing, and
 * Play rejects a data-safety declaration whose policy link doesn't resolve. So
 * the canonical copies are static files served from the deployed web app
 * (`scripts/build-legal.mjs` renders them into `public/legal/` at build time),
 * and the app links out to them rather than embedding a second copy that would
 * drift.
 *
 * Absolute URLs, deliberately. Natively the origin is `capacitor://localhost`,
 * so a relative link would resolve inside the WebView and 404. Capacitor's
 * default navigation policy opens off-origin http(s) links in the system
 * browser, which is also what Apple expects of a policy link.
 *
 * Both values are baked in at build time. {@link SUPPORT_EMAIL} has no
 * meaningful default — an app that ships a placeholder as its privacy contact
 * is worse than one that fails to build — so release builds pass
 * `--strict` to the renderer, which refuses to emit a document still carrying
 * the placeholder. See `.env.example`.
 */

/** Fallback used by dev and CI builds, where the real values aren't configured. */
const PLACEHOLDER_EMAIL = 'support@example.invalid'

export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://macros-track.netlify.app')
  .toString()
  .replace(/\/+$/, '')

export const SUPPORT_EMAIL = (
  import.meta.env.VITE_SUPPORT_EMAIL ?? PLACEHOLDER_EMAIL
).toString()

export const TERMS_URL = `${SITE_URL}/legal/terms.html`
export const PRIVACY_URL = `${SITE_URL}/legal/privacy.html`
export const SUPPORT_URL = `mailto:${SUPPORT_EMAIL}`
