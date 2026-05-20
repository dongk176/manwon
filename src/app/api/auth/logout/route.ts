import { clearAuthCookies } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const response = ok({ success: true })
    clearAuthCookies(response)
    return response
  } catch (error) {
    return toHttpError(error)
  }
}
