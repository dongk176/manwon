import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, toHttpError } from '@/server/http'
import { reverseKakaoAddress, reverseKakaoRegion } from '@/server/kakaoLocal'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  source: z.enum(['gps', 'manual']).default('gps'),
  mode: z.enum(['region', 'address']).default('region'),
})

export async function GET(request: NextRequest) {
  try {
    const input = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()))
    return ok(input.mode === 'address'
      ? await reverseKakaoAddress(input.lat, input.lng, input.source)
      : await reverseKakaoRegion(input.lat, input.lng, input.source))
  } catch (error) {
    return toHttpError(error)
  }
}
