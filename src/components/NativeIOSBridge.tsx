'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    __manwonNativeBridgeInstalled?: boolean
    webkit?: {
      messageHandlers?: {
        manwonNative?: {
          postMessage: (payload: {
            type: string
            path?: string
            isAtTop?: boolean
            permission?: 'push' | 'location'
            context?: IOSPushPromptContext
            unreadCount?: number
            isPresented?: boolean
          }) => void
        }
      }
    }
    ManwonNative?: {
      postMessage?: (payload: string) => void
    }
  }
}

export type IOSPushPromptContext = 'post_created' | 'conversation_started' | 'chat_entered' | 'unread_messages' | 'deal_action'

function isManwonIOS() {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('ManwonIOS')
}

export function isNativeAppShell() {
  if (typeof window === 'undefined') return false
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  return userAgent.includes('ManwonIOS')
    || userAgent.includes('ManwonIOS')
    || Boolean(window.webkit?.messageHandlers?.manwonNative)
    || Boolean(window.ManwonNative?.postMessage)
}

function postNativeMessage(payload: {
  type: string
  path?: string
  isAtTop?: boolean
  permission?: 'push' | 'location'
  context?: IOSPushPromptContext
  unreadCount?: number
  isPresented?: boolean
}) {
  window.webkit?.messageHandlers?.manwonNative?.postMessage(payload)
  return Boolean(window.webkit?.messageHandlers?.manwonNative)
}

export function setNativeOverlayState(isPresented: boolean) {
  if (typeof window === 'undefined' || !isManwonIOS()) return false
  return postNativeMessage({
    type: 'overlayState',
    isPresented,
  })
}

export function requestIOSPushPermission(context: IOSPushPromptContext, metadata?: { unreadCount?: number }) {
  if (typeof window === 'undefined' || !isManwonIOS()) return false
  return postNativeMessage({
    type: 'permissionPrompt',
    permission: 'push',
    context,
    unreadCount: metadata?.unreadCount,
    path: routePathFromUrl(),
  })
}

export function openIOSAppSettings() {
  if (typeof window === 'undefined' || !isManwonIOS()) return false
  return postNativeMessage({
    type: 'openSettings',
    path: routePathFromUrl(),
  })
}

export function notifyNativeProfileOnboardingCompleted() {
  if (typeof window === 'undefined') return false
  const payload = { type: 'profileOnboardingCompleted', path: routePathFromUrl() }
  const postedIOS = postNativeMessage(payload)
  const androidBridge = window.ManwonNative?.postMessage
  if (typeof androidBridge === 'function') {
    androidBridge(JSON.stringify(payload))
    return true
  }
  return postedIOS
}

function isNativeRoute(path: string) {
  return path === '/chat' || path.startsWith('/chat/') || path === '/nearby' || path.startsWith('/nearby/')
}

function postNativeRoute(rawUrl: string) {
  try {
    const target = new URL(rawUrl, window.location.origin)
    if (`${target.pathname}${target.search}` === routePathFromUrl()) return false
    if (!isNativeRoute(target.pathname)) return false
    postNativeMessage({
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
  postNativeMessage({
    type: 'webRoute',
    path: routePathFromUrl(rawUrl),
  })
}

function postHomeScrollTop(isAtTop: boolean) {
  postNativeMessage({
    type: 'homeScrollTop',
    path: routePathFromUrl(),
    isAtTop,
  })
}

export function NativeIOSBridge() {
  useEffect(() => {
    if (!isManwonIOS()) return

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
