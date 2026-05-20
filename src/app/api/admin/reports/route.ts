import { NextRequest } from 'next/server'
import { fail, ok, toHttpError } from '@/server/http'
import { listAdminReports } from '@/server/manwonService'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const adminToken = process.env.MANWON_ADMIN_TOKEN
    if (!adminToken) return fail('관리자 신고 조회가 설정되지 않았습니다.', 503)
    if (request.headers.get('x-manwon-admin-token') !== adminToken) return fail('관리자 권한이 필요합니다.', 403)

    return ok(await listAdminReports())
  } catch (error) {
    return toHttpError(error)
  }
}
