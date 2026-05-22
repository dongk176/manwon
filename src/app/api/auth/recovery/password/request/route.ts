import { NextRequest } from 'next/server'
import { requestPasswordRecovery } from '@/server/accountAuth'
import { ok, toHttpError } from '@/server/http'
import { passwordRecoveryRequestSchema } from '@/server/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const input = passwordRecoveryRequestSchema.parse(await request.json())
    const result = await requestPasswordRecovery(input, request)
    return ok(result)
  } catch (error) {
    return toHttpError(error)
  }
}
