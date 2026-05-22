import { NextRequest } from 'next/server'
import { confirmLoginIdRecovery } from '@/server/accountAuth'
import { ok, toHttpError } from '@/server/http'
import { accountRecoveryPhoneConfirmSchema } from '@/server/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const input = accountRecoveryPhoneConfirmSchema.parse(await request.json())
    const result = await confirmLoginIdRecovery(input)
    return ok(result)
  } catch (error) {
    return toHttpError(error)
  }
}
