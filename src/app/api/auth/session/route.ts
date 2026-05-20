import { NextRequest } from 'next/server'
import { getRequestUserId } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { getMyPage } from '@/server/manwonService'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = getRequestUserId(request)
    if (!userId) return ok({ authenticated: false, profile: null })

    return ok({
      authenticated: true,
      userId,
      profile: await getMyPage(userId),
    })
  } catch (error) {
    return toHttpError(error)
  }
}
