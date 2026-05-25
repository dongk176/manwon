import { NextRequest } from 'next/server'
import { fail, ok } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return fail('Unauthorized', 401)
  }

  return ok({ processed: 0, sent: 0, skipped: 0 })
}
