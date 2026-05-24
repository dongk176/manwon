import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { resolveConversationTarget } from '@/server/manwonService'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
  applicationId: z.string().uuid().nullable().optional(),
  postId: z.string().uuid().nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const target = await resolveConversationTarget(userId, input)
    return ok(target)
  } catch (error) {
    return toHttpError(error)
  }
}
