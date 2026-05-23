import { createPublicKey, createVerify } from 'crypto'
import { getSql } from '@/server/db'
import { HttpError } from '@/server/http'

const schema = 'manwon_happiness'
const appleIssuer = 'https://appleid.apple.com'
const appleJwksUrl = 'https://appleid.apple.com/auth/keys'
const defaultAppleAudience = 'com.manwon.app'
const jwksCacheTtlMs = 60 * 60 * 1000

interface AppleJwk {
  kty: string
  kid: string
  use?: string
  alg?: string
  n: string
  e: string
}

interface AppleJwksResponse {
  keys?: AppleJwk[]
}

interface AppleJwtHeader {
  alg?: string
  kid?: string
}

interface AppleIdentityPayload {
  iss?: string
  aud?: string | string[]
  exp?: number
  iat?: number
  sub?: string
  email?: string
  email_verified?: boolean | string
  is_private_email?: boolean | string
}

export interface AppleProfile {
  appleId: string
  email: string | null
  fullName: string | null
  emailVerified: boolean | null
  isPrivateEmail: boolean | null
}

let jwksCache: { keys: AppleJwk[]; fetchedAt: number } | null = null

function decodeJwtPart<T>(value: string): T {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T
  } catch {
    throw new HttpError('Apple 인증 토큰을 읽지 못했습니다.', 400)
  }
}

function parseAppleBoolean(value: boolean | string | undefined) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function getAppleAudiences() {
  const values = [
    process.env.APPLE_CLIENT_ID,
    process.env.APPLE_BUNDLE_ID,
    process.env.IOS_BUNDLE_ID,
    defaultAppleAudience,
  ]
  return new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])
}

function audienceMatches(audience: string | string[] | undefined) {
  const allowed = getAppleAudiences()
  if (typeof audience === 'string') return allowed.has(audience)
  if (Array.isArray(audience)) return audience.some((value) => allowed.has(value))
  return false
}

async function getApplePublicKeys() {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < jwksCacheTtlMs) {
    return jwksCache.keys
  }

  const response = await fetch(appleJwksUrl, { cache: 'no-store' })
  if (!response.ok) throw new HttpError('Apple 공개키를 가져오지 못했습니다.', 502)
  const jwks = await response.json() as AppleJwksResponse
  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
    throw new HttpError('Apple 공개키 응답이 비어 있습니다.', 502)
  }

  jwksCache = { keys: jwks.keys, fetchedAt: Date.now() }
  return jwks.keys
}

async function verifyAppleIdentityToken(identityToken: string) {
  const parts = identityToken.split('.')
  if (parts.length !== 3) throw new HttpError('Apple 인증 토큰 형식이 올바르지 않습니다.', 400)

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const header = decodeJwtPart<AppleJwtHeader>(encodedHeader)
  const payload = decodeJwtPart<AppleIdentityPayload>(encodedPayload)

  if (header.alg !== 'RS256' || !header.kid) {
    throw new HttpError('Apple 인증 토큰 서명 정보를 확인할 수 없습니다.', 400)
  }

  const keys = await getApplePublicKeys()
  const jwk = keys.find((key) => key.kid === header.kid)
  if (!jwk) throw new HttpError('Apple 인증 토큰 공개키를 찾지 못했습니다.', 502)

  const publicKey = createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' })
  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${encodedHeader}.${encodedPayload}`)
  verifier.end()
  const signatureValid = verifier.verify(publicKey, Buffer.from(encodedSignature, 'base64url'))
  if (!signatureValid) throw new HttpError('Apple 인증 토큰 서명이 올바르지 않습니다.', 401)

  const now = Math.floor(Date.now() / 1000)
  if (payload.iss !== appleIssuer) throw new HttpError('Apple 인증 토큰 발급자가 올바르지 않습니다.', 401)
  if (!audienceMatches(payload.aud)) throw new HttpError('Apple 인증 대상 앱이 올바르지 않습니다.', 401)
  if (!payload.exp || payload.exp < now - 60) throw new HttpError('Apple 인증 토큰이 만료되었습니다.', 401)
  if (!payload.sub) throw new HttpError('Apple 계정 식별값이 없습니다.', 401)

  return payload
}

function normalizedFullName(value: string | null | undefined) {
  const fullName = value?.trim().replace(/\s+/g, ' ')
  return fullName || null
}

function fallbackDisplayName(profile: AppleProfile) {
  return profile.fullName || `Apple 사용자 ${profile.appleId.slice(-4)}`
}

export async function getAppleProfile(input: {
  identityToken: string
  fullName?: string | null
}): Promise<AppleProfile> {
  const token = await verifyAppleIdentityToken(input.identityToken)
  const email = typeof token.email === 'string' && token.email.trim() ? token.email.trim() : null

  return {
    appleId: token.sub as string,
    email,
    fullName: normalizedFullName(input.fullName),
    emailVerified: parseAppleBoolean(token.email_verified),
    isPrivateEmail: parseAppleBoolean(token.is_private_email),
  }
}

export async function signInWithApple(profile: AppleProfile) {
  if (!profile.appleId) throw new HttpError('Apple 계정 정보를 확인할 수 없습니다.', 400)

  const sql = getSql()
  const displayName = fallbackDisplayName(profile)

  const [user] = await sql`
    insert into ${sql(schema)}.users (
      apple_id,
      apple_email,
      apple_full_name,
      apple_email_verified,
      apple_is_private_email,
      nickname,
      display_name,
      phone_verified,
      phone_verified_at,
      last_login_at
    )
    values (
      ${profile.appleId},
      ${profile.email},
      ${profile.fullName},
      ${profile.emailVerified},
      ${profile.isPrivateEmail},
      ${displayName},
      ${displayName},
      false,
      null,
      now()
    )
    on conflict (apple_id) where apple_id is not null and withdrawn_at is null do update
    set apple_email = coalesce(excluded.apple_email, ${sql(schema)}.users.apple_email),
        apple_full_name = coalesce(${sql(schema)}.users.apple_full_name, excluded.apple_full_name),
        apple_email_verified = coalesce(excluded.apple_email_verified, ${sql(schema)}.users.apple_email_verified),
        apple_is_private_email = coalesce(excluded.apple_is_private_email, ${sql(schema)}.users.apple_is_private_email),
        nickname = case
          when ${sql(schema)}.users.profile_onboarding_completed then ${sql(schema)}.users.nickname
          else coalesce(excluded.apple_full_name, ${sql(schema)}.users.apple_full_name, ${sql(schema)}.users.nickname)
        end,
        display_name = case
          when ${sql(schema)}.users.profile_onboarding_completed then ${sql(schema)}.users.display_name
          else coalesce(excluded.display_name, ${sql(schema)}.users.display_name)
        end,
        last_login_at = now(),
        updated_at = now()
    returning *
  `

  if (!user) throw new HttpError('Apple 로그인 처리에 실패했습니다.', 500)
  return user
}
