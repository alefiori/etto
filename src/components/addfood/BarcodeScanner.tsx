import { useEffect, useId, useRef, useState } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useOverlayDismiss } from '@/hooks/useOverlayDismiss'
import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import {
  SCANNER_VIEW_CLASS,
  scannerBackend,
  scannerPreview,
  scannerErrorKey,
  type ScannerErrorKey,
  type ScannerSession,
} from '@/components/addfood/barcode'

/**
 * Full-screen camera barcode scanner. Prefers the rear camera, decodes EAN/UPC
 * product barcodes, and reports the first decoded value via {@link onDetected}.
 * The camera is always released on unmount or close.
 *
 * This is the UI only. *How* a camera is opened and a barcode decoded differs
 * completely between platforms — ML Kit's native pipeline in the app shells,
 * ZXing over `getUserMedia` in a browser — so that lives behind the seam in
 * `barcode/`, chosen at runtime, and this component never learns which it got
 * beyond one question: whether the preview arrives in the `<video>` below or on
 * a native surface underneath the whole WebView.
 *
 * The public contract is `{ onDetected, onClose }` and nothing else. AddFoodModal
 * lazy-loads this by name and passes exactly those two, and it did not have to
 * change for any of the above.
 */
export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [errorKey, setErrorKey] = useState<ScannerErrorKey | null>(null)

  // Known synchronously — see scannerPreview's own comment for why this does
  // not need the backend itself to have loaded yet.
  const preview = scannerPreview()

  // It covers the Add Food modal rather than replacing it, so without a trap of
  // its own Tab would walk the search results still mounted underneath. Escape
  // and Android back close only the scanner, leaving that modal open — which is
  // where the user came from and expects to land back in.
  useFocusTrap(true, rootRef)
  useOverlayDismiss(true, onClose)

  useEffect(() => {
    let cancelled = false
    let done = false
    let session: ScannerSession | null = null

    function fail(key: ScannerErrorKey) {
      if (cancelled) return
      setErrorKey(key)
      setStatus('error')
    }

    async function start() {
      try {
        // Loads whichever backend this platform needs — see scannerBackend's
        // comment for why that decision, not just the SDK inside it, is what
        // is behind the dynamic import.
        const backend = await scannerBackend()
        if (cancelled) return
        const started = await backend.start({
          video: videoRef.current,
          onDetected: (code) => {
            if (cancelled || done) return
            done = true
            // Stop before handing the code up: the parent unmounts us in
            // response, and a camera that is still running while React tears
            // the tree down is how a scanner ends up holding the device.
            void session?.stop()
            onDetected(code)
          },
          onFailed: fail,
        })
        // A result or a close can both land while start() is still in flight,
        // and the session that resolves afterwards is then nobody's to stop
        // but ours.
        if (cancelled || done) {
          void started.stop()
          return
        }
        session = started
        setStatus('scanning')
      } catch (err) {
        if (cancelled) return
        fail(scannerErrorKey(err))
      }
    }

    void start()
    return () => {
      cancelled = true
      void session?.stop()
    }
    // scannerPreview/scannerBackend are stable module-level functions, not
    // reactive values, so they need no place in this list.
  }, [onDetected])

  /**
   * Whether the camera is currently painting *behind* the page.
   *
   * Only then does the black backdrop have to go — and only then is it safe for
   * it to go. It comes back for the error state, where the native camera has
   * already been torn down and the page restored, and white-on-nothing would
   * otherwise land on top of the app's own background.
   */
  const seeThrough = preview === 'behind-webview' && status === 'scanning'

  return (
    <div
      ref={rootRef}
      // SCANNER_VIEW_CLASS is what src/index.css paints back in over the page a
      // native scan hides; it selects nothing on the web.
      className={`${SCANNER_VIEW_CLASS} absolute inset-0 z-70 flex flex-col ${
        seeThrough ? '' : 'bg-black'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <header className="flex items-center justify-between gap-md p-md text-white">
        <h2 id={titleId} className="font-headline-md text-headline-md">
          {t('scanner.title')}
        </h2>
        <button
          data-autofocus
          onClick={onClose}
          className="tap-target flex min-h-10 min-w-10 shrink-0 items-center justify-center p-2 rounded-full bg-white/10 transition-colors hover:bg-white/20"
          aria-label={t('scanner.closeScanner')}
        >
          <Icon name="close" />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        {/* Only the ZXing backend decodes out of a DOM element. ML Kit has no
            node to render — the preview is an OS surface below the WebView —
            and an empty <video> there would be one more opaque thing between
            the user and the camera. */}
        {preview === 'video' && (
          <video
            ref={videoRef}
            aria-hidden="true"
            className="h-full w-full object-cover"
            muted
            playsInline
          />
        )}

        {/* Starting → scanning → failed is the entire state of this screen, and
            none of it is visible to a screen reader: the reticle is a border and
            the preview is a video (or, natively, not in the page at all).
            Announcing the transitions is what makes the scanner usable without
            sight of it — including the failure, which is otherwise a silent
            black rectangle. Identical on both backends, deliberately: which
            camera API the platform happens to use is not something a screen
            reader user should be able to tell. */}
        <p role="status" aria-live="polite" className="sr-only">
          {status === 'starting' && t('scanner.starting')}
          {status === 'scanning' && t('scanner.pointCamera')}
          {status === 'error' && errorKey && t(errorKey)}
        </p>

        {status === 'scanning' && (
          <>
            {/* Reticle to guide aiming */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[28%] w-[78%] max-w-[24rem] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
            <p
              aria-hidden="true"
              className="absolute inset-x-0 bottom-6 text-center font-body-md text-body-md text-white/90"
            >
              {t('scanner.pointCamera')}
            </p>
          </>
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-sm text-white">
            <Spinner className="h-6 w-6" />
            <p aria-hidden="true" className="font-body-md text-body-md">
              {t('scanner.starting')}
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-md p-xl text-center text-white">
            <Icon name="videocam_off" className="text-4xl text-white/70" />
            <p aria-hidden="true" className="max-w-[24rem] font-body-md text-body-md text-white/90">
              {errorKey && t(errorKey)}
            </p>
            <button
              onClick={onClose}
              className="rounded-full bg-white px-5 py-2 font-label-md text-label-md font-semibold text-on-surface transition-colors hover:bg-white/90"
            >
              {t('scanner.backToSearch')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
