import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/auth'
import { fail, ok, toHttpError } from '@/server/http'
import { getTaskPost, updateTaskPost } from '@/server/manwonService'
import { updatePostSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ id: z.string().uuid() })

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const post = await getTaskPost(id)
    if (!post) return fail('게시글을 찾을 수 없습니다.', 404)
    return ok(post)
  } catch (error) {
    return toHttpError(error)
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser(request)
    const { id } = paramsSchema.parse(await context.params)
    const input = updatePostSchema.parse(await request.json())
    const post = await updateTaskPost(userId, id, input)
    if (!post) return fail('수정 권한이 없거나 게시글을 찾을 수 없습니다.', 404)
    return ok(post)
  } catch (error) {
    return toHttpError(error)
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser(request)
    const { id } = paramsSchema.parse(await context.params)
    const post = await updateTaskPost(userId, id, { status: 'hidden' })
    if (!post) return fail('숨김 처리할 게시글을 찾을 수 없습니다.', 404)
    return ok(post)
  } catch (error) {
    return toHttpError(error)
  }
}
