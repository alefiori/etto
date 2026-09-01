import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

/** How long "Back online" stays up before it dismisses itself. */
const BACK_ONLINE_MS = 3000

/**
 * Tells the user the connection is gone, before a save fails and tells them
 * something less useful.
 *
 * Deliberately *only* a banner. There is no write queue behind it and no retry:
 * a mutation attempted offline still fails exactly as it did, with the generic
 * error string it already showed. What changes is that the failure is no longer
 * a surprise — the expectation was set before they typed. Queueing writes is a
 * much larger piece of work (ordering, conflict resolution, a durable store)
 * and is out of scope here.
 *
 * **`role="status"`, not `role="alert"`.** The README's convention puts errors
 * on `alert` and confirmations on `status`, and the pull is towards `alert`
 * here since losing the network is disruptive news rather than a confirmation.
 * It is still the wrong role, for two reasons. `alert` is assertive: it
 * interrupts whatever a screen reader is currently saying, which is right for
 * the result of an action the user just took and wrong for an ambient condition
 * they did not cause and cannot act on from here. And `alert` is specified for
 * *transient* messages, where this element is persistent for as long as the
 * connection is down — several screen readers re-announce a live alert region
 * on re-render, which would mean hearing this repeatedly while trying to read
 * the page underneath. A polite `status` says it once, at the next natural
 * pause, which is what a state change deserves.
 */
export function OfflineBanner() {
  const { t } = useI18n()
  const online = useOnlineStatus()
  const [showBack, setShowBack] = useState(false)
  // Nothing to celebrate on first load: "Back online" should only follow an
  // outage this session, not greet every visitor who opens the app online.
  const wasOffline = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!online) {
      wasOffline.current = true
      clearTimeout(timer.current)
      setShowBack(false)
      return
    }
    if (!wasOffline.current) return
    wasOffline.current = false
    // Same shape as the transient notices elsewhere (see Dashboard's
    // flashNotice): set, arm one timer, clear it on unmount.
    setShowBack(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setShowBack(false), BACK_ONLINE_MS)
  }, [online])

  useEffect(() => () => clearTimeout(timer.current), [])

  if (online && !showBack) return null

  return (
    // `sticky`, not `fixed`, and rendered as the first child inside AppLayout's
    // <main> (right before GuestBanner). A `fixed top-0` version was tried
    // first and covered the phone top bar's wordmark and profile button, since
    // both would be `fixed top-0` at the same coordinates with nothing but
    // z-index deciding who wins. <main> already reserves exactly the chrome's
    // real, measured height as its own top padding (`pt-topbar` on phone,
    // `md:pt-lg` once the rail replaces it — see useChromeMetrics), so a plain
    // `sticky top-0` child needs no offset math of its own: it starts exactly
    // where the padding already put it, below the header, and then sticks
    // there as the lane scrolls. `z-10` only has to clear ordinary content —
    // it is not contending with the header (z-40) or the tab bar (z-50) at all
    // any more, since it lives inside the content lane, not the viewport.
    <div
      role="status"
      aria-live="polite"
      className="animate-overlay-fade-in sticky top-0 z-10 flex items-center justify-center gap-sm px-container-margin-mobile py-2 text-center font-label-md text-label-md md:px-container-margin-desktop"
      style={{
        background: online ? 'rgb(var(--primary-container))' : 'rgb(var(--inverse-surface))',
        color: online ? 'rgb(var(--on-primary-container))' : 'rgb(var(--inverse-on-surface))',
      }}
    >
      <Icon name={online ? 'cloud_done' : 'cloud_off'} className="shrink-0 text-sm" />
      {online ? t('offline.back') : t('offline.banner')}
    </div>
  )
}
