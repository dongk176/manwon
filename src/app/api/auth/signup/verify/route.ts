import { NextRequest } from 'next/server'
import { verifySignupOtp } from '@/server/accountAuth'
import { ok, toHttpError } from '@/server/http'
import { signupOtpConfirmSchema } from '@/server/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const input = signupOtpConfirmSchema.parse(await request.json())
    return ok(await verifySignupOtp(input))
  } catch (error) {
    return toHttpError(error)
  }
}
