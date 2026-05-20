import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/auth'
import { fail, ok, toHttpError } from '@/server/http'
import { reopenTaskPost } from '@/server/manwonService'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ id: z.string().uuid() })

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser(request)
    const { id } = paramsSchema.parse(await context.params)
    const post = await reopenTaskPost(userId, id)
    if (!post) return fail('취소된 내 게시글만 다시 모집할 수 있습니다.', 403)
    return ok(post)
  } catch (error) {
    return toHttpError(error)
  }
}
