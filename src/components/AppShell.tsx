'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BottomNav } from '@/components/ui/Common'
import { fetchAuthSession, fetchDueReviewReminder } from '@/lib/manwonApi'

function isProfileOnboardingCompleted(profile: Record<string, unknown> | null | undefined) {
  return profile?.profileOnboardingCompleted === true
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
  const hideBottomNav =
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
    void fetchAuthSession()
      .then((session) => {
        if (cancelled) return

        if (!session.authenticated) {
          const queryString = typeof window === 'undefined' ? '' : window.location.search.replace(/^\?/, '')
          const nextPath = queryString ? `${pathname}?${queryString}` : pathname
          router.replace(`/login?next=${encodeURIComponent(nextPath)}`)
          return
        }

        const onboardingCompleted = isProfileOnboardingCompleted(session.profile)

        if (!onboardingCompleted && pathname !== '/profile-onboarding') {
          router.replace('/profile-onboarding')
          return
        }

        if (onboardingCompleted && pathname === '/profile-onboarding') {
          router.replace('/')
        }
      })
      .catch(() => {
        // Anonymous/local users can keep browsing public screens.
      })

    return () => {
      cancelled = true
    }
  }, [pathname, router])

  useEffect(() => {
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
  }, [pathname, router])

  return (
    <main className="app-shell">
      <div className="app-content">{children}</div>
      {!hideBottomNav && <BottomNav />}
    </main>
  )
}
