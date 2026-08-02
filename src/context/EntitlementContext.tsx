import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/context/AuthContext'
import { fetchSubscription, isSubscriptionActive } from '@/lib/entitlement'
import type { Subscription } from '@/lib/database.types'

interface EntitlementValue {
  /** The entitlement row, or null when the user has never subscribed. */
  subscription: Subscription | null
  /** Whether Pro features should be unlocked right now. */
  isPro: boolean
  /** True while the store reports a payment problem, so the UI can warn. */
  hasBillingIssue: boolean
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

const EntitlementContext = createContext<EntitlementValue | undefined>(undefined)

/**
 * Pro entitlement, read from the server.
 *
 * Sits beside ProfileProvider rather than inside RequireAuth so the paywall and
 * the restore-purchases flow can render before the app's guarded routes.
 *
 * **Failure policy.** On a read error this keeps whatever entitlement it last
 * saw and does not revoke: locking a paying customer out of features they have
 * bought because their train went into a tunnel is far worse than briefly
 * showing Pro to someone whose subscription lapsed in the same window. It fails
 * closed for anyone it has never seen an entitlement for — the default is not
 * Pro — so this only ever extends existing access, never grants new access.
 */
export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load(signal?: { cancelled: boolean }) {
    setLoading(true)
    try {
      const sub = await fetchSubscription()
      if (signal?.cancelled) return
      setSubscription(sub)
      setError(null)
    } catch (e) {
      if (signal?.cancelled) return
      // Deliberately does not clear `subscription` — see the failure policy above.
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) {
      // Signed out: no entitlement, and nothing to keep from the last session.
      setSubscription(null)
      if (!authLoading) setLoading(false)
      return
    }
    const signal = { cancelled: false }
    load(signal)
    return () => {
      signal.cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  return (
    <EntitlementContext.Provider
      value={{
        subscription,
        isPro: isSubscriptionActive(subscription),
        hasBillingIssue: subscription?.billing_issue ?? false,
        loading,
        error,
        refetch: () => load(),
      }}
    >
      {children}
    </EntitlementContext.Provider>
  )
}

/**
 * Unlike useProfile, this does not throw outside a provider — it reports "not
 * Pro". A missing provider must never be the reason a paywall is bypassed, and
 * component tests shouldn't have to wrap everything to render a gated control.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useEntitlement(): EntitlementValue {
  const ctx = useContext(EntitlementContext)
  if (ctx) return ctx
  return {
    subscription: null,
    isPro: false,
    hasBillingIssue: false,
    loading: false,
    error: null,
    refetch: async () => {},
  }
}
