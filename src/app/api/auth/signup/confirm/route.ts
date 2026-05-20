import { NextRequest } from 'next/server'
import { confirmSignupOtp } from '@/server/accountAuth'
import { createAuthSession, setAuthCookies } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { signupOtpConfirmSchema } from '@/server/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const input = signupOtpConfirmSchema.parse(await request.json())
    const profile = await confirmSignupOtp(input)
    const response = ok({ ...profile, ...createAuthSession(String(profile.id)), profile })
    setAuthCookies(response, String(profile.id))
    return response
  } catch (error) {
    return toHttpError(error)
  }
}
