// RevenueCat webhook -> public.subscriptions.
//
// Why this exists: entitlements must be decided server-side. RevenueCat is the
// only party that has verified the receipt with Apple or Google, and the
// on-device SDK cache is trivially spoofable on a rooted device. So the client
// never writes public.subscriptions — it has no RLS policy allowing it — and
// this function, running with the service role, is the sole writer.
//
// Security model:
//   - RevenueCat is configured with an Authorization header value; requests
//     whose header doesn't match it are rejected. The comparison is
//     length-safe and constant-time so it can't be probed byte by byte.
//   - The Supabase user id comes from the event's app_user_id, which the app
//     sets to the signed-in user's id when it configures the SDK. It is
//     validated as a UUID before use — anything else is refused rather than
//     written to a foreign key that would fail confusingly later.
//   - Ordering and replay are handled by shouldApply(); see normalize.ts.
//
// Deploy:
//   supabase functions deploy revenuecat-webhook --no-verify-jwt
//   supabase secrets set REVENUECAT_WEBHOOK_SECRET=<the same value you paste
//     into RevenueCat's webhook Authorization field>
//
// --no-verify-jwt is required: RevenueCat is not a Supabase client and sends no
// Supabase JWT. The shared secret above is what authenticates it instead.

// npm: specifier rather than esm.sh: the latter periodically 522s at bundle
// time (Cloudflare connection timeout), failing the deploy. Deno resolves npm
// packages from the npm registry directly, which is the source Supabase's Edge
// Function docs now recommend.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  isHandled,
  shouldApply,
  toSubscriptionRow,
  type RevenueCatEvent,
} from './normalize.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Constant-time compare so a wrong secret can't be narrowed down by timing. */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? ''
  if (!expected) {
    // Refuse rather than accept everything if the secret was never set.
    console.error('REVENUECAT_WEBHOOK_SECRET is not configured')
    return json({ error: 'not_configured' }, 500)
  }

  const provided = req.headers.get('authorization') ?? ''
  if (!secretMatches(provided, expected)) return json({ error: 'unauthorized' }, 401)

  let payload: { event?: RevenueCatEvent }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const event = payload.event
  if (!event) return json({ error: 'missing_event' }, 400)

  // Acknowledge unknown types with 200. Returning an error would make
  // RevenueCat retry forever over something we will never act on.
  if (!isHandled(event.type)) return json({ ok: true, ignored: event.type })

  const userId = event.app_user_id ?? ''
  if (!UUID_RE.test(userId)) {
    // Anonymous RevenueCat ids ($RCAnonymousID:...) land here. They mean the
    // purchase was made before the app identified the user, which the client is
    // built to avoid; there is nothing to attach the entitlement to.
    console.warn('event with non-UUID app_user_id', event.id, userId.slice(0, 12))
    return json({ ok: true, ignored: 'unidentified_user' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    // Service role: this is the only writer, and it must bypass the read-only
    // RLS that keeps clients out.
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  const { data: existing, error: readErr } = await supabase
    .from('subscriptions')
    .select('last_event_id, last_event_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (readErr) {
    console.error('failed to read existing subscription', readErr.message)
    // 500 so RevenueCat retries — a transient read failure must not silently
    // drop a purchase.
    return json({ error: 'read_failed' }, 500)
  }

  if (!shouldApply(event, existing)) {
    return json({ ok: true, ignored: 'stale_or_duplicate' })
  }

  const row = toSubscriptionRow(event, userId)
  const { error: writeErr } = await supabase
    .from('subscriptions')
    .upsert(row, { onConflict: 'user_id' })

  if (writeErr) {
    console.error('failed to write subscription', writeErr.message)
    return json({ error: 'write_failed' }, 500)
  }

  return json({ ok: true })
})
