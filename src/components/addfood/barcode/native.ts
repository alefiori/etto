/**
 * Barcode scanning on iOS and Android, through Google's ML Kit.
 *
 * The import below is static. `@capacitor-mlkit/barcode-scanning` still never
 * reaches a web build — this whole file is what's behind a dynamic import,
 * one level up in `barcode/index.ts`'s `scannerBackend()`, exactly as
 * `src/lib/purchases/index.ts` picks a billing backend the same way. See that
 * file's comment for why the boundary sits there and not inside this module:
 * a dynamic import *of the SDK itself* looked like the more local way to keep
 * it lazy, and defeated per-export tree-shaking on the sibling web.ts's
 * equivalent import badly enough to be worth avoiding here too, even though
 * this plugin doesn't carry web.ts's specific `export *` liability.
 *
 * Why ML Kit rather than the ZXing path the web still uses: in a WebView,
 * `getUserMedia` is a camera the *browser engine* owns. On Android that means a
 * permission dialog routed through `BridgeWebChromeClient`, no continuous
 * autofocus control, and a decode loop running on the JS thread over frames
 * copied out of a `<video>`. ML Kit gets the native camera pipeline and a decoder
 * that ships with the app.
 *
 * ## The camera is *behind* the WebView
 *
 * This is the one genuinely awkward part. `startScan` does not create an element;
 * it inserts a camera surface underneath the web view and makes the web view
 * itself transparent (`BarcodeScanner.java` calls `setBackgroundColor(TRANSPARENT)`
 * on the bridge WebView, `BarcodeScanner.swift` sets `isOpaque = false`). What
 * neither can do is make the *page* transparent, and under Grove `body` carries an
 * opaque `bg-background` plus the aurora gradient, `#root` fills it, and the Add
 * Food modal draws an opaque sheet on top of that. All of it would sit between
 * the user and the camera.
 *
 * So the backend puts one class on `<body>` while a scan is live and takes it off
 * again afterwards — the same shape as the other native-only document side
 * effects in `src/lib/nativeBootstrap.ts`: a native concern, kept out of React,
 * behind a dynamic import. The rule that class selects lives in `src/index.css`
 * next to the tokens it has to override; `BarcodeScanner.tsx` reads
 * {@link ScannerBackend.preview} to drop its own black backdrop to match.
 *
 * **Restoring it is not optional.** A page left transparent is an app that looks
 * broken and cannot be recovered without a restart, so every path out of here —
 * a clean stop, a failure to start, a mid-scan error, an unmount — goes through
 * `reveal()`. That is why the class is added as late as possible (after
 * permission and support are settled) and removed in a `finally`.
 */

import { BarcodeScanner, BarcodeFormat, LensFacing } from '@capacitor-mlkit/barcode-scanning'
import {
  PRODUCT_FORMATS,
  SCANNING_CLASS,
  ScannerError,
  type ProductFormat,
  type ScannerBackend,
  type ScannerErrorKey,
  type ScannerSession,
  type ScannerStartOptions,
} from './types'

// Type-only reference for the one shape not imported as a value above.
type Barcode = import('@capacitor-mlkit/barcode-scanning').Barcode
type ListenerHandle = { remove: () => Promise<void> }

/**
 * Our four formats in ML Kit's spelling.
 *
 * `satisfies` against the plugin's own enum keys, so a rename in the plugin is a
 * type error here rather than a scanner that quietly stops reading EAN-13.
 */
const ML_KIT_FORMAT = {
  EAN_13: 'Ean13',
  EAN_8: 'Ean8',
  UPC_A: 'UpcA',
  UPC_E: 'UpcE',
} as const satisfies Record<ProductFormat, keyof typeof BarcodeFormat>

/**
 * Classify a rejection from the bridge.
 *
 * The plugin rejects with a bare message string rather than a code — the Android
 * side calls `call.reject(exception.getMessage())` for almost everything — so
 * this is pattern-matching by necessity, not by preference. `ERROR_PERMISSION_DENIED`
 * ("User denied access to camera.") is the one constant string it defines that we
 * can actually hit; the rest come from CameraX and AVFoundation, whose wording is
 * not contractual. Anything unrecognised falls through to the generic message,
 * which is honest rather than wrong.
 */
function nativeErrorKey(error: unknown): ScannerErrorKey {
  if (error instanceof ScannerError) return error.key
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  if (message.includes('denied') || message.includes('permission')) return 'scanner.denied'
  if (message.includes('in use') || message.includes('busy')) return 'scanner.inUse'
  if (message.includes('no camera') || message.includes('unavailable')) return 'scanner.notFound'
  return 'scanner.genericError'
}

/** The digits, from whichever field the platform filled in. */
function valueOf(barcode: Barcode): string {
  const value = barcode.rawValue ?? barcode.displayValue ?? ''
  return value.trim()
}

function hide(): void {
  document.body.classList.add(SCANNING_CLASS)
}

function reveal(): void {
  document.body.classList.remove(SCANNING_CLASS)
}

/**
 * Camera permission, asking for it once if it has not been decided yet.
 *
 * `startScan` would request it itself, but doing it here is what lets a denial
 * become `scanner.denied` — a message naming the actual problem — rather than an
 * opaque bridge rejection. `'limited'` is iOS 14's partial grant and is enough to
 * scan with.
 */
async function ensurePermission(): Promise<void> {
  let { camera } = await BarcodeScanner.checkPermissions()
  if (camera === 'prompt' || camera === 'prompt-with-rationale') {
    ;({ camera } = await BarcodeScanner.requestPermissions())
  }
  if (camera !== 'granted' && camera !== 'limited') {
    throw new ScannerError('scanner.denied')
  }
}

export const nativeScanner: ScannerBackend = {
  preview: 'behind-webview',

  async start({ onDetected, onFailed }: ScannerStartOptions): Promise<ScannerSession> {
    // Asked before anything else, so a device with no usable camera gets
    // "no camera was found" instead of a permission prompt it cannot satisfy.
    const { supported } = await BarcodeScanner.isSupported()
    if (!supported) throw new ScannerError('scanner.notFound')

    await ensurePermission()

    const listeners: ListenerHandle[] = []
    let stopped = false

    /**
     * The single teardown. Idempotent because React's cleanup, the first
     * detection and a mid-scan failure can all reach it, sometimes in that order,
     * and because leaving the page transparent is the worst outcome available.
     */
    const stop = async (): Promise<void> => {
      if (stopped) return
      stopped = true
      try {
        await Promise.all(listeners.map((listener) => listener.remove().catch(() => {})))
        await BarcodeScanner.stopScan()
      } catch {
        // Nothing to stop, or the bridge is already gone.
      } finally {
        reveal()
      }
    }

    try {
      // Pushed one at a time, not as two arguments to a single push: if the
      // second registration throws, the first handle has to already be in the
      // list for `stop()` to remove it.
      listeners.push(
        await BarcodeScanner.addListener('barcodesScanned', ({ barcodes }) => {
          if (stopped) return
          for (const barcode of barcodes) {
            const value = valueOf(barcode)
            if (value !== '') {
              onDetected(value)
              return
            }
          }
        }),
      )
      listeners.push(
        await BarcodeScanner.addListener('scanError', ({ message }) => {
          if (stopped) return
          // Surface it, then get the page back: a scan that has died is not
          // going to recover, and the component needs to be able to draw over
          // the dead camera to say so.
          const key = nativeErrorKey(new Error(message))
          void stop().finally(() => onFailed(key))
        }),
      )

      // Last, so nothing above can leave the page transparent by throwing.
      hide()
      await BarcodeScanner.startScan({
        formats: PRODUCT_FORMATS.map((format) => BarcodeFormat[ML_KIT_FORMAT[format]]),
        lensFacing: LensFacing.Back,
      })
    } catch (error) {
      await stop()
      throw new ScannerError(nativeErrorKey(error), { cause: error })
    }

    return { stop }
  },
}
