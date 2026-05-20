import { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { getSql } from '@/server/db'
import { getDatabaseUrl } from '@/server/env'

const uuidSchema = z.string().uuid()
const sessionCookieName = 'manwon_session'
const legacyUserCookieName = 'manwon_user_id'
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30

export interface AuthSession {
  accessToken: string
  expiresAt: number
  expiresIn: number
}

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET || process.env.OTP_HASH_SECRET || getDatabaseUrl()
}

function signSessionPayload(userId: string, expiresAt: number) {
  return createHmac('sha256', getSessionSecret()).update(`${userId}.${expiresAt}`).digest('base64url')
}

function createSessionToken(userId: string, expiresAt = Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds) {
  const signature = signSessionPayload(userId, expiresAt)
  return `${userId}.${expiresAt}.${signature}`
}

function verifySessionToken(token: string | undefined) {
  if (!token) return null
  const [userId, expiresAtValue, signature] = token.split('.')
  if (!uuidSchema.safeParse(userId).success || !expiresAtValue || !signature) return null

  const expiresAt = Number(expiresAtValue)
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return null

  const expected = signSessionPayload(userId, expiresAt)
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (signatureBuffer.length !== expectedBuffer.length) return null
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null

  return userId
}

export function getRequestUserId(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  if (authorization?.startsWith('Bearer ')) {
    const bearerUserId = verifySessionToken(authorization.slice('Bearer '.length).trim())
    if (bearerUserId) return bearerUserId
  }

  const sessionUserId = verifySessionToken(request.cookies.get(sessionCookieName)?.value)
  if (sessionUserId) return sessionUserId

  return null
}

export async function requireUser(request: NextRequest) {
  const userId = getRequestUserId(request)
  if (!userId) throw new Error('UNAUTHORIZED')

  await ensureProfile(userId, getHeaderNickname(request))
  const sql = getSql()
  const [profile] = await sql`
    select withdrawn_at
    from manwon_happiness.profiles
    where id = ${userId}
    limit 1
  `
  if (profile?.withdrawnAt) throw new Error('UNAUTHORIZED')
  return userId
}

export function getHeaderNickname(request: NextRequest) {
  const value = request.headers.get('x-manwon-nickname')
  if (!value) return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export async function ensureProfile(userId: string, nickname = '만부탁이') {
  const sql = getSql()
  await sql`
    insert into manwon_happiness.profiles (id, nickname)
    values (${userId}, ${nickname})
    on conflict (id) do update
      set nickname = coalesce(manwon_happiness.profiles.nickname, excluded.nickname)
  `
}

export function setAuthCookies(response: NextResponse, userId: string) {
  const cookieOptions = {
    httpOnly: true,
    maxAge: sessionMaxAgeSeconds,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  }

  response.cookies.set(sessionCookieName, createSessionToken(userId), cookieOptions)
  response.cookies.set(legacyUserCookieName, userId, cookieOptions)
}

export function createAuthSession(userId: string): AuthSession {
  const expiresAt = Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds
  return {
    accessToken: createSessionToken(userId, expiresAt),
    expiresAt,
    expiresIn: sessionMaxAgeSeconds,
  }
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(sessionCookieName, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  response.cookies.set(legacyUserCookieName, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
}
