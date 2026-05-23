import { NextRequest } from 'next/server'
import { z } from 'zod'
import { searchLocalRegions } from '@/data/koreaRegions'
import { ok, toHttpError } from '@/server/http'
import { searchKakaoNeighborhoods } from '@/server/kakaoLocal'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  q: z.string().trim().min(1).max(80),
  mode: z.enum(['region', 'address']).default('region'),
})

export async function GET(request: NextRequest) {
  try {
    const input = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()))
    const localResults = searchLocalRegions(input.q)

    if (input.mode === 'region' || localResults.length > 0) {
      return ok(localResults)
    }

    const kakaoResults = await searchKakaoNeighborhoods(input.q, input.mode)
    return ok(kakaoResults.length > 0 ? kakaoResults : localResults)
  } catch (error) {
    return toHttpError(error)
  }
}
