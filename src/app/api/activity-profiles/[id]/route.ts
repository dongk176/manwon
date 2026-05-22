import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/auth'
import { fail, ok, toHttpError } from '@/server/http'
import { deactivateActivityProfile, updateActivityProfile } from '@/server/manwonService'
import { updateActivityProfileSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ id: z.string().uuid() })

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser(request)
    const { id } = paramsSchema.parse(await context.params)
    const input = updateActivityProfileSchema.parse(await request.json())
    const profile = await updateActivityProfile(userId, id, input)
    if (!profile) return fail('프로필을 찾을 수 없습니다.', 404)
    return ok(profile)
  } catch (error) {
    return toHttpError(error)
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser(request)
    const { id } = paramsSchema.parse(await context.params)
    const profile = await deactivateActivityProfile(userId, id)
    if (!profile) return fail('프로필을 찾을 수 없습니다.', 404)
    return ok(profile)
  } catch (error) {
    return toHttpError(error)
  }
}
