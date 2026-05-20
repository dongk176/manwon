import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { listNotifications } from '@/server/notifications'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    return ok(await listNotifications(userId, query.limit))
  } catch (error) {
    return toHttpError(error)
  }
}
