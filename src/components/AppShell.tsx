'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BottomNav } from '@/components/ui/Common'
import { fetchAuthSession } from '@/lib/manwonApi'

type AppGateState =
  | { status: 'checking'; onboardingCompleted: null; legalAgreementsCompleted: null }
  | { status: 'anonymous'; onboardingCompleted: null; legalAgreementsCompleted: null }
  | { status: 'allowed'; onboardingCompleted: boolean; legalAgreementsCompleted: boolean }
  | { status: 'redirecting'; onboardingCompleted: boolean | null; legalAgreementsCompleted: boolean | null }

function isProfileOnboardingCompleted(profile: Record<string, unknown> | null | undefined) {
  return profile?.profileOnboardingCompleted === true
}

function hasRequiredLegalAgreements(profile: Record<string, unknown> | null | undefined) {
  return Boolean(profile?.termsAgreedAt && profile?.privacyAgreedAt)
}

function isPublicAppPath(pathname: string) {
  return pathname === '/' || pathname.startsWith('/posts/')
}

function isProfileOnboardingPath(pathname: string) {
  return pathname === '/profile-onboarding'
}

function isTermsConsentPath(pathname: string) {
  return pathname === '/terms-consent'
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
  const [gateState, setGateState] = useState<AppGateState>({ status: 'checking', onboardingCompleted: null, legalAgreementsCompleted: null })
  const publicPath = isPublicAppPath(pathname)
  const profileOnboardingPath = isProfileOnboardingPath(pathname)
  const termsConsentPath = isTermsConsentPath(pathname)
  const contentAllowed =
    publicPath ||
    (gateState.status === 'allowed' &&
      (gateState.legalAgreementsCompleted
        ? gateState.onboardingCompleted
          ? !profileOnboardingPath && !termsConsentPath
          : profileOnboardingPath
        : termsConsentPath))
  const hideBottomNav =
    !contentAllowed ||
    overlayVisible ||
    pathname.startsWith('/chat/') ||
    pathname.startsWith('/posts/') ||
    pathname.startsWith('/nearby/') ||
    pathname.startsWith('/my/profiles') ||
    pathname === '/profile-onboarding' ||
    pathname === '/terms-consent' ||
    pathname === '/register/request' ||
    pathname === '/register/offer'

  useEffect(() => {
    let cancelled = false

    function redirectToLogin() {
      const queryString = typeof window === 'undefined' ? '' : window.location.search.replace(/^\?/, '')
      const nextPath = queryString ? `${pathname}?${queryString}` : pathname
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`)
    }

    function redirectToTermsConsent() {
      const queryString = typeof window === 'undefined' ? '' : window.location.search.replace(/^\?/, '')
      const nextPath = queryString ? `${pathname}?${queryString}` : pathname
      const normalizedNextPath = nextPath === '/terms-consent' ? '/' : nextPath
      router.replace(`/terms-consent?next=${encodeURIComponent(normalizedNextPath)}`)
    }

    void fetchAuthSession()
      .then((session) => {
        if (cancelled) return

        if (!session.authenticated) {
          setGateState({ status: 'anonymous', onboardingCompleted: null, legalAgreementsCompleted: null })
          if (!publicPath) redirectToLogin()
          return
        }

        const nextOnboardingCompleted = isProfileOnboardingCompleted(session.profile)
        const nextLegalAgreementsCompleted = hasRequiredLegalAgreements(session.profile)

        if (!nextLegalAgreementsCompleted && !termsConsentPath) {
          setGateState({ status: 'redirecting', onboardingCompleted: nextOnboardingCompleted, legalAgreementsCompleted: false })
          redirectToTermsConsent()
          return
        }

        if (nextLegalAgreementsCompleted && termsConsentPath) {
          setGateState({ status: 'redirecting', onboardingCompleted: nextOnboardingCompleted, legalAgreementsCompleted: true })
          router.replace(nextOnboardingCompleted ? '/' : '/profile-onboarding')
          return
        }

        if (nextLegalAgreementsCompleted && !nextOnboardingCompleted && !publicPath && !profileOnboardingPath) {
          setGateState({ status: 'redirecting', onboardingCompleted: false, legalAgreementsCompleted: true })
          router.replace('/profile-onboarding')
          return
        }

        if (nextLegalAgreementsCompleted && nextOnboardingCompleted && profileOnboardingPath) {
          setGateState({ status: 'redirecting', onboardingCompleted: true, legalAgreementsCompleted: true })
          router.replace('/')
          return
        }

        setGateState({ status: 'allowed', onboardingCompleted: nextOnboardingCompleted, legalAgreementsCompleted: nextLegalAgreementsCompleted })
      })
      .catch(() => {
        if (cancelled) return
        setGateState({ status: 'anonymous', onboardingCompleted: null, legalAgreementsCompleted: null })
        if (!publicPath) redirectToLogin()
      })

    return () => {
      cancelled = true
    }
  }, [pathname, profileOnboardingPath, publicPath, router, termsConsentPath])

  return (
    <main className="app-shell">
      <div className="app-content">{contentAllowed ? children : null}</div>
      {!hideBottomNav && <BottomNav />}
    </main>
  )
}
