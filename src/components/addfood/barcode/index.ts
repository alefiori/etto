/**
 * Reading a product barcode, on whichever platform the app is running on.
 *
 * One interface, two backends:
 *
 *   - **Native** (`native.ts`) — Google's ML Kit through
 *     `@capacitor-mlkit/barcode-scanning`. The native camera pipeline and an
 *     on-device decoder, drawn on a surface *behind* the WebView.
 *   - **Web** (`web.ts`) — ZXing over `getUserMedia`, decoding frames out of a
 *     `<video>` element. A browser has no native camera to hand over, so this is
 *     the only path there, and it is the path the PWA has always used.
 *
 * Picked at runtime from `isNativePlatform()`, the same choice
 * `src/lib/purchases/index.ts` makes between billing backends — and for the
 * same reason: one bundle has to behave correctly in both places, and neither
 * SDK can decide this for itself.
 *
 * Where this deliberately does NOT mirror purchases/index.ts: that module
 * imports both backends statically and lets each one dynamically import its
 * own SDK internally. `scannerBackend()` is async and dynamically imports the
 * *whole backend module* instead — `native.ts` or `web.ts`, never both.
 *
 * That is not a stylistic preference; the first shape was tried and measured
 * 83 KB gzipped heavier than this one, all of it 2D barcode decoders (Aztec,
 * DataMatrix, MaxiCode, PDF417, QR) that this app never reads. `@zxing/
 * library`'s entry does `export * from './browser'`, and Rolldown's
 * per-export tree-shaking of a re-export chain like that needs a *static*
 * `import { X } from '...'` to see which names are actually live — a dynamic
 * `import('@zxing/...')` inside web.ts, no matter how its result was
 * destructured afterwards, was indistinguishable from "any export might be
 * read" and kept the lot. Static imports inside web.ts fixed that; making
 * *this* the dynamic boundary instead is what keeps ZXing out of a native
 * build and out of the web app's own initial load, same as before. See
 * web.ts's own comment for the full account.
 *
 * `BarcodeScanner.tsx` is the shared UI over both, and is where the public
 * `{ onDetected, onClose }` contract that `AddFoodModal` depends on lives. It
 * awaits `scannerBackend()` once per mount rather than caching the promise
 * anywhere: the platform cannot change under a running session, so a second
 * mount importing the same already-loaded chunk again costs nothing beyond
 * the module cache lookup every dynamic import already gets for free.
 */

import { isNativePlatform } from '@/lib/platform'
import type { ScannerBackend, ScannerPreview } from './types'

export {
  PRODUCT_FORMATS,
  SCANNER_VIEW_CLASS,
  SCANNING_CLASS,
  ScannerError,
  scannerErrorKey,
  type ProductFormat,
  type ScannerBackend,
  type ScannerErrorKey,
  type ScannerPreview,
  type ScannerSession,
  type ScannerStartOptions,
} from './types'

/**
 * Which preview mode this platform's backend will use, without loading it.
 *
 * `BarcodeScanner.tsx` needs this on its very first render — before
 * {@link scannerBackend} has resolved, since that now means fetching a chunk —
 * to decide whether to mount a `<video>` element and whether to draw its own
 * black backdrop under it. Both are `isNativePlatform()` facts, not "what did
 * ML Kit or ZXing turn out to be" facts, so they never need the load to
 * finish; `nativeScanner.preview` and `webScanner.preview` are each a `const`
 * that agrees with this by construction, not by convention.
 */
export function scannerPreview(): ScannerPreview {
  return isNativePlatform() ? 'behind-webview' : 'video'
}

/** The scanning backend for this platform, loading only the one needed. */
export async function scannerBackend(): Promise<ScannerBackend> {
  if (isNativePlatform()) {
    const { nativeScanner } = await import('./native')
    return nativeScanner
  }
  const { webScanner } = await import('./web')
  return webScanner
}
