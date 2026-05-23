import { NextRequest } from 'next/server'
import { HttpError } from '@/server/http'

const productionAppOrigin = 'https://manwonmvp.vercel.app'
const callbackPath = '/api/auth/kakao/callback'

function isProductionOAuth() {
  return process.env.VERCEL_ENV ? process.env.VERCEL_ENV === 'production' : process.env.NODE_ENV === 'production'
}

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value)
    return url.origin
  } catch {
    return null
  }
}

function isLocalhost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

export function getAppOrigin(request: NextRequest) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const normalizedConfiguredOrigin = configuredOrigin ? normalizeOrigin(configuredOrigin) : null

  if (isProductionOAuth()) {
    const productionUrl = new URL(productionAppOrigin)
    if (normalizedConfiguredOrigin) {
      const configuredUrl = new URL(normalizedConfiguredOrigin)
      if (!isLocalhost(configuredUrl.hostname) && configuredUrl.host === productionUrl.host) return normalizedConfiguredOrigin
    }
    return productionAppOrigin
  }

  return normalizedConfiguredOrigin ?? request.nextUrl.origin
}

export function getKakaoRedirectUri(request: NextRequest) {
  const appOrigin = getAppOrigin(request)
  const fallbackRedirectUri = `${appOrigin}${callbackPath}`
  const configuredRedirectUri = process.env.KAKAO_REDIRECT_URI?.trim()

  if (!configuredRedirectUri) return fallbackRedirectUri

  let configuredUrl: URL
  try {
    configuredUrl = new URL(configuredRedirectUri)
  } catch {
    throw new HttpError('KAKAO_REDIRECT_URI 형식이 올바르지 않습니다.', 500)
  }

  if (isProductionOAuth()) {
    const appUrl = new URL(appOrigin)
    if (isLocalhost(configuredUrl.hostname) || configuredUrl.host !== appUrl.host || configuredUrl.pathname !== callbackPath) {
      return fallbackRedirectUri
    }
  }

  return configuredUrl.toString()
}
