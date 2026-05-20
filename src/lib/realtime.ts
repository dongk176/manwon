'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchRealtimeToken } from '@/lib/manwonApi'

let realtimeClient: SupabaseClient | null = null

export function getRealtimeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) return null

  if (!realtimeClient) {
    realtimeClient = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  }

  return realtimeClient
}

export async function authorizeRealtimeClient() {
  const client = getRealtimeClient()
  if (!client) return null

  const { token } = await fetchRealtimeToken()
  client.realtime.setAuth(token)
  return client
}
