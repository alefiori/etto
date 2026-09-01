/**
 * What a barcode-scanning backend has to provide, and the vocabulary the UI speaks.
 *
 * Two backends implement this, and they share nothing but this file:
 *
 *   - `native.ts` drives Google's ML Kit through `@capacitor-mlkit/barcode-scanning`,
 *     which renders a camera surface *behind* the WebView and pushes results over
 *     the Capacitor bridge.
 *   - `web.ts` drives ZXing over `getUserMedia`, decoding frames from a `<video>`
 *     element inside the page.
 *
 * The two are irreconcilable at the API level — one has no DOM node at all, the
 * other is nothing but a DOM node — so the seam is deliberately narrow: start a
 * session, get codes back, stop. `index.ts` picks between them, exactly the way
 * `src/lib/purchases/index.ts` picks a billing backend.
 *
 * The UI on top is shared. `BarcodeScanner.tsx` renders the same header, the same
 * reticle and — the part that matters most — the same `aria-live` narration for
 * both, because a camera preview and a reticle convey nothing without sight of
 * them and that must not depend on which platform you are on.
 */

import type { TranslationKey } from '@/lib/i18n'

/**
 * Retail product barcodes, as neutral names both decoders can be pointed at.
 *
 * ZXing spells these as a numeric `BarcodeFormat` enum and ML Kit as a string
 * one, so neither library's vocabulary can be the shared one. These four are the
 * whole list on purpose: restricting formats is what makes decoding fast and
 * steady, and a food product carries one of exactly these.
 */
export const PRODUCT_FORMATS = ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'] as const

export type ProductFormat = (typeof PRODUCT_FORMATS)[number]

/**
 * The four ways starting a camera can fail, as translation keys that already
 * exist. Every backend maps its own error shape onto one of these rather than
 * leaking a `DOMException` name or an ML Kit message into the component.
 */
export type ScannerErrorKey = Extract<
  TranslationKey,
  'scanner.denied' | 'scanner.notFound' | 'scanner.inUse' | 'scanner.genericError'
>

/**
 * A failure a backend has already classified.
 *
 * Thrown rather than returned so `start()` keeps one happy path, and carrying the
 * key rather than the raw cause is what keeps the error mapping — which is
 * entirely platform-specific — inside the backend that owns it.
 */
export class ScannerError extends Error {
  readonly key: ScannerErrorKey

  constructor(key: ScannerErrorKey, options?: { cause?: unknown }) {
    super(key, options)
    this.name = 'ScannerError'
    this.key = key
  }
}

/**
 * The message for anything thrown out of a backend.
 *
 * Anything that isn't a classified {@link ScannerError} — a bug in our code, a
 * bridge that vanished mid-call — is the generic message, which tells the user
 * the one useful thing left: search or add the food by hand.
 */
export function scannerErrorKey(error: unknown): ScannerErrorKey {
  return error instanceof ScannerError ? error.key : 'scanner.genericError'
}

/**
 * The class a native backend puts on `<body>` while a scan is live.
 *
 * ML Kit draws the camera on a surface *behind* the WebView, so the page has to
 * stop painting for any of it to be visible. The rule this selects lives in
 * `src/index.css`, next to the opaque Grove tokens it has to override; only
 * `native.ts` ever sets it, because on the web hiding the page would hide the
 * `<video>` preview along with it.
 */
export const SCANNING_CLASS = 'scanning'

/**
 * The class on the scanner's own root, which is what {@link SCANNING_CLASS}
 * paints back in over the hidden page. Set unconditionally by the component —
 * it selects nothing at all unless a native scan is running.
 */
export const SCANNER_VIEW_CLASS = 'barcode-scanner-view'

/** How a backend shows the user what the camera sees. */
export type ScannerPreview =
  /** Frames land in a `<video>` element the component renders and hands over. */
  | 'video'
  /**
   * The OS draws the camera on its own surface *underneath* the WebView. The
   * page has to get out of the way for any of it to be visible — see `native.ts`.
   */
  | 'behind-webview'

export interface ScannerStartOptions {
  /**
   * The preview element, for a `'video'` backend. Null for `'behind-webview'`,
   * which has no DOM to attach to.
   */
  video: HTMLVideoElement | null
  /** A decoded product barcode. A backend may call this more than once; the
   *  component takes the first and stops. */
  onDetected: (code: string) => void
  /**
   * A session that failed *after* it started — the camera was taken away, or ML
   * Kit reported a scan error. Not called for a failure to start, which throws.
   */
  onFailed: (key: ScannerErrorKey) => void
}

/** A running scan. */
export interface ScannerSession {
  /**
   * Release the camera and undo everything the backend did to the document.
   *
   * Must be idempotent and must never throw: it is called from a React cleanup,
   * from the detection path and from the failure path, sometimes twice.
   */
  stop(): Promise<void>
}

/** The seam both backends implement. */
export interface ScannerBackend {
  readonly preview: ScannerPreview
  /**
   * Open the camera and begin decoding. Rejects with a {@link ScannerError} when
   * the camera cannot be opened at all.
   */
  start(options: ScannerStartOptions): Promise<ScannerSession>
}
