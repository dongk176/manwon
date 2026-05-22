import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/auth'
import { fail, ok, toHttpError } from '@/server/http'
import { startConversationForPost } from '@/server/manwonService'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ id: z.string().uuid() })
const bodySchema = z.object({
  profileId: z.string().uuid(),
  message: z.string().trim().max(500).nullable().optional(),
})

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser(request)
    const { id } = paramsSchema.parse(await context.params)
    const input = bodySchema.parse(await request.json().catch(() => ({})))
    const conversation = await startConversationForPost(userId, id, input.profileId, input.message)
    if (!conversation) return fail('채팅을 시작할 수 없는 게시글입니다.', 400)
    return ok(conversation, { status: 201 })
  } catch (error) {
    return toHttpError(error)
  }
}
