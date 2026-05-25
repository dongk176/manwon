import { NextRequest } from 'next/server'
import { fail, ok, toHttpError } from '@/server/http'
import { processDueTradeEvents } from '@/server/manwonService'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
      return fail('Unauthorized', 401)
    }

    return ok(await processDueTradeEvents())
  } catch (error) {
    return toHttpError(error)
  }
}
