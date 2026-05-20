import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { registerDevicePushToken, revokeDevicePushToken } from '@/server/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const pushTokenSchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  fcmToken: z.string().trim().min(20).max(4096),
  deviceId: z.string().trim().max(200).nullable().optional(),
  appVersion: z.string().trim().max(80).nullable().optional(),
})

const deletePushTokenSchema = z.object({
  fcmToken: z.string().trim().min(20).max(4096).nullable().optional(),
  deviceId: z.string().trim().max(200).nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = pushTokenSchema.parse(await request.json())
    return ok(await registerDevicePushToken(userId, input), { status: 201 })
  } catch (error) {
    return toHttpError(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = deletePushTokenSchema.parse(await request.json())
    return ok(await revokeDevicePushToken(userId, input))
  } catch (error) {
    return toHttpError(error)
  }
}
