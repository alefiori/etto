import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/context/AuthContext'
import { fetchSubscription, isSubscriptionActive, waitForProEntitlement } from '@/lib/entitlement'
import { forgetPurchaser, identifyPurchaser } from '@/lib/purchases'
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
  /**
   * Re-read the entitlement after a purchase or restore, waiting for the
   * webhook to land. Resolves to whether Pro is active, so the paywall can tell
   * "bought and unlocked" from "bought, still syncing".
   */
  syncAfterPurchase: () => Promise<boolean>
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

  /**
   * Wait for the webhook, then adopt whatever it wrote.
   *
   * This is the only path that may *grant* access from a client action, so it
   * still ends at a server read — the store's word that a purchase succeeded
   * never becomes the app's word that Pro is on.
   */
  async function syncAfterPurchase(): Promise<boolean> {
    const sub = await waitForProEntitlement()
    if (sub) {
      setSubscription(sub)
      setError(null)
    }
    return isSubscriptionActive(sub)
  }

  useEffect(() => {
    if (!user) {
      // Signed out: no entitlement, and nothing to keep from the last session.
      setSubscription(null)
      if (!authLoading) setLoading(false)
      // Detach the store SDK too, so a purchase made by the next person to sign
      // in on this device can't land on the previous user's RevenueCat id.
      void forgetPurchaser()
      return
    }
    const signal = { cancelled: false }
    load(signal)
    // Point RevenueCat at the Supabase user id — the one thing the webhook can
    // resolve back to a row. Guests included: an anonymous account's id survives
    // being upgraded, so a purchase stays attached across it.
    void identifyPurchaser(user.id)
    return () => {
      signal.cancelled = true
    }
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
        syncAfterPurchase,
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
    syncAfterPurchase: async () => false,
  }
}
