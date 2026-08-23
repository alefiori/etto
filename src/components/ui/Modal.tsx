import { useRef, type ReactNode } from 'react'
import { useScrollLock } from '@/hooks/useScrollLock'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useOverlayDismiss } from '@/hooks/useOverlayDismiss'

/**
 * Overlay container. On desktop it renders as a centered modal; on mobile as a
 * full-screen bottom sheet. The backdrop uses a 20% blur (DESIGN.md overlays).
 *
 * The panel — not the backdrop — carries the safe-area insets. Full-bleed on a
 * phone, it used to run its own children under the notch, which is where every
 * one of these modals puts its close button. Padding the panel rather than the
 * backdrop keeps its surface colour behind the status bar (the bar's text is
 * dark, set once in nativeBootstrap, so it needs a light backing) and keeps the
 * scrolling content inside it from sliding up under the notch. It applies at
 * every width because a landscape phone still clears `sm:`, and there the card
 * is wide enough to reach the side inset.
 */
export function Modal({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  labelledBy?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useScrollLock(open)
  useFocusTrap(open, panelRef)
  useOverlayDismiss(open, onClose)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-60 flex items-stretch justify-center glass-scrim sm:items-center sm:p-lg"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="flex h-full w-full flex-col overflow-hidden pb-safe-bottom pl-safe-left pr-safe-right pt-safe-top sm:h-[90vh] sm:max-w-5xl sm:rounded-[36px] glass-sheet"
      >
        {children}
      </div>
    </div>
  )
}
