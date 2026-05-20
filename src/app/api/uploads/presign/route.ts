import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { createPresignedImageUpload } from '@/server/s3'
import { presignUploadSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = presignUploadSchema.parse(await request.json())
    const upload = await createPresignedImageUpload({ userId, ...input })
    return ok(upload)
  } catch (error) {
    return toHttpError(error)
  }
}
