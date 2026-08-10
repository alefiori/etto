import { createClient } from '@supabase/supabase-js'
import { isNativePlatform } from './platform'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env and set ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

/** Single shared Supabase client for the whole app. */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Off in the native shell: under HashRouter the fragment is '#/signin',
    // which supabase-js would try to parse as an auth callback it does not own.
    // Native sessions are established explicitly from a deep-link listener.
    detectSessionInUrl: !isNativePlatform(),
  },
})

/**
 * The signed-in user's id, for the `user_id` column on an insert.
 *
 * Reads and deletes never need this — RLS scopes them to the caller — but a row
 * being written has to carry an owner, and the policies reject one that doesn't
 * match the JWT. Throwing rather than returning null keeps every caller a
 * straight `await`, since none of them can do anything useful without a user.
 */
export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not authenticated.')
  return data.user.id
}
