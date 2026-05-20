import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { addFavorite, deleteFavorite } from '@/server/manwonService'
import { favoriteSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = favoriteSchema.parse(await request.json())
    return ok(await addFavorite(userId, input), { status: 201 })
  } catch (error) {
    return toHttpError(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = favoriteSchema.parse(await request.json())
    return ok(await deleteFavorite(userId, input.postId))
  } catch (error) {
    return toHttpError(error)
  }
}
