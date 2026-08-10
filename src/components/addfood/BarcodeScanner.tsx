import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { useI18n } from '@/context/I18nContext'
import type { TranslationKey } from '@/lib/i18n'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'

/** Retail product barcodes — restricting formats speeds up and steadies decoding. */
const PRODUCT_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
]

/** Map a getUserMedia error to a translation key for a friendly message. */
function cameraErrorKey(err: unknown): TranslationKey {
  const name = err instanceof Error ? err.name : ''
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
 * Full-screen camera barcode scanner. Prefers the rear camera on mobile,
 * decodes EAN/UPC product barcodes, and reports the first decoded value via
 * {@link onDetected}. The camera stream is always released on unmount or close.
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
  const controlsRef = useRef<IScannerControls | null>(null)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null)

  useEffect(() => {
    let cancelled = false
    let done = false

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, PRODUCT_FORMATS)
    const reader = new BrowserMultiFormatReader(hints)

    async function start() {
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current!,
          (result, _err, ctrl) => {
            // `_err` is mostly NotFoundException per-frame (no barcode yet) — ignore it.
            if (cancelled || done || !result) return
            done = true
            ctrl.stop()
            onDetected(result.getText())
          },
        )
        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls
        setStatus('scanning')
      } catch (err) {
        if (cancelled) return
        setErrorKey(cameraErrorKey(err))
        setStatus('error')
      }
    }

    start()
    return () => {
      cancelled = true
      controlsRef.current?.stop()
    }
  }, [onDetected])

  return (
    <div className="absolute inset-0 z-70 flex flex-col bg-black">
      <header className="flex items-center justify-between gap-md p-md text-white">
        <h2 className="font-headline-md text-headline-md">{t('scanner.title')}</h2>
        <button
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          aria-label={t('scanner.closeScanner')}
        >
          <Icon name="close" />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />

        {status === 'scanning' && (
          <>
            {/* Reticle to guide aiming */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[28%] w-[78%] max-w-[24rem] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
            <p className="absolute inset-x-0 bottom-6 text-center font-body-md text-body-md text-white/90">
              {t('scanner.pointCamera')}
            </p>
          </>
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-sm text-white">
            <Spinner className="h-6 w-6" />
            <p className="font-body-md text-body-md">{t('scanner.starting')}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-md p-xl text-center text-white">
            <Icon name="videocam_off" className="text-4xl text-white/70" />
            <p className="max-w-[24rem] font-body-md text-body-md text-white/90">{errorKey && t(errorKey)}</p>
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
