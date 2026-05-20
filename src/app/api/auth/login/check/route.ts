import { NextRequest } from 'next/server'
import { checkLoginCredential } from '@/server/accountAuth'
import { createAuthSession, setAuthCookies } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { loginCheckSchema } from '@/server/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const input = loginCheckSchema.parse(await request.json())
    const result = await checkLoginCredential(input)
    const data = result.mode === 'signed_in'
      ? { ...result, ...createAuthSession(String(result.profile.id)) }
      : result
    const response = ok(data)
    if (result.mode === 'signed_in') {
      setAuthCookies(response, String(result.profile.id))
    }
    return response
  } catch (error) {
    return toHttpError(error)
  }
}
