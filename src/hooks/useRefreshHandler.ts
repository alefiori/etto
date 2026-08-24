import { useEffect, useRef } from 'react'
import { useAppShell } from '@/context/AppShellContext'

/**
 * Declare what pull-to-refresh does on this page.
 *
 * The gesture lives in the shell (see usePullToRefresh) because the shell owns
 * the scroll container; this is how a page says what should happen when it
 * fires. Register nothing and the page simply has no refresh — which is the
 * right answer for a page whose content isn't fetched.
 *
 * The handler may be a fresh closure on every render — it is read through a ref
 * at call time, so registration happens once per mount and the pull always runs
 * the current one.
 */
export function useRefreshHandler(handler: () => Promise<unknown>) {
  const { _registerRefresh } = useAppShell()
  const latest = useRef(handler)
  // Assigned from an effect rather than during the render: nothing reads it
  // until a pull fires, which is long after the commit either way.
  useEffect(() => {
    latest.current = handler
  })

  useEffect(() => {
    _registerRefresh(() => latest.current())
    // Unregistering on the way out is what keeps a page from being refreshed
    // after the user has navigated off it.
    return () => _registerRefresh(null)
  }, [_registerRefresh])
}
