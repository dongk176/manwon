import { NextRequest, NextResponse } from 'next/server'

const sessionCookieName = 'manwon_session'
const publicPagePaths = ['/login', '/signup', '/support', '/profile-onboarding']

function isPublicPagePath(pathname: string) {
  return publicPagePaths.includes(pathname) || pathname === '/' || pathname.startsWith('/posts/') || pathname.startsWith('/terms/')
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next()
  }

  if (isPublicPagePath(pathname)) {
    return NextResponse.next()
  }

  if (!request.cookies.get(sessionCookieName)?.value) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!.*\\..*).*)'],
}
