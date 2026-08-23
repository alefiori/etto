import { useId, useRef, type ReactNode } from 'react'
import { useScrollLock } from '@/hooks/useScrollLock'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useOverlayDismiss } from '@/hooks/useOverlayDismiss'
import { useI18n } from '@/context/I18nContext'

/**
 * A compact, app-styled confirmation dialog replacing the native
 * `window.confirm`. Renders as a centered card on desktop and a bottom sheet on
 * mobile, matching the overlay language of {@link Modal} but sized for a single
 * question. Locks background scroll while open and closes on Escape / backdrop.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const titleId = useId()
  const messageId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useScrollLock(open)
  useFocusTrap(open, panelRef)
  useOverlayDismiss(open, onCancel)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-80 flex items-end justify-center p-0 glass-scrim sm:items-center sm:p-lg"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      {/* The sheet stays flush with the bottom edge and clears the home
          indicator with padding, so its actions are not half under it. */}
      <div
        ref={panelRef}
        className="flex w-full flex-col gap-md rounded-t-[36px] p-lg pb-[calc(var(--spacing-lg)+(var(--spacing-safe-bottom)))] sm:max-w-[28rem] sm:rounded-lens sm:pb-lg glass-sheet"
      >
        <h2 id={titleId} className="font-headline-md text-headline-md text-on-surface">
          {title}
        </h2>
        <p id={messageId} className="font-body-md text-body-md text-on-surface-variant">
          {message}
        </p>
        <div className="mt-sm flex justify-end gap-sm">
          <button
            data-autofocus
            onClick={onCancel}
            disabled={busy}
            className="rounded-full px-4 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:glass-chip disabled:opacity-40"
          >
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-full px-4 py-2 font-label-md text-label-md text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40 ${
              destructive ? 'bg-error' : 'bg-primary'
            }`}
          >
            {confirmLabel ?? t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
