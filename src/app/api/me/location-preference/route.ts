import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/auth'
import { fail, ok, toHttpError } from '@/server/http'
import { updateLocationPreference } from '@/server/manwonService'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  region1Depth: z.string().trim().max(40).nullable().optional(),
  region2Depth: z.string().trim().max(40).nullable().optional(),
  region3Depth: z.string().trim().max(40).nullable().optional(),
  permissionStatus: z.enum(['unknown', 'prompt', 'granted', 'denied', 'unavailable']).default('unknown'),
})

export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = bodySchema.parse(await request.json())
    const profile = await updateLocationPreference(userId, input)
    if (!profile) return fail('위치 설정을 저장할 수 없습니다.', 404)
    return ok(profile)
  } catch (error) {
    return toHttpError(error)
  }
}
