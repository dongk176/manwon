import { createSign } from 'crypto'
import { getSql } from '@/server/db'
import { getFirebaseEnv, getMissingFirebaseEnv } from '@/server/env'

const schema = 'manwon_happiness'
const oauthTokenUrl = 'https://oauth2.googleapis.com/token'
const firebaseScope = 'https://www.googleapis.com/auth/firebase.messaging'

let cachedFirebaseAccessToken: { token: string; expiresAt: number } | null = null

export type PushPlatform = 'ios' | 'android' | 'web'

export interface NotificationPayload {
  type: string
  title: string
  body: string
  data?: Record<string, string | number | boolean | null | undefined>
}

export async function registerDevicePushToken(
  userId: string,
  input: {
    platform: PushPlatform
    fcmToken: string
    deviceId?: string | null
    appVersion?: string | null
  },
) {
  const sql = getSql()
  const [row] = await sql`
    insert into ${sql(schema)}.device_push_tokens (
      user_id,
      platform,
      fcm_token,
      device_id,
      app_version,
      enabled,
      last_seen_at,
      revoked_at
    )
    values (
      ${userId},
      ${input.platform},
      ${input.fcmToken},
      ${input.deviceId ?? null},
      ${input.appVersion ?? null},
      true,
      now(),
      null
    )
    on conflict (fcm_token) do update
      set user_id = excluded.user_id,
          platform = excluded.platform,
          device_id = excluded.device_id,
          app_version = excluded.app_version,
          enabled = true,
          last_seen_at = now(),
          revoked_at = null,
          updated_at = now()
    returning *
  `

  return row
}

export async function revokeDevicePushToken(userId: string, input: { fcmToken?: string | null; deviceId?: string | null }) {
  const sql = getSql()
  const rows = await sql`
    update ${sql(schema)}.device_push_tokens
    set enabled = false,
        revoked_at = now(),
        updated_at = now()
    where user_id = ${userId}
      and (
        (${input.fcmToken ?? null}::text is not null and fcm_token = ${input.fcmToken ?? null})
        or (${input.deviceId ?? null}::text is not null and device_id = ${input.deviceId ?? null})
      )
    returning *
  `

  return rows
}

export async function createNotificationEvent(userId: string, payload: NotificationPayload) {
  const sql = getSql()
  const [event] = await sql`
    insert into ${sql(schema)}.notification_events (user_id, type, title, body, data)
    values (${userId}, ${payload.type}, ${payload.title}, ${payload.body}, ${JSON.stringify(payload.data ?? {})}::jsonb)
    returning *
  `

  await sendPushToUser(userId, payload).catch(() => undefined)
  return event
}

export async function listNotifications(userId: string, limit = 50) {
  const sql = getSql()
  return sql`
    select *
    from ${sql(schema)}.notification_events
    where user_id = ${userId}
    order by created_at desc
    limit ${Math.min(Math.max(limit, 1), 100)}
  `
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const sql = getSql()
  const [row] = await sql`
    update ${sql(schema)}.notification_events
    set read_at = coalesce(read_at, now())
    where id = ${notificationId}
      and user_id = ${userId}
    returning *
  `

  return row ?? null
}

export async function sendPushToUser(userId: string, payload: NotificationPayload) {
  if (getMissingFirebaseEnv().length > 0) return

  const sql = getSql()
  const tokens = await sql`
    select fcm_token
    from ${sql(schema)}.device_push_tokens
    where user_id = ${userId}
      and enabled = true
      and revoked_at is null
  `

  if (tokens.length === 0) return

  const accessToken = await getFirebaseAccessToken()
  await Promise.allSettled(tokens.map((row) => sendFirebaseMessage(String(row.fcmToken), payload, accessToken)))
}

async function sendFirebaseMessage(token: string, payload: NotificationPayload, accessToken: string) {
  const { projectId } = getFirebaseEnv()
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: stringifyPushData(payload.data ?? {}),
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            icon: 'ic_notification',
            color: '#FF4800',
          },
        },
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`FCM send failed: ${response.status}`)
  }
}

async function getFirebaseAccessToken() {
  const now = Math.floor(Date.now() / 1000)
  if (cachedFirebaseAccessToken && cachedFirebaseAccessToken.expiresAt - 60 > now) {
    return cachedFirebaseAccessToken.token
  }

  const { clientEmail, privateKey } = getFirebaseEnv()
  const assertion = createFirebaseJwt(clientEmail, privateKey, now)
  const response = await fetch(oauthTokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!response.ok) {
    throw new Error(`Firebase auth failed: ${response.status}`)
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!payload.access_token) throw new Error('Firebase auth did not return an access token.')

  cachedFirebaseAccessToken = {
    token: payload.access_token,
    expiresAt: now + Number(payload.expires_in ?? 3600),
  }
  return cachedFirebaseAccessToken.token
}

function createFirebaseJwt(clientEmail: string, privateKey: string, issuedAt: number) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({
    iss: clientEmail,
    scope: firebaseScope,
    aud: oauthTokenUrl,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }))
  const input = `${header}.${claims}`
  const signer = createSign('RSA-SHA256')
  signer.update(input)
  signer.end()
  return `${input}.${signer.sign(privateKey, 'base64url')}`
}

function base64url(value: string) {
  return Buffer.from(value).toString('base64url')
}

function stringifyPushData(data: Record<string, string | number | boolean | null | undefined>) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  )
}
