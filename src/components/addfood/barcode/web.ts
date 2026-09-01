/**
 * Barcode scanning in a browser, through ZXing over `getUserMedia`.
 *
 * This is the implementation the app has always had, moved behind the seam in
 * `types.ts` and otherwise unchanged: the same one-dimensional reader, the same
 * four formats, the same `facingMode: environment` constraint and the same
 * mapping from a `getUserMedia` `DOMException` onto a message.
 *
 * The imports below are static, deliberately — see `barcode/index.ts` for why.
 * Keeping ZXing out of the eagerly-loaded bundle is still the goal; it is just
 * achieved one level up, by dynamically importing *this whole file* rather
 * than dynamically importing ZXing from inside it. A dynamic `import('@zxing/
 * ...')` here looked like the more local, more obviously-lazy way to do it,
 * and cost 83 KB gzipped in this exact chunk before the difference was
 * caught: `@zxing/library`'s entry does `export * from './browser'`, and
 * `vite.config.ts`'s `moduleSideEffects` hint on `@zxing` only lets Rolldown
 * drop a module *entirely* when nothing is imported from it — proving that
 * needs the import to be static. A dynamic `import()` of the package,
 * regardless of how its result is destructured afterwards, was
 * indistinguishable from "any export might be read" and kept the whole
 * re-export chain — every 2D decoder included. Static imports at module scope
 * are what let per-export elision run at all; moving the *lazy* boundary to
 * the file this is (see index.ts's `scannerBackend()`) is what keeps that
 * compatible with not shipping ZXing to a native build or to the web app's
 * initial load.
 *
 * The *one-dimensional* reader is still deliberate and load-bearing on top of
 * that. The general `BrowserMultiFormatReader` wraps ZXing's
 * `MultiFormatReader`, which statically imports the Aztec, DataMatrix,
 * MaxiCode, MicroQR, PDF417 and QR readers regardless of which formats are
 * hinted — hints filter at *runtime*, so only the narrower reader keeps that
 * code out of the bundle at all. This chunk is one the service worker
 * precaches (see globIgnores in vite.config.ts), so its size is paid on every
 * first visit rather than only by someone who opens the camera.
 * `BarcodeScanner.decoding.test.ts` guards the formats that swap could
 * silently cost.
 */

import { BrowserMultiFormatOneDReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import {
  PRODUCT_FORMATS,
  ScannerError,
  type ProductFormat,
  type ScannerBackend,
  type ScannerErrorKey,
  type ScannerSession,
  type ScannerStartOptions,
} from './types'

/**
 * Map a `getUserMedia` error onto one of the four messages.
 *
 * The names are the ones the Media Capture spec defines, so this is the whole
 * surface rather than a guess: anything else is a bug or a browser being
 * creative, and gets the generic message.
 */
function cameraErrorKey(error: unknown): ScannerErrorKey {
  const name = error instanceof Error ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'scanner.denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'scanner.notFound'
    case 'NotReadableError':
      return 'scanner.inUse'
    default:
      return 'scanner.genericError'
  }
}

/**
 * Our four format names, resolved against ZXing's enum through *static*
 * member access — a `switch` with one literal `BarcodeFormat.XXX` per case,
 * not a computed `BarcodeFormat[format]` lookup.
 *
 * Belt and suspenders on top of the static imports above, for the same
 * reason: `BarcodeFormat` is an enum object with a member for every format
 * ZXing knows, including the fourteen this app never reads, and a *computed*
 * access — `BarcodeFormat[format]` inside a `.map()` over a runtime array —
 * looks to the bundler exactly like indexing the object with an arbitrary
 * string, so none of its members can be proven dead. A static per-member
 * access is what lets the unused ones actually go. No `default` case, on
 * purpose: TypeScript's control-flow analysis then requires every
 * {@link ProductFormat} member to return a value for this to typecheck as
 * `number` rather than `number | undefined`, so a fifth format added to that
 * union either gets a case here or fails the build.
 */
function zxingFormat(format: ProductFormat): number {
  switch (format) {
    case 'EAN_13':
      return BarcodeFormat.EAN_13
    case 'EAN_8':
      return BarcodeFormat.EAN_8
    case 'UPC_A':
      return BarcodeFormat.UPC_A
    case 'UPC_E':
      return BarcodeFormat.UPC_E
  }
}

export const webScanner: ScannerBackend = {
  preview: 'video',

  async start({ video, onDetected }: ScannerStartOptions): Promise<ScannerSession> {
    if (!video) {
      throw new ScannerError('scanner.genericError', {
        cause: new Error('the web scanner needs a <video> element to decode from'),
      })
    }

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, PRODUCT_FORMATS.map(zxingFormat))
    const reader = new BrowserMultiFormatOneDReader(hints)

    let controls: IScannerControls
    try {
      controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        video,
        (result) => {
          // The error argument is mostly a per-frame NotFoundException — no
          // barcode in this frame — which is the common case, not a failure.
          if (!result) return
          onDetected(result.getText())
        },
      )
    } catch (error) {
      throw new ScannerError(cameraErrorKey(error), { cause: error })
    }

    let stopped = false
    return {
      async stop(): Promise<void> {
        if (stopped) return
        stopped = true
        try {
          controls.stop()
        } catch {
          // Already torn down, or the track went away with the page. Either way
          // there is nothing left to release.
        }
      },
    }
  },
}
