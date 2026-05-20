import Constants from 'expo-constants'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchRealtimeToken } from '@/api/client'

let client: SupabaseClient | null = null

export async function getAuthorizedRealtimeClient() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || (Constants.expoConfig?.extra?.supabaseUrl as string | undefined)
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined)
  if (!url || !anonKey) return null

  if (!client) {
    client = createClient(url, anonKey, {
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

  const { token } = await fetchRealtimeToken()
  client.realtime.setAuth(token)
  return client
}
