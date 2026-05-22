import { NextRequest } from 'next/server'
import { getRequestUserId, requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { createTaskPost, listTaskPosts } from '@/server/manwonService'
import { createPostSchema, listPostsSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const viewerId = getRequestUserId(request)
    const input = listPostsSchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()))
    const posts = await listTaskPosts(input, viewerId)
    return ok(posts)
  } catch (error) {
    return toHttpError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = createPostSchema.parse(await request.json())
    const post = await createTaskPost(userId, input)
    return ok(post, { status: 201 })
  } catch (error) {
    return toHttpError(error)
  }
}
