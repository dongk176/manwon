'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BottomNav } from '@/components/ui/Common'
import { isManwonIOS } from '@/components/NativeIOSBridge'
import { fetchAuthSession, fetchDueReviewReminder } from '@/lib/manwonApi'

type AppGateState =
  | { status: 'checking'; onboardingCompleted: null }
  | { status: 'anonymous'; onboardingCompleted: null }
  | { status: 'allowed'; onboardingCompleted: boolean }
  | { status: 'redirecting'; onboardingCompleted: boolean | null }

function isProfileOnboardingCompleted(profile: Record<string, unknown> | null | undefined) {
  return profile?.profileOnboardingCompleted === true
}

function isPublicAppPath(pathname: string) {
  return pathname === '/' || pathname.startsWith('/posts/')
}

function isProfileOnboardingPath(pathname: string) {
  return pathname === '/profile-onboarding'
}

function useOverlayScrollLock() {
  const [overlayVisible, setOverlayVisible] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    const previous = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      rootOverscroll: root.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    }
    let locked = false

    const lock = () => {
      if (locked) return
      locked = true
      root.style.overflow = 'hidden'
      body.style.overflow = 'hidden'
      root.style.overscrollBehavior = 'none'
      body.style.overscrollBehavior = 'none'
    }

    const unlock = () => {
      if (!locked) return
      locked = false
      root.style.overflow = previous.rootOverflow
      body.style.overflow = previous.bodyOverflow
      root.style.overscrollBehavior = previous.rootOverscroll
      body.style.overscrollBehavior = previous.bodyOverscroll
    }

    const sync = () => {
      const hasOverlay = Boolean(document.querySelector('.sheet-overlay, .modal-overlay'))
      setOverlayVisible(hasOverlay)

      if (hasOverlay) {
        lock()
        return
      }
      unlock()
    }

    const observer = new MutationObserver(sync)
    observer.observe(body, { childList: true, subtree: true })
    sync()

    return () => {
      observer.disconnect()
      unlock()
    }
  }, [])

  return overlayVisible
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const overlayVisible = useOverlayScrollLock()
  const [gateState, setGateState] = useState<AppGateState>({ status: 'checking', onboardingCompleted: null })
  const publicPath = isPublicAppPath(pathname)
  const profileOnboardingPath = isProfileOnboardingPath(pathname)
  const contentAllowed =
    publicPath ||
    (gateState.status === 'allowed' &&
      (gateState.onboardingCompleted ? !profileOnboardingPath : profileOnboardingPath))
  const onboardingCompleted = gateState.status === 'allowed' ? gateState.onboardingCompleted : false
  const hideBottomNav =
    !contentAllowed ||
    overlayVisible ||
    pathname.startsWith('/chat/') ||
    pathname.startsWith('/posts/') ||
    pathname.startsWith('/nearby/') ||
    pathname.startsWith('/my/profiles') ||
    pathname === '/profile-onboarding' ||
    pathname === '/register/request' ||
    pathname === '/register/offer'

  useEffect(() => {
    let cancelled = false

    function redirectToLogin() {
      const queryString = typeof window === 'undefined' ? '' : window.location.search.replace(/^\?/, '')
      const nextPath = queryString ? `${pathname}?${queryString}` : pathname
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`)
    }

    void fetchAuthSession()
      .then((session) => {
        if (cancelled) return

        if (!session.authenticated) {
          setGateState({ status: 'anonymous', onboardingCompleted: null })
          if (!publicPath) redirectToLogin()
          return
        }

        const nextOnboardingCompleted = isProfileOnboardingCompleted(session.profile)

        if (!nextOnboardingCompleted && !publicPath && !profileOnboardingPath) {
          setGateState({ status: 'redirecting', onboardingCompleted: false })
          router.replace('/profile-onboarding')
          return
        }

        if (nextOnboardingCompleted && profileOnboardingPath) {
          setGateState({ status: 'redirecting', onboardingCompleted: true })
          router.replace('/')
          return
        }

        setGateState({ status: 'allowed', onboardingCompleted: nextOnboardingCompleted })
      })
      .catch(() => {
        if (cancelled) return
        setGateState({ status: 'anonymous', onboardingCompleted: null })
        if (!publicPath) redirectToLogin()
      })

    return () => {
      cancelled = true
    }
  }, [pathname, profileOnboardingPath, publicPath, router])

  useEffect(() => {
    if (!contentAllowed || !onboardingCompleted) return
    if (isManwonIOS()) return
    if (pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/chat/') || pathname === '/profile-onboarding') return

    let cancelled = false
    void fetchAuthSession()
      .then((session) => {
        if (cancelled || !session.authenticated || !isProfileOnboardingCompleted(session.profile)) return null
        return fetchDueReviewReminder()
      })
      .then((reminder) => {
        if (cancelled || !reminder?.conversationId) return
        router.push(`/chat/${encodeURIComponent(reminder.conversationId)}`)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [contentAllowed, onboardingCompleted, pathname, router])

  return (
    <main className="app-shell">
      <div className="app-content">{contentAllowed ? children : null}</div>
      {!hideBottomNav && <BottomNav />}
    </main>
  )
}
