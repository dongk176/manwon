import { NextRequest } from 'next/server'
import { requestLoginIdRecovery } from '@/server/accountAuth'
import { ok, toHttpError } from '@/server/http'
import { accountRecoveryPhoneSchema } from '@/server/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const input = accountRecoveryPhoneSchema.parse(await request.json())
    const result = await requestLoginIdRecovery(input, request)
    return ok(result)
  } catch (error) {
    return toHttpError(error)
  }
}
