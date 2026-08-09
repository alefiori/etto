// Delete the calling user's account, permanently.
//
// Why this needs to be a function at all: erasing an auth.users row requires
// the service role, and the service role must never be in a client bundle. So
// the client asks, this proves who is asking, and the deletion happens here.
//
// Security model — the whole point is that a caller can delete themselves and
// nobody else:
//   - The user id is taken from the caller's own JWT via auth.getUser(), never
//     from the request body. There is deliberately no "which user?" parameter,
//     so there is nothing to tamper with; a request cannot even express
//     "delete someone else".
//   - JWT verification is on (this function is deployed *without*
//     --no-verify-jwt, unlike revenuecat-webhook), so the platform rejects an
//     absent or malformed token before this code runs. getUser() is what
//     rejects a token that is well-formed but expired or revoked.
//
// What gets deleted: every table keys on user_id with `on delete cascade`, so
// removing the auth.users row removes targets, logs, foods, meals, weights,
// water, the profile and the subscription entitlement in one transaction. The
// one exception is community-shared foods, which the on_auth_user_deleted
// trigger orphans first so other users' logs survive — see
// supabase/migrations/0014_account_deletion.sql.
//
// What this cannot delete is the store-side subscription: Apple and Google own
// that record, and neither offers an API to cancel on the user's behalf. The
// client says so before confirming, which is also what the stores require.
//
// Deploy:
//   supabase functions deploy delete-account
//
// (No --no-verify-jwt here. That flag is what makes the webhook reachable by
// RevenueCat; on this function it would make account deletion reachable by
// anyone.)

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'unauthorized' }, 401)
  }

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !anonKey || !serviceKey) {
    console.error('delete-account is missing its Supabase environment')
    return json({ error: 'not_configured' }, 500)
  }

  // Anon client carrying the caller's token: getUser() then resolves the token
  // against the auth server, so an expired or revoked session fails here rather
  // than being trusted because it parses.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const { data: userData, error: userErr } = await asCaller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401)

  const userId = userData.user.id

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId)

  if (deleteErr) {
    // Deliberately not echoed to the client: it can name internals, and there
    // is nothing the user could do differently anyway.
    console.error('failed to delete user', userId, deleteErr.message)
    return json({ error: 'delete_failed' }, 500)
  }

  console.log('deleted account', userId)
  return json({ ok: true })
})
