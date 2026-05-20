import { NextRequest } from 'next/server'
import { checkSignupLoginId } from '@/server/accountAuth'
import { ok, toHttpError } from '@/server/http'
import { signupLoginIdCheckSchema } from '@/server/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const input = signupLoginIdCheckSchema.parse(await request.json())
    return ok(await checkSignupLoginId(input))
  } catch (error) {
    return toHttpError(error)
  }
}
