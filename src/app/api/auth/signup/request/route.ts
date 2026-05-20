import { NextRequest } from 'next/server'
import { requestSignupOtp } from '@/server/accountAuth'
import { ok, toHttpError } from '@/server/http'
import { signupOtpRequestSchema } from '@/server/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const input = signupOtpRequestSchema.parse(await request.json())
    return ok(await requestSignupOtp(input, request))
  } catch (error) {
    return toHttpError(error)
  }
}
