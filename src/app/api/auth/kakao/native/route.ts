import { NextRequest } from 'next/server'
import { z } from 'zod'
import { setAuthCookies } from '@/server/auth'
import { getKakaoProfile, signInWithKakao } from '@/server/kakaoAuth'
import { ok, toHttpError } from '@/server/http'
import { getMyPage } from '@/server/manwonService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const nativeKakaoLoginSchema = z.object({
  accessToken: z.string().trim().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const input = nativeKakaoLoginSchema.parse(await request.json())
    const kakaoProfile = await getKakaoProfile(input.accessToken)
    const user = await signInWithKakao(kakaoProfile)
    const userId = String(user.id)
    const profile = await getMyPage(userId)
    const response = ok({
      authenticated: true,
      userId,
      profile: profile ?? user,
    })
    setAuthCookies(response, userId)
    return response
  } catch (error) {
    return toHttpError(error)
  }
}
