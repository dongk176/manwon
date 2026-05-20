'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { BottomNav } from '@/components/ui/Common'
import { fetchAuthSession } from '@/lib/manwonApi'

function useOverlayScrollLock() {
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
      if (document.querySelector('.sheet-overlay, .modal-overlay')) {
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
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hideBottomNav = pathname.startsWith('/chat/') || pathname.startsWith('/posts/') || pathname === '/register/request' || pathname === '/register/offer'

  useOverlayScrollLock()

  useEffect(() => {
    void fetchAuthSession().catch(() => {
      // Anonymous/local users can keep browsing public screens.
    })
  }, [])

  return (
    <main className="app-shell">
      <div className="app-content">{children}</div>
      {!hideBottomNav && <BottomNav />}
    </main>
  )
}
