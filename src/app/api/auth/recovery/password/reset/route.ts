import { NextRequest } from 'next/server'
import { resetPasswordWithRecovery } from '@/server/accountAuth'
import { ok, toHttpError } from '@/server/http'
import { passwordRecoveryResetSchema } from '@/server/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const input = passwordRecoveryResetSchema.parse(await request.json())
    const result = await resetPasswordWithRecovery(input)
    return ok(result)
  } catch (error) {
    return toHttpError(error)
  }
}
