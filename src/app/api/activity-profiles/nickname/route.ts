import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { checkActivityProfileNickname } from '@/server/manwonService'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const nickname = request.nextUrl.searchParams.get('nickname') ?? ''
    const excludeId = request.nextUrl.searchParams.get('excludeId')
    return ok(await checkActivityProfileNickname(userId, nickname, excludeId))
  } catch (error) {
    return toHttpError(error)
  }
}
