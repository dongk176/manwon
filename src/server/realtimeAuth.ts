import { createHmac } from 'crypto'
import { getSupabaseRealtimeEnv } from '@/server/env'

const realtimeTokenTtlSeconds = 15 * 60

function base64UrlEncode(input: Buffer | string) {
  return Buffer.from(input).toString('base64url')
}

export function createRealtimeToken(userId: string) {
  const { url, anonKey, jwtSecret } = getSupabaseRealtimeEnv()
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = issuedAt + realtimeTokenTtlSeconds
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  }
  const payload = {
    aud: 'authenticated',
    exp: expiresAt,
    iat: issuedAt,
    role: 'authenticated',
    sub: userId,
  }

  const body = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`
  const signature = createHmac('sha256', jwtSecret).update(body).digest('base64url')

  return {
    token: `${body}.${signature}`,
    expiresIn: realtimeTokenTtlSeconds,
    websocketUrl: getRealtimeWebSocketUrl(url, anonKey),
  }
}

function getRealtimeWebSocketUrl(url: string, anonKey: string) {
  const websocketUrl = new URL('/realtime/v1/websocket', url)
  websocketUrl.protocol = websocketUrl.protocol === 'http:' ? 'ws:' : 'wss:'
  websocketUrl.searchParams.set('apikey', anonKey)
  websocketUrl.searchParams.set('vsn', '2.0.0')
  return websocketUrl.toString()
}
