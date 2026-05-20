import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { getMyPage } from '@/server/manwonService'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    return ok(await getMyPage(userId))
  } catch (error) {
    return toHttpError(error)
  }
}
