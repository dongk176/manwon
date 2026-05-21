'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    __manwonNativeBridgeInstalled?: boolean
    webkit?: {
      messageHandlers?: {
        manwonNative?: {
          postMessage: (payload: { type: string; path?: string; isAtTop?: boolean }) => void
        }
      }
    }
  }
}

function isNativeRoute(path: string) {
  return path === '/chat' || path.startsWith('/chat/') || path === '/nearby' || path.startsWith('/nearby/')
}

function postNativeRoute(rawUrl: string) {
  try {
    const target = new URL(rawUrl, window.location.origin)
    if (!isNativeRoute(target.pathname)) return false
    window.webkit?.messageHandlers?.manwonNative?.postMessage({
      type: 'route',
      path: `${target.pathname}${target.search}`,
    })
    return Boolean(window.webkit?.messageHandlers?.manwonNative)
  } catch {
    return false
  }
}

function routePathFromUrl(rawUrl?: string | URL | null) {
  if (!rawUrl) return `${window.location.pathname}${window.location.search}`

  try {
    const target = new URL(rawUrl.toString(), window.location.origin)
    return `${target.pathname}${target.search}`
  } catch {
    return `${window.location.pathname}${window.location.search}`
  }
}

function postWebRoute(rawUrl?: string | URL | null) {
  window.webkit?.messageHandlers?.manwonNative?.postMessage({
    type: 'webRoute',
    path: routePathFromUrl(rawUrl),
  })
}

function postHomeScrollTop(isAtTop: boolean) {
  window.webkit?.messageHandlers?.manwonNative?.postMessage({
    type: 'homeScrollTop',
    path: routePathFromUrl(),
    isAtTop,
  })
}

export function NativeIOSBridge() {
  useEffect(() => {
    if (!navigator.userAgent.includes('ManwonIOS')) return

    document.documentElement.classList.add('native-ios-shell')
    document.body.classList.add('native-ios-shell')

    if (window.__manwonNativeBridgeInstalled) return
    window.__manwonNativeBridgeInstalled = true
    postWebRoute()

    let scrollTarget: Element | Document | null = null
    let lastIsAtTop: boolean | null = null
    let frame = 0

    const currentHomeScroller = () =>
      document.querySelector('.home-feed-scroll') ?? document.scrollingElement ?? document.documentElement

    const readHomeScrollTop = () => {
      const target = scrollTarget ?? currentHomeScroller()
      const scrollTop = target instanceof Element ? target.scrollTop : 0
      const isAtTop = scrollTop <= 12
      if (lastIsAtTop === isAtTop) return
      lastIsAtTop = isAtTop
      postHomeScrollTop(isAtTop)
    }

    const scheduleHomeScrollTop = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        readHomeScrollTop()
      })
    }

    const bindHomeScroller = () => {
      const nextTarget = currentHomeScroller()
      if (scrollTarget !== nextTarget) {
        scrollTarget?.removeEventListener('scroll', scheduleHomeScrollTop)
        scrollTarget = nextTarget
        scrollTarget.addEventListener('scroll', scheduleHomeScrollTop, { passive: true })
      }
      scheduleHomeScrollTop()
    }

    const observer = new MutationObserver(bindHomeScroller)
    observer.observe(document.body, { childList: true, subtree: true })
    bindHomeScroller()

    const originalPushState = window.history.pushState
    const originalReplaceState = window.history.replaceState

    window.history.pushState = function pushState(state, title, url) {
      if (url != null && postNativeRoute(url.toString())) return
      const result = originalPushState.apply(this, [state, title, url])
      postWebRoute(url)
      window.setTimeout(bindHomeScroller, 0)
      return result
    }

    window.history.replaceState = function replaceState(state, title, url) {
      if (url != null && postNativeRoute(url.toString())) return
      const result = originalReplaceState.apply(this, [state, title, url])
      postWebRoute(url)
      window.setTimeout(bindHomeScroller, 0)
      return result
    }

    const handlePopState = () => {
      window.setTimeout(() => {
        postWebRoute()
        bindHomeScroller()
      }, 0)
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest<HTMLAnchorElement>('a[href]')
      if (!anchor) return
      if (!postNativeRoute(anchor.href)) return
      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('popstate', handlePopState)
    document.addEventListener('click', handleClick, true)

    return () => {
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
      observer.disconnect()
      scrollTarget?.removeEventListener('scroll', scheduleHomeScrollTop)
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('popstate', handlePopState)
      document.removeEventListener('click', handleClick, true)
    }
  }, [])

  return null
}
