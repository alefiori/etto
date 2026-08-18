/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Public origin the legal documents are served from. See src/lib/legal.ts. */
  readonly VITE_SITE_URL?: string
  /** Privacy/support contact published in the legal documents and the stores. */
  readonly VITE_SUPPORT_EMAIL?: string
  /**
   * RevenueCat *publishable* SDK keys, one per store. Safe in the bundle — they
   * can only read offerings and start a purchase the store then verifies. The
   * secret key belongs nowhere near the client. Unset means the native build
   * reports purchases as unavailable rather than crashing on the first tap.
   */
  readonly VITE_REVENUECAT_IOS_KEY?: string
  readonly VITE_REVENUECAT_ANDROID_KEY?: string
  /**
   * RevenueCat **Web Billing** publishable key (`rcb_…`). A third key, separate
   * from the two mobile ones. This is what lets the web build take a payment;
   * unset, the paywall says purchases aren't available in a browser.
   */
  readonly VITE_REVENUECAT_WEB_KEY?: string
  /**
   * `1` to show the "subscribe on the web" link inside the native apps, where
   * the stores permit it. **Requires Apple to have granted
   * `com.apple.developer.external-purchase-link` first** — see
   * src/lib/purchases/externalPurchase.ts. Default off, so no build can ship the
   * link before the paperwork exists.
   */
  readonly VITE_EXTERNAL_PURCHASE_LINK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** package.json's version, inlined at build time by vite.config.ts. */
declare const __APP_VERSION__: string
