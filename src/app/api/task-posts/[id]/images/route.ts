import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/auth'
import { fail, ok, toHttpError } from '@/server/http'
import { addTaskPostImage } from '@/server/manwonService'
import { imageRecordSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ id: z.string().uuid() })

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser(request)
    const { id } = paramsSchema.parse(await context.params)
    const input = imageRecordSchema.parse(await request.json())
    const image = await addTaskPostImage(userId, id, input)
    if (!image) return fail('이미지를 저장할 게시글을 찾을 수 없습니다.', 404)
    return ok(image, { status: 201 })
  } catch (error) {
    return toHttpError(error)
  }
}
