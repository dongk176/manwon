import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { fail, toHttpError } from '@/server/http'
import { getKakaoRedirectUri } from '@/server/kakaoOAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const kakaoStateCookieName = 'manwon_kakao_oauth_state'
const kakaoNextCookieName = 'manwon_kakao_oauth_next'
const oauthCookieMaxAgeSeconds = 60 * 10

function normalizeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

function setOAuthCookies(response: NextResponse, state: string, nextPath: string) {
  const cookieOptions = {
    httpOnly: true,
    maxAge: oauthCookieMaxAgeSeconds,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  }

  response.cookies.set(kakaoStateCookieName, state, cookieOptions)
  response.cookies.set(kakaoNextCookieName, nextPath, cookieOptions)
}

export async function GET(request: NextRequest) {
  try {
    const restApiKey = process.env.KAKAO_REST_API_KEY
    if (!restApiKey) return fail('KAKAO_REST_API_KEY가 설정되어 있지 않습니다.', 500)

    const state = randomBytes(24).toString('base64url')
    const nextPath = normalizeNextPath(request.nextUrl.searchParams.get('next'))
    const authorizationUrl = new URL('https://kauth.kakao.com/oauth/authorize')
    authorizationUrl.searchParams.set('client_id', restApiKey)
    authorizationUrl.searchParams.set('redirect_uri', getKakaoRedirectUri(request))
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('state', state)
    authorizationUrl.searchParams.set('scope', 'profile_nickname,profile_image,account_email')

    const response = NextResponse.redirect(authorizationUrl)
    setOAuthCookies(response, state, nextPath)
    return response
  } catch (error) {
    return toHttpError(error)
  }
}
