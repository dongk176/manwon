import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { fail, ok, toHttpError } from '@/server/http'
import { createConversation, listConversations } from '@/server/manwonService'
import { createConversationSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const conversations = await listConversations(userId)
    return ok(conversations)
  } catch (error) {
    return toHttpError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = createConversationSchema.parse(await request.json())
    const conversation = await createConversation(userId, input)
    if (!conversation) return fail('채팅방을 만들 권한이 없습니다.', 403)
    return ok(conversation, { status: 201 })
  } catch (error) {
    return toHttpError(error)
  }
}
