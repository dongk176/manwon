import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/auth'
import { HttpError, ok, toHttpError } from '@/server/http'
import { getImageFromStorage, uploadImageToStorage } from '@/server/s3'
import { presignUploadSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const storageKey = request.nextUrl.searchParams.get('key')?.trim()
    if (!isValidImageStorageKey(storageKey)) {
      throw new HttpError('이미지를 찾을 수 없습니다.', 400)
    }

    const image = await getImageFromStorage(storageKey)
    const headers = new Headers({
      'content-type': image.contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    })
    if (image.contentLength != null) headers.set('content-length', String(image.contentLength))

    return new NextResponse(new Blob([image.body as BlobPart], { type: image.contentType }), { headers })
  } catch (error) {
    return toHttpError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const formData = await request.formData()
    const file = formData.get('file')
    const target = formData.get('target')

    if (!(file instanceof File)) {
      throw new Error('업로드할 이미지 파일을 선택해주세요.')
    }

    const input = presignUploadSchema.parse({
      target,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    })
    const body = new Uint8Array(await file.arrayBuffer())
    return ok(await uploadImageToStorage({ userId, ...input, body }), { status: 201 })
  } catch (error) {
    return toHttpError(error)
  }
}

function isValidImageStorageKey(value: string | null | undefined): value is string {
  if (!value) return false
  if (!value.startsWith('manwon/')) return false
  if (value.includes('..')) return false
  return /\.(jpe?g|png|webp)$/i.test(value)
}
