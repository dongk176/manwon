import { NextRequest } from 'next/server'
import { z } from 'zod'
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
    return ok(await searchKakaoNeighborhoods(input.q, input.mode))
  } catch (error) {
    return toHttpError(error)
  }
}
