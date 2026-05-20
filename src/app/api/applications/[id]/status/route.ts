import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/auth'
import { fail, ok, toHttpError } from '@/server/http'
import { updateApplicationStatus } from '@/server/manwonService'
import { updateApplicationStatusSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ id: z.string().uuid() })

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser(request)
    const { id } = paramsSchema.parse(await context.params)
    const input = updateApplicationStatusSchema.parse(await request.json())
    const result = await updateApplicationStatus(userId, id, input)
    if (!result) return fail('지원 상태를 변경할 권한이 없습니다.', 403)
    return ok(result)
  } catch (error) {
    return toHttpError(error)
  }
}
