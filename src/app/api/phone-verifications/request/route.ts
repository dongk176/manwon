import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { requestPhoneOtp } from '@/server/phoneVerification'
import { phoneOtpRequestSchema } from '@/server/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = phoneOtpRequestSchema.parse(await request.json())
    return ok(await requestPhoneOtp(userId, input.phone, request))
  } catch (error) {
    return toHttpError(error)
  }
}
