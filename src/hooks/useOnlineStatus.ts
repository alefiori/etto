import { useEffect, useState } from 'react'

/**
 * Whether the browser believes it has a network connection.
 *
 * `navigator.onLine` is a weak signal by design — it reports whether the device
 * has *a* route to a network, not whether Supabase is reachable — so this is
 * only ever used to set expectations (see OfflineBanner), never to decide
 * whether a request is worth making. A false negative would silently break the
 * app; a false positive only costs the user a request that fails the way it
 * already does.
 *
 * The `online`/`offline` events are the only way the value changes, and both
 * fire on `window` rather than on `navigator`.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine ?? true)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    // The connection can drop between the first render and this subscription —
    // a cold start on a train is exactly that window — and neither event would
    // ever fire again to correct it. Re-read once the listeners are attached.
    setOnline(navigator.onLine ?? true)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
