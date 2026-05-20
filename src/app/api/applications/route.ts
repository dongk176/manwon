import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { fail, ok, toHttpError } from '@/server/http'
import { createApplication } from '@/server/manwonService'
import { createApplicationSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = createApplicationSchema.parse(await request.json())
    const application = await createApplication(userId, input)
    if (!application) return fail('지원할 수 없는 게시글입니다.', 400)
    return ok(application, { status: 201 })
  } catch (error) {
    return toHttpError(error)
  }
}
