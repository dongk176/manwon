import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getS3Env } from '@/server/env'

const allowedContentTypes = ['image/jpeg', 'image/png', 'image/webp'] as const
const maxImageSizeBytes = 5 * 1024 * 1024

let s3Client: S3Client | null = null

function getS3Client() {
  if (!s3Client) {
    const env = getS3Env()
    s3Client = new S3Client({
      region: env.region,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
    })
  }

  return s3Client
}

export type UploadTarget = 'task-post' | 'profile-avatar' | 'chat-message'

export function assertImageUpload(input: { fileName: string; contentType: string; size: number }) {
  if (!allowedContentTypes.includes(input.contentType as (typeof allowedContentTypes)[number])) {
    throw new Error('jpg, jpeg, png, webp 이미지만 업로드할 수 있습니다.')
  }

  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > maxImageSizeBytes) {
    throw new Error('이미지 파일은 5MB 이하만 업로드할 수 있습니다.')
  }

  const extension = input.fileName.split('.').pop()?.toLowerCase()
  if (!extension || !['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
    throw new Error('허용되지 않는 파일 확장자입니다.')
  }

  return extension === 'jpeg' ? 'jpg' : extension
}

export async function createPresignedImageUpload(input: {
  userId: string
  target: UploadTarget
  fileName: string
  contentType: string
  size: number
}) {
  const extension = assertImageUpload(input)
  const env = getS3Env()
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const storageKey = `manwon/${input.target}/${input.userId}/${yyyy}${mm}/${crypto.randomUUID()}.${extension}`

  const command = new PutObjectCommand({
    Bucket: env.bucket,
    Key: storageKey,
    ContentType: input.contentType,
    ContentLength: input.size,
  })

  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 60 * 5 })
  const publicUrl = env.publicBaseUrl
    ? `${env.publicBaseUrl.replace(/\/$/, '')}/${storageKey}`
    : `https://${env.bucket}.s3.${env.region}.amazonaws.com/${storageKey}`

  return {
    uploadUrl,
    publicUrl,
    storageKey,
    expiresIn: 300,
  }
}

export async function uploadImageToStorage(input: {
  userId: string
  target: UploadTarget
  fileName: string
  contentType: string
  size: number
  body: Uint8Array
}) {
  const extension = assertImageUpload(input)
  const env = getS3Env()
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const storageKey = `manwon/${input.target}/${input.userId}/${yyyy}${mm}/${crypto.randomUUID()}.${extension}`

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: env.bucket,
      Key: storageKey,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.size,
    }),
  )

  const publicUrl = env.publicBaseUrl
    ? `${env.publicBaseUrl.replace(/\/$/, '')}/${storageKey}`
    : `https://${env.bucket}.s3.${env.region}.amazonaws.com/${storageKey}`

  return {
    imageUrl: publicUrl,
    storageKey,
  }
}

export async function getImageFromStorage(storageKey: string) {
  const env = getS3Env()
  const output = await getS3Client().send(
    new GetObjectCommand({
      Bucket: env.bucket,
      Key: storageKey,
    }),
  )

  if (!output.Body) {
    throw new Error('이미지를 찾을 수 없습니다.')
  }

  return {
    body: await output.Body.transformToByteArray(),
    contentType: output.ContentType ?? 'application/octet-stream',
    contentLength: output.ContentLength,
  }
}
