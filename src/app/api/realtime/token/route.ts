import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { assertPhoneVerified } from '@/server/phoneVerification'
import { createRealtimeToken } from '@/server/realtimeAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    await assertPhoneVerified(userId)
    return ok(createRealtimeToken(userId))
  } catch (error) {
    return toHttpError(error)
  }
}
