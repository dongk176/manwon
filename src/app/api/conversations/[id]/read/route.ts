import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/auth'
import { fail, ok, toHttpError } from '@/server/http'
import { markConversationRead } from '@/server/manwonService'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ id: z.string().uuid() })
const bodySchema = z.object({
  lastMessageId: z.string().uuid().nullable().optional(),
}).default({})

async function optionalJson(request: NextRequest) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser(request)
    const { id } = paramsSchema.parse(await context.params)
    const input = bodySchema.parse(await optionalJson(request))
    const result = await markConversationRead(userId, id, input)
    if (!result) return fail('채팅방을 볼 권한이 없습니다.', 403)
    return ok(result)
  } catch (error) {
    return toHttpError(error)
  }
}
