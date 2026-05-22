import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { createActivityProfile, listActivityProfiles } from '@/server/manwonService'
import { activityProfileSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    return ok(await listActivityProfiles(userId))
  } catch (error) {
    return toHttpError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = activityProfileSchema.parse(await request.json())
    return ok(await createActivityProfile(userId, input), { status: 201 })
  } catch (error) {
    return toHttpError(error)
  }
}
