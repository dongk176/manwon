import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { acceptRequiredLegalAgreements } from '@/server/manwonService'
import { requiredLegalAgreementsSchema } from '@/server/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = requiredLegalAgreementsSchema.parse(await request.json())
    return ok(await acceptRequiredLegalAgreements(userId, input))
  } catch (error) {
    return toHttpError(error)
  }
}
