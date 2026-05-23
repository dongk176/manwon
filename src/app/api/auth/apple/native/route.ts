import { NextRequest } from 'next/server'
import { z } from 'zod'
import { setAuthCookies } from '@/server/auth'
import { getAppleProfile, signInWithApple } from '@/server/appleAuth'
import { ok, toHttpError } from '@/server/http'
import { getMyPage } from '@/server/manwonService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const nativeAppleLoginSchema = z.object({
  identityToken: z.string().trim().min(1),
  fullName: z.string().trim().max(120).nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const input = nativeAppleLoginSchema.parse(await request.json())
    const appleProfile = await getAppleProfile(input)
    const user = await signInWithApple(appleProfile)
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
