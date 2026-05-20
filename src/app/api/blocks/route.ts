import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { createBlock, deleteBlock } from '@/server/manwonService'
import { blockSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = blockSchema.parse(await request.json())
    return ok(await createBlock(userId, input), { status: 201 })
  } catch (error) {
    return toHttpError(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = blockSchema.parse(await request.json())
    return ok(await deleteBlock(userId, input.blockedUserId))
  } catch (error) {
    return toHttpError(error)
  }
}
