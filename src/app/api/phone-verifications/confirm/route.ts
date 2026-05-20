import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { confirmPhoneOtp } from '@/server/phoneVerification'
import { phoneOtpConfirmSchema } from '@/server/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = phoneOtpConfirmSchema.parse(await request.json())
    return ok(await confirmPhoneOtp(userId, input.phone, input.code))
  } catch (error) {
    return toHttpError(error)
  }
}
