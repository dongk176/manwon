import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/auth'
import { fail, ok, toHttpError } from '@/server/http'
import { markNotificationRead } from '@/server/notifications'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ id: z.string().uuid() })

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser(request)
    const { id } = paramsSchema.parse(await context.params)
    const notification = await markNotificationRead(userId, id)
    if (!notification) return fail('알림을 찾을 수 없습니다.', 404)
    return ok(notification)
  } catch (error) {
    return toHttpError(error)
  }
}
