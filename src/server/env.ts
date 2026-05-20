const requiredDatabaseEnv = ['DATABASE_URL'] as const
const requiredS3Env = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET'] as const
const requiredSolapiEnv = ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_SENDER_NUMBER'] as const
const requiredSupabaseRealtimeEnv = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_JWT_SECRET'] as const
const requiredFirebaseEnv = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL'] as const

export function getMissingDatabaseEnv() {
  return requiredDatabaseEnv.filter((key) => !process.env[key])
}

export function getMissingS3Env() {
  return requiredS3Env.filter((key) => !process.env[key])
}

export function getMissingSolapiEnv() {
  return requiredSolapiEnv.filter((key) => !process.env[key])
}

export function getMissingSupabaseRealtimeEnv() {
  return requiredSupabaseRealtimeEnv.filter((key) => !process.env[key])
}

export function getMissingFirebaseEnv() {
  const missing = requiredFirebaseEnv.filter((key) => !process.env[key])
  if (!process.env.FIREBASE_PRIVATE_KEY && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    missing.push('FIREBASE_PRIVATE_KEY' as (typeof requiredFirebaseEnv)[number])
  }
  return missing
}

export function getDatabaseUrl() {
  const missing = getMissingDatabaseEnv()
  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`)
  }

  return process.env.DATABASE_URL as string
}

export function getS3Env() {
  const missing = getMissingS3Env()
  if (missing.length > 0) {
    throw new Error(`Missing S3 environment variables: ${missing.join(', ')}`)
  }

  return {
    region: process.env.AWS_REGION as string,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
    bucket: process.env.S3_BUCKET as string,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? process.env.CLOUDFRONT_URL,
  }
}

export function getSolapiEnv() {
  const missing = getMissingSolapiEnv()
  if (missing.length > 0) {
    throw new Error(`Missing SOLAPI environment variables: ${missing.join(', ')}`)
  }

  return {
    apiKey: process.env.SOLAPI_API_KEY as string,
    apiSecret: process.env.SOLAPI_API_SECRET as string,
    senderNumber: (process.env.SOLAPI_SENDER_NUMBER as string).replace(/\D/g, ''),
  }
}

export function getSupabaseRealtimeEnv() {
  const missing = getMissingSupabaseRealtimeEnv()
  if (missing.length > 0) {
    throw new Error(`Missing Supabase Realtime environment variables: ${missing.join(', ')}`)
  }

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    jwtSecret: process.env.SUPABASE_JWT_SECRET as string,
  }
}

export function getFirebaseEnv() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson) as {
      project_id?: string
      client_email?: string
      private_key?: string
    }
    if (serviceAccount.project_id && serviceAccount.client_email && serviceAccount.private_key) {
      return {
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key,
      }
    }
  }

  const missing = getMissingFirebaseEnv()
  if (missing.length > 0) {
    throw new Error(`Missing Firebase environment variables: ${missing.join(', ')}`)
  }

  return {
    projectId: process.env.FIREBASE_PROJECT_ID as string,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL as string,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY as string).replace(/\\n/g, '\n'),
  }
}

export function getOtpEnv() {
  return {
    ttlSeconds: Number(process.env.OTP_TTL_SECONDS || 180),
    resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
    ipWindowSeconds: Number(process.env.OTP_IP_WINDOW_SECONDS || 600),
    ipMaxPerWindow: Number(process.env.OTP_IP_MAX_PER_WINDOW || 5),
    hashSecret: process.env.OTP_HASH_SECRET || process.env.SOLAPI_API_SECRET || getDatabaseUrl(),
  }
}

export function getKakaoMapKeyName() {
  if (process.env.NEXT_PUBLIC_KAKAO_MAP_KEY) return 'NEXT_PUBLIC_KAKAO_MAP_KEY'
  if (process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY) return 'NEXT_PUBLIC_KAKAO_MAP_JS_KEY'
  return null
}
