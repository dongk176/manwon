import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { createReport } from '@/server/manwonService'
import { reportSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = reportSchema.parse(await request.json())
    return ok(await createReport(userId, input), { status: 201 })
  } catch (error) {
    return toHttpError(error)
  }
}
