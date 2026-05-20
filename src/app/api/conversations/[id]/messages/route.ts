import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/auth'
import { fail, ok, toHttpError } from '@/server/http'
import { listMessages, sendMessage } from '@/server/manwonService'
import { createMessageSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ id: z.string().uuid() })
const querySchema = z.object({
  after: z.string().datetime().optional(),
})

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser(request)
    const { id } = paramsSchema.parse(await context.params)
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const messages = await listMessages(userId, id, query)
    if (!messages) return fail('메시지를 볼 권한이 없습니다.', 403)
    return ok(messages)
  } catch (error) {
    return toHttpError(error)
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser(request)
    const { id } = paramsSchema.parse(await context.params)
    const input = createMessageSchema.parse(await request.json())
    const message = await sendMessage(userId, id, input)
    if (!message) return fail('메시지를 보낼 권한이 없습니다.', 403)
    return ok(message, { status: 201 })
  } catch (error) {
    return toHttpError(error)
  }
}
