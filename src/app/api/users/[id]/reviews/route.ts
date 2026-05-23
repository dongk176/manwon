import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, toHttpError } from '@/server/http'
import { listUserReceivedReviews } from '@/server/manwonService'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ id: z.string().uuid() })

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = paramsSchema.parse(await context.params)
    return ok(await listUserReceivedReviews(id))
  } catch (error) {
    return toHttpError(error)
  }
}
