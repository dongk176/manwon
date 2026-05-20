import { NextRequest } from 'next/server'
import { clearAuthCookies, requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { withdrawMyAccount } from '@/server/manwonService'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const result = await withdrawMyAccount(userId)
    const response = ok(result)
    clearAuthCookies(response)
    return response
  } catch (error) {
    return toHttpError(error)
  }
}
