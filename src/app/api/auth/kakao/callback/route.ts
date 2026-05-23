import { NextRequest, NextResponse } from 'next/server'
import { setAuthCookies } from '@/server/auth'
import { HttpError } from '@/server/http'
import { getKakaoProfile, signInWithKakao } from '@/server/kakaoAuth'
import { getAppOrigin, getKakaoRedirectUri } from '@/server/kakaoOAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const kakaoStateCookieName = 'manwon_kakao_oauth_state'
const kakaoNextCookieName = 'manwon_kakao_oauth_next'

interface KakaoTokenResponse {
  access_token?: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  refresh_token_expires_in?: number
  scope?: string
}

function normalizeNextPath(value: string | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

function clearOAuthCookies(response: NextResponse) {
  const cookieOptions = {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  }

  response.cookies.set(kakaoStateCookieName, '', cookieOptions)
  response.cookies.set(kakaoNextCookieName, '', cookieOptions)
}

function redirectToLogin(request: NextRequest, nextPath: string) {
  const loginUrl = new URL('/login', getAppOrigin(request))
  if (nextPath !== '/') loginUrl.searchParams.set('next', nextPath)
  loginUrl.searchParams.set('oauth_error', 'kakao')
  const response = NextResponse.redirect(loginUrl)
  clearOAuthCookies(response)
  return response
}

async function exchangeCodeForToken(request: NextRequest, code: string) {
  const restApiKey = process.env.KAKAO_REST_API_KEY
  if (!restApiKey) throw new HttpError('KAKAO_REST_API_KEY가 설정되어 있지 않습니다.', 500)

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: restApiKey,
    redirect_uri: getKakaoRedirectUri(request),
    code,
  })
  if (process.env.KAKAO_CLIENT_SECRET) {
    body.set('client_secret', process.env.KAKAO_CLIENT_SECRET)
  }

  const response = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body,
    cache: 'no-store',
  })

  if (!response.ok) throw new HttpError('카카오 인증 토큰을 발급받지 못했습니다.', 502)
  const token = await response.json() as KakaoTokenResponse
  if (!token.access_token) throw new HttpError('카카오 인증 토큰이 비어 있습니다.', 502)
  return token.access_token
}

function isProfileOnboardingCompleted(profile: Record<string, unknown>) {
  return profile.profileOnboardingCompleted === true
}

export async function GET(request: NextRequest) {
  const nextPath = normalizeNextPath(request.cookies.get(kakaoNextCookieName)?.value)

  try {
    const expectedState = request.cookies.get(kakaoStateCookieName)?.value
    const state = request.nextUrl.searchParams.get('state')
    const code = request.nextUrl.searchParams.get('code')
    const error = request.nextUrl.searchParams.get('error')

    if (error) throw new HttpError('카카오 로그인이 취소되었습니다.', 400)
    if (!expectedState || !state || expectedState !== state) throw new HttpError('카카오 로그인 요청이 만료되었습니다.', 400)
    if (!code) throw new HttpError('카카오 인증 코드가 없습니다.', 400)

    const accessToken = await exchangeCodeForToken(request, code)
    const profile = await getKakaoProfile(accessToken)
    const user = await signInWithKakao(profile)
    const destinationPath = isProfileOnboardingCompleted(user) ? nextPath : '/profile-onboarding'
    const response = NextResponse.redirect(new URL(destinationPath, getAppOrigin(request)))
    setAuthCookies(response, String(user.id))
    clearOAuthCookies(response)
    return response
  } catch {
    return redirectToLogin(request, nextPath)
  }
}
