'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { setNativeOverlayState } from '@/components/NativeIOSBridge'
import { PhoneVerificationOverlay } from '@/components/PhoneVerificationOverlay'
import { NeighborhoodSelectSheet } from '@/components/location/LocationSheets'
import { ActionGuideOverlay, AppHeader, BrandButton, ReportConfirmSheet, RequestCard } from '@/components/ui/Common'
import { type RequestPost } from '@/data/mockData'
import { createReport, fetchAuthSession, fetchMyPage, fetchTaskPosts, isPhoneVerificationRequired, mapApiPostToRequestPost, saveMyLocationPreference, type ApiTaskPost } from '@/lib/manwonApi'
import {
  formatRegionFull,
  formatRegionShort,
  getLocationPermissionState,
  getStoredLocationRegion,
  requestBrowserLocation,
  reverseGeocode,
  storeLocationRegion,
  toNeighborhoodRegion,
  type LocationPermissionState,
  type LocationRegion,
} from '@/lib/location'

type HomeMode = 'all' | 'ask' | 'offer'

const homeModeOptions: Array<{ value: HomeMode; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'ask', label: '해주세요' },
  { value: 'offer', label: '해줄게요' },
]
const refreshHoldHeight = 64
const refreshTriggerHeight = 58
const onboardingWelcomeStoragePrefix = 'manwon_onboarding_welcome_cta_shown'
const homeFeedRestoreStorageKey = 'manwon_home_feed_restore'
const homeFeedRestoreMaxAgeMs = 30 * 60 * 1000

interface HomeFeedRestoreState {
  mode: HomeMode
  scrollTop: number
  savedAt: number
}

export function HomeScreen({ showOnboardingWelcome = false }: { showOnboardingWelcome?: boolean }) {
  const router = useRouter()
  const [mode, setMode] = useState<HomeMode>('all')
  const [showRegionMenu, setShowRegionMenu] = useState(false)
  const [showModeMenu, setShowModeMenu] = useState(false)
  const [showNeighborhoodSheet, setShowNeighborhoodSheet] = useState(false)
  const [currentRegion, setCurrentRegion] = useState<LocationRegion | null>(null)
  const [permissionState, setPermissionState] = useState<LocationPermissionState>('unknown')
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [hasCheckedStoredRegion, setHasCheckedStoredRegion] = useState(false)
  const [dbPosts, setDbPosts] = useState<RequestPost[]>([])
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'fallback'>('idle')
  const [restoreReady, setRestoreReady] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [reportingPostId, setReportingPostId] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<RequestPost | null>(null)
  const [reportSheetError, setReportSheetError] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [reportError, setReportError] = useState(false)
  const [reportVerificationInput, setReportVerificationInput] = useState<{ reason: string; description: string } | null>(null)
  const [guideOverlay, setGuideOverlay] = useState<{ title: string; description: string; note: string } | null>(null)
  const [showWelcomeCta, setShowWelcomeCta] = useState(false)
  const welcomeStorageKeyRef = useRef(`${onboardingWelcomeStoragePrefix}:unknown`)
  const regionMenuRef = useRef<HTMLDivElement | null>(null)
  const modeMenuRef = useRef<HTMLDivElement | null>(null)
  const feedScrollRef = useRef<HTMLDivElement | null>(null)
  const loadRunRef = useRef(0)
  const pullStartYRef = useRef<number | null>(null)
  const pullDistanceRef = useRef(0)
  const pendingScrollRestoreRef = useRef<number | null>(null)
  const currentRegionLabel = formatRegionShort(currentRegion)
  const currentModeLabel = homeModeOptions.find((option) => option.value === mode)?.label ?? '전체'
  const refreshIndicatorHeight = isRefreshing ? refreshHoldHeight : pullDistance
  const isRefreshArmed = !isRefreshing && pullDistance >= refreshTriggerHeight
  const removeWelcomeQuery = useCallback(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (!url.searchParams.has('welcome')) return
    url.searchParams.delete('welcome')
    const nextPath = `${url.pathname}${url.search}${url.hash}` || '/'
    router.replace(nextPath)
  }, [router])

  useEffect(() => {
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      if (showOnboardingWelcome) {
        clearHomeFeedRestoreState()
        setRestoreReady(true)
        return
      }

      const restoreState = readHomeFeedRestoreState()
      if (restoreState) {
        setMode(restoreState.mode)
        pendingScrollRestoreRef.current = restoreState.scrollTop
      }
      setRestoreReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [showOnboardingWelcome])

  useEffect(() => {
    if (!restoreReady) return undefined

    let cancelled = false
    const runId = ++loadRunRef.current

    async function loadPosts() {
      setLoadState('loading')
      try {
        const posts = await fetchHomePosts(mode)
        if (cancelled || runId !== loadRunRef.current) return
        setDbPosts(posts)
        setLoadState('ready')
      } catch {
        if (cancelled || runId !== loadRunRef.current) return
        setDbPosts([])
        setLoadState('fallback')
      }
    }

    void loadPosts()

    return () => {
      cancelled = true
    }
  }, [mode, restoreReady])

  useEffect(() => {
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      setCurrentRegion(getStoredLocationRegion())
      setHasCheckedStoredRegion(true)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    getLocationPermissionState().then(setPermissionState).catch(() => setPermissionState('unknown'))
  }, [])

  useEffect(() => {
    if (!hasCheckedStoredRegion || currentRegion) return

    let cancelled = false

    fetchMyPage()
      .then((profile) => {
        if (!cancelled) setCurrentRegion(profileToLocationRegion(profile))
      })
      .catch(() => {
        if (!cancelled) setCurrentRegion(null)
      })

    return () => {
      cancelled = true
    }
  }, [currentRegion, hasCheckedStoredRegion])

  useEffect(() => {
    if (!showRegionMenu) return

    function closeOnOutside(event: Event) {
      const target = event.target
      if (target instanceof Node && !regionMenuRef.current?.contains(target)) {
        setShowRegionMenu(false)
      }
    }

    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('touchstart', closeOnOutside)

    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('touchstart', closeOnOutside)
    }
  }, [showRegionMenu])

  useEffect(() => {
    if (!showModeMenu) return

    function closeOnOutside(event: Event) {
      const target = event.target
      if (target instanceof Node && !modeMenuRef.current?.contains(target)) {
        setShowModeMenu(false)
      }
    }

    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('touchstart', closeOnOutside)

    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('touchstart', closeOnOutside)
    }
  }, [showModeMenu])

  useEffect(() => {
    setNativeOverlayState(Boolean(reportTarget || guideOverlay || showNeighborhoodSheet || showWelcomeCta))
    return () => {
      setNativeOverlayState(false)
    }
  }, [guideOverlay, reportTarget, showNeighborhoodSheet, showWelcomeCta])

  useEffect(() => {
    if (!showOnboardingWelcome) return

    let cancelled = false

    fetchAuthSession()
      .then((session) => {
        if (cancelled) return
        if (!session.authenticated) {
          removeWelcomeQuery()
          return
        }
        const storageKey = `${onboardingWelcomeStoragePrefix}:${session.userId ?? 'unknown'}`
        welcomeStorageKeyRef.current = storageKey
        try {
          if (window.localStorage.getItem(storageKey) === 'shown') {
            removeWelcomeQuery()
            return
          }
        } catch {
          // localStorage is optional for this one-time guide.
        }
        setShowWelcomeCta(true)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [removeWelcomeQuery, showOnboardingWelcome])

  async function refreshHomePosts() {
    if (isRefreshing || loadState === 'loading') return

    const runId = ++loadRunRef.current
    const startedAt = Date.now()
    setIsRefreshing(true)
    setPullDistance(refreshHoldHeight)
    pullDistanceRef.current = refreshHoldHeight

    try {
      const posts = await fetchHomePosts(mode)
      if (runId !== loadRunRef.current) return
      setDbPosts(posts)
      setLoadState('ready')
    } catch {
      if (runId !== loadRunRef.current) return
      setReportError(true)
      setReportMessage('새로고침에 실패했습니다.')
    } finally {
      const elapsed = Date.now() - startedAt
      if (elapsed < 1000) await sleep(1000 - elapsed)
      if (runId === loadRunRef.current) {
        setIsRefreshing(false)
        setPullDistance(0)
      }
    }
  }

  function handlePullStart(event: ReactTouchEvent<HTMLElement>) {
    if ((feedScrollRef.current?.scrollTop ?? 0) > 0 || isRefreshing || loadState === 'loading') return
    pullStartYRef.current = event.touches[0]?.clientY ?? null
    pullDistanceRef.current = 0
  }

  function handlePullMove(event: ReactTouchEvent<HTMLElement>) {
    if (pullStartYRef.current == null || isRefreshing || loadState === 'loading') return

    const currentY = event.touches[0]?.clientY
    if (currentY == null) return

    const distance = currentY - pullStartYRef.current
    if (distance <= 0) {
      pullDistanceRef.current = 0
      setPullDistance(0)
      return
    }

    if ((feedScrollRef.current?.scrollTop ?? 0) > 0) return

    const nextDistance = Math.min(distance * 0.5, refreshHoldHeight)
    pullDistanceRef.current = nextDistance
    setPullDistance(nextDistance)
    if (distance > 4) event.preventDefault()
  }

  function handlePullEnd() {
    const shouldRefresh = pullDistanceRef.current >= refreshTriggerHeight
    pullStartYRef.current = null
    pullDistanceRef.current = 0

    if (shouldRefresh) {
      setPullDistance(refreshHoldHeight)
      void refreshHomePosts()
      return
    }

    setPullDistance(0)
  }

  async function requestCurrentRegionFromUser() {
    setLocationBusy(true)
    setLocationError('')
    try {
      const current = await requestBrowserLocation()
      const region = await reverseGeocode(current.latitude, current.longitude, 'gps', 'region')
      applyHomeRegion(region, 'granted')
      return region
    } catch (error) {
      const nextPermission = await getLocationPermissionState()
      setPermissionState(nextPermission)
      setLocationError(error instanceof Error ? error.message : '현재 위치를 가져오지 못했습니다.')
      return undefined
    } finally {
      setLocationBusy(false)
    }
  }

  function applyHomeRegion(region: LocationRegion, nextPermissionState = permissionState) {
    const neighborhood = toNeighborhoodRegion(region)
    setCurrentRegion(neighborhood)
    storeLocationRegion(neighborhood)
    setPermissionState(nextPermissionState)
    setLocationError('')
    setShowNeighborhoodSheet(false)

    void saveMyLocationPreference({
      latitude: neighborhood.latitude,
      longitude: neighborhood.longitude,
      region1Depth: neighborhood.region1Depth,
      region2Depth: neighborhood.region2Depth,
      region3Depth: neighborhood.region3Depth,
      permissionStatus: nextPermissionState,
    }).catch(() => undefined)
  }

  const filteredRequests = useMemo(() => {
    const sorted = sortHomeRequests(dbPosts)
    return sorted
  }, [dbPosts])

  useEffect(() => {
    const restoreTop = pendingScrollRestoreRef.current
    if (restoreTop == null || loadState === 'idle' || loadState === 'loading') return undefined

    let frameId = 0
    let attempts = 0
    const restore = () => {
      const feed = feedScrollRef.current
      if (!feed) return
      feed.scrollTop = restoreTop
      attempts += 1
      if (attempts < 4) {
        frameId = window.requestAnimationFrame(restore)
        return
      }
      pendingScrollRestoreRef.current = null
      clearHomeFeedRestoreState()
    }

    frameId = window.requestAnimationFrame(restore)
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [filteredRequests.length, loadState])

  function openPost(postId: string) {
    saveHomeFeedRestoreState({
      mode,
      scrollTop: feedScrollRef.current?.scrollTop ?? 0,
      savedAt: Date.now(),
    })
    const post = dbPosts.find((item) => item.id === postId)
    const postType = post?.postType ?? (mode === 'offer' ? 'offer' : 'request')
    router.push(`/posts/${encodeURIComponent(postId)}?postType=${postType}`)
  }

  async function openReportSheet(request: RequestPost) {
    const session = await fetchAuthSession().catch(() => null)
    if (!session?.authenticated) {
      router.push(`/login?next=${encodeURIComponent(getCurrentPath())}`)
      return
    }
    setReportTarget(request)
    setReportSheetError('')
  }

  async function reportPost(input: { reason: string; description: string }) {
    const request = reportTarget
    if (!request || reportingPostId) return

    setReportingPostId(request.id)
    setReportMessage('')
    setReportError(false)
    setReportSheetError('')
    try {
      const details = [
        input.description.trim(),
        `홈 목록에서 신고됨: ${request.title}`,
      ].filter(Boolean).join('\n\n')
      await createReport({
        postId: isUuid(request.id) ? request.id : undefined,
        reason: input.reason,
        description: details,
      })
      setReportTarget(null)
      setGuideOverlay({
        title: '신고가 접수되었습니다.',
        description: '운영팀이 신고 내용을 확인한 뒤 필요한 조치를 진행합니다.',
        note: '신고 내역은 마이페이지 차단/신고 관리에서 확인할 수 있습니다.',
      })
    } catch (error) {
      if (isPhoneVerificationRequired(error)) {
        setReportError(false)
        setReportSheetError('')
        setReportVerificationInput(input)
        return
      }
      setReportError(true)
      setReportSheetError(error instanceof Error ? error.message : '신고에 실패했습니다.')
    } finally {
      setReportingPostId(null)
    }
  }

  function markWelcomeCtaShown() {
    try {
      window.localStorage.setItem(welcomeStorageKeyRef.current, 'shown')
    } catch {
      // The URL flag is still cleared, so the sheet will not loop in this session.
    }
    setShowWelcomeCta(false)
  }

  function dismissWelcomeCta() {
    markWelcomeCtaShown()
    removeWelcomeQuery()
  }

  function openRequestRegistration() {
    markWelcomeCtaShown()
    router.push('/register/request')
  }

  function browseHelpRequests() {
    setMode('ask')
    dismissWelcomeCta()
    feedScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section className="screen home-screen">
      <AppHeader
        titleContent={
          <div className="home-location-dropdown" ref={regionMenuRef}>
            <button
              className="home-location-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={showRegionMenu}
              onClick={() => setShowRegionMenu((value) => !value)}
            >
              <span>{currentRegionLabel}</span>
              <ChevronDown size={16} />
            </button>
            {showRegionMenu && (
              <div className="home-location-menu" role="menu">
                <span>{formatRegionFull(currentRegion)}</span>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowRegionMenu(false)
                    setShowNeighborhoodSheet(true)
                  }}
                >
                  동네 변경하기
                </button>
              </div>
            )}
          </div>
        }
        actionContent={
          <div className="home-mode-dropdown" ref={modeMenuRef}>
            <button
              className="home-mode-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={showModeMenu}
              onClick={() => setShowModeMenu((value) => !value)}
            >
              <span>{currentModeLabel}</span>
              <ChevronDown size={17} />
            </button>
            {showModeMenu && (
              <div className="home-mode-menu" role="menu">
                {homeModeOptions.map((option) => (
                  <button
                    key={option.value}
                    className={mode === option.value ? 'is-active' : ''}
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === option.value}
                    onClick={() => {
                      setMode(option.value)
                      setShowModeMenu(false)
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />

      <div
        className={[
          'home-feed-scroll',
          refreshIndicatorHeight > 0 ? 'is-pulling' : '',
          isRefreshing ? 'is-refreshing' : '',
        ].filter(Boolean).join(' ')}
        ref={feedScrollRef}
        onTouchStart={handlePullStart}
        onTouchMove={handlePullMove}
        onTouchEnd={handlePullEnd}
        onTouchCancel={handlePullEnd}
      >
        <div
          className={[
            'home-refresh-indicator',
            refreshIndicatorHeight > 0 ? 'is-visible' : '',
            isRefreshArmed ? 'is-armed' : '',
            isRefreshing ? 'is-refreshing' : '',
          ].filter(Boolean).join(' ')}
          style={{ height: refreshIndicatorHeight }}
          aria-hidden={!isRefreshing}
        >
          <span className="loading-spinner home-refresh-spinner" />
        </div>

        <div className="request-list">
          {reportMessage && <p className={`inline-status ${reportError ? 'is-error' : ''}`}>{reportMessage}</p>}
          {loadState === 'loading' && (
            <div className="home-loading" aria-label="게시글을 불러오는 중입니다.">
              <span className="loading-spinner" />
            </div>
          )}
          {loadState === 'ready' && filteredRequests.length === 0 && (
            <div className="empty-state">
              <strong>아직 열린 부탁이 없어요</strong>
              <span>조건을 바꾸거나 직접 새 글을 등록해보세요.</span>
            </div>
          )}
          {filteredRequests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onOpen={() => openPost(request.id)}
              onReport={() => void openReportSheet(request)}
              reportDisabled={reportingPostId === request.id}
            />
          ))}
        </div>
      </div>
      {showNeighborhoodSheet && (
        <NeighborhoodSelectSheet
          searchMode="region"
          presentation="modal"
          showCurrentLocation
          promptContext="nearby"
          permissionState={permissionState}
          busy={locationBusy}
          error={locationError}
          onUseCurrent={requestCurrentRegionFromUser}
          onSelect={(region) => applyHomeRegion(region, permissionState === 'granted' ? 'granted' : 'prompt')}
          onClose={() => {
            setShowNeighborhoodSheet(false)
            setLocationError('')
          }}
        />
      )}
      {reportTarget && (
        <ReportConfirmSheet
          targetLabel={reportTarget.title}
          busy={reportingPostId === reportTarget.id}
          error={reportSheetError}
          onClose={() => {
            if (reportingPostId) return
            setReportTarget(null)
            setReportSheetError('')
          }}
          onSubmit={(input) => void reportPost(input)}
        />
      )}
      {reportVerificationInput && (
        <PhoneVerificationOverlay
          onClose={() => setReportVerificationInput(null)}
          onVerified={() => {
            const input = reportVerificationInput
            setReportVerificationInput(null)
            if (input) void reportPost(input)
          }}
        />
      )}
      {guideOverlay && (
        <ActionGuideOverlay
          title={guideOverlay.title}
          description={guideOverlay.description}
          note={guideOverlay.note}
          onClose={() => setGuideOverlay(null)}
        />
      )}
      {showWelcomeCta && (
        <WelcomeCtaSheet
          onClose={dismissWelcomeCta}
          onCreateRequest={openRequestRegistration}
          onBrowseRequests={browseHelpRequests}
        />
      )}
    </section>
  )
}

function WelcomeCtaSheet({
  onClose,
  onCreateRequest,
  onBrowseRequests,
}: {
  onClose: () => void
  onCreateRequest: () => void
  onBrowseRequests: () => void
}) {
  return (
    <div className="sheet-overlay home-welcome-overlay" role="presentation" onClick={onClose}>
      <div className="home-welcome-sheet" role="dialog" aria-modal="true" aria-labelledby="home-welcome-title" onClick={(event) => event.stopPropagation()}>
        <div className="home-welcome-copy">
          <span>프로필 준비 완료</span>
          <h2 id="home-welcome-title">환영해요! 이제 바로 시작해볼까요?</h2>
          <p>필요한 일을 부탁하거나, 도와줄 수 있는 일을 찾아 첫 거래를 시작해보세요.</p>
        </div>
        <div className="home-welcome-actions">
          <BrandButton size="lg" full onClick={onCreateRequest}>
            부탁 올리기
          </BrandButton>
          <BrandButton variant="outline" size="lg" full onClick={onBrowseRequests}>
            도와줄 일 찾아보기
          </BrandButton>
          <button className="home-welcome-later" type="button" onClick={onClose}>
            나중에 할게요
          </button>
        </div>
      </div>
    </div>
  )
}

async function fetchHomePosts(mode: HomeMode) {
  const query = { statusScope: 'public' } as const
  const posts = mode === 'all'
    ? (await Promise.all([
      fetchTaskPosts({ ...query, postType: 'request' }),
      fetchTaskPosts({ ...query, postType: 'offer' }),
    ])).flat().sort(comparePostsByCreatedAtDesc)
    : await fetchTaskPosts({ ...query, postType: mode === 'ask' ? 'request' : 'offer' })

  return posts.map(mapApiPostToHomeRequestPost)
}

function comparePostsByCreatedAtDesc(a: ApiTaskPost, b: ApiTaskPost) {
  return getPostCreatedTime(b) - getPostCreatedTime(a)
}

function getPostCreatedTime(post: ApiTaskPost) {
  if (!post.createdAt) return 0
  const time = new Date(post.createdAt).getTime()
  return Number.isNaN(time) ? 0 : time
}

function mapApiPostToHomeRequestPost(post: ApiTaskPost): RequestPost {
  const request = mapApiPostToRequestPost(post)
  return {
    ...request,
    deadline: getHomeDeadlineText(post, request.deadline),
  }
}

function getHomeDeadlineText(post: ApiTaskPost, fallback: string) {
  if (post.deadlineAt) {
    const date = new Date(post.deadlineAt)
    if (!Number.isNaN(date.getTime())) return `${date.getMonth() + 1}.${date.getDate()} 까지`
  }

  return post.deadlineText ?? post.availableTimeText ?? fallback
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function profileToLocationRegion(profile: Record<string, unknown>): LocationRegion | null {
  const latitude = Number(profile.defaultLatitude)
  const longitude = Number(profile.defaultLongitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  const region1Depth = typeof profile.defaultRegion1depth === 'string' ? profile.defaultRegion1depth : ''
  const region2Depth = typeof profile.defaultRegion2depth === 'string' ? profile.defaultRegion2depth : ''
  const region3Depth = typeof profile.defaultRegion3depth === 'string' ? profile.defaultRegion3depth : ''

  return {
    latitude,
    longitude,
    addressText: [region1Depth, region2Depth, region3Depth].filter(Boolean).join(' '),
    region1Depth,
    region2Depth,
    region3Depth,
    regionCode: null,
    locationSource: 'manual',
  }
}

function sortHomeRequests(posts: RequestPost[]) {
  return posts.slice().sort((a, b) => getHomeStatusRank(a) - getHomeStatusRank(b))
}

function getHomeStatusRank(post: RequestPost) {
  const status = post.postStatus ?? tradeStatusToPostStatus(post.status)
  if (status === 'open') return 0
  if (status === 'pending' || status === 'in_progress') return 1
  if (status === 'closed') return 2
  if (status === 'completed') return 3
  return 3
}

function tradeStatusToPostStatus(status: RequestPost['status']) {
  if (status === '거래완료') return 'completed'
  if (status === '마감됨') return 'closed'
  if (status === '진행중' || status === '약속' || status === '문의중') return 'in_progress'
  if (status === '취소됨') return 'cancelled'
  return 'open'
}

function readHomeFeedRestoreState(): HomeFeedRestoreState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(homeFeedRestoreStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HomeFeedRestoreState>
    if (!isHomeMode(parsed.mode)) return null
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0
    if (!savedAt || Date.now() - savedAt > homeFeedRestoreMaxAgeMs) {
      clearHomeFeedRestoreState()
      return null
    }
    return {
      mode: parsed.mode,
      scrollTop: typeof parsed.scrollTop === 'number' && Number.isFinite(parsed.scrollTop) ? Math.max(0, parsed.scrollTop) : 0,
      savedAt,
    }
  } catch {
    return null
  }
}

function saveHomeFeedRestoreState(state: HomeFeedRestoreState) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(homeFeedRestoreStorageKey, JSON.stringify(state))
  } catch {
    // Scroll restoration is optional.
  }
}

function clearHomeFeedRestoreState() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(homeFeedRestoreStorageKey)
  } catch {
    // sessionStorage is optional.
  }
}

function isHomeMode(value: unknown): value is HomeMode {
  return value === 'all' || value === 'ask' || value === 'offer'
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function getCurrentPath() {
  if (typeof window === 'undefined') return '/'
  return `${window.location.pathname}${window.location.search}`
}
