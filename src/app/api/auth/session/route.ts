import { NextRequest } from 'next/server'
import { clearAuthCookies, getRequestUserId } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { getMyPage } from '@/server/manwonService'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = getRequestUserId(request)
    if (!userId) return ok({ authenticated: false, profile: null })

    const profile = await getMyPage(userId)
    if (!profile || profile.withdrawnAt) {
      const response = ok({ authenticated: false, profile: null })
      clearAuthCookies(response)
      return response
    }

    return ok({
      authenticated: true,
      userId,
      profile,
    })
  } catch (error) {
    return toHttpError(error)
  }
}
