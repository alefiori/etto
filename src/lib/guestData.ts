import { supabase } from '@/lib/supabase'

/**
 * Whether the current (guest) user has anything worth keeping.
 *
 * Signing into an *existing* account replaces the anonymous session, orphaning
 * whatever the guest logged — unlike the "create account" upgrade, which keeps
 * the same user_id. So the sign-in screen warns first, but only when there is
 * actually something to lose. The log tables are RLS-scoped to the current
 * user, so a bare "any row?" probe is enough; custom foods are the guest's own,
 * hence the explicit user_id filter.
 */
export async function guestHasData(userId: string): Promise<boolean> {
  const probes = [
    supabase.from('food_logs').select('id', { head: true, count: 'exact' }),
    supabase.from('weight_logs').select('id', { head: true, count: 'exact' }),
    supabase.from('water_logs').select('id', { head: true, count: 'exact' }),
    supabase.from('foods').select('id', { head: true, count: 'exact' }).eq('user_id', userId),
  ]

  const results = await Promise.all(probes)
  return results.some((r) => (r.count ?? 0) > 0)
}
