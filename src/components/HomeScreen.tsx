'use client'

import { useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { setNativeOverlayState } from '@/components/NativeIOSBridge'
import { NeighborhoodSelectSheet } from '@/components/location/LocationSheets'
import { ActionGuideOverlay, AppHeader, CategoryScroller, ReportConfirmSheet, RequestCard, SegmentedControl } from '@/components/ui/Common'
import { categoryDetailOptions, customCategoryDetailOption, getCategoryLabel, type RequestPost } from '@/data/mockData'
import { createReport, fetchAuthSession, fetchMyPage, fetchTaskPosts, mapApiPostToRequestPost, saveMyLocationPreference, type ApiTaskPost } from '@/lib/manwonApi'
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

type HomeMode = 'ask' | 'offer'

const homeModeOptions: Array<{ value: HomeMode; label: string }> = [
  { value: 'ask', label: '해주세요' },
  { value: 'offer', label: '해줄게요' },
]
const refreshHoldHeight = 64
const refreshTriggerHeight = 58

export function HomeScreen() {
  const router = useRouter()
  const [mode, setMode] = useState<HomeMode>('ask')
  const [showRegionMenu, setShowRegionMenu] = useState(false)
  const [showNeighborhoodSheet, setShowNeighborhoodSheet] = useState(false)
  const [currentRegion, setCurrentRegion] = useState<LocationRegion | null>(null)
  const [permissionState, setPermissionState] = useState<LocationPermissionState>('unknown')
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [hasCheckedStoredRegion, setHasCheckedStoredRegion] = useState(false)
  const [categoryId, setCategoryId] = useState('all')
  const [detailCategory, setDetailCategory] = useState('')
  const [dbPosts, setDbPosts] = useState<RequestPost[]>([])
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'fallback'>('idle')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [reportingPostId, setReportingPostId] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<RequestPost | null>(null)
  const [reportSheetError, setReportSheetError] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [reportError, setReportError] = useState(false)
  const [guideOverlay, setGuideOverlay] = useState<{ title: string; description: string; note: string } | null>(null)
  const regionMenuRef = useRef<HTMLDivElement | null>(null)
  const feedScrollRef = useRef<HTMLDivElement | null>(null)
  const loadRunRef = useRef(0)
  const pullStartYRef = useRef<number | null>(null)
  const pullDistanceRef = useRef(0)
  const detailOptions = (categoryDetailOptions[categoryId] ?? []).filter((option) => option !== customCategoryDetailOption)
  const detailFilterOptions = ['전체', ...detailOptions]
  const showDetailOptions = categoryId !== 'all' && detailOptions.length > 0
  const currentRegionLabel = formatRegionShort(currentRegion)
  const refreshIndicatorHeight = isRefreshing ? refreshHoldHeight : pullDistance
  const isRefreshArmed = !isRefreshing && pullDistance >= refreshTriggerHeight

  useEffect(() => {
    let cancelled = false
    const runId = ++loadRunRef.current

    async function loadPosts() {
      setLoadState('loading')
      try {
        const posts = await fetchHomePosts(mode, categoryId, detailCategory)
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
  }, [categoryId, detailCategory, mode])

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
    setNativeOverlayState(Boolean(reportTarget || guideOverlay || showNeighborhoodSheet))
    return () => {
      setNativeOverlayState(false)
    }
  }, [guideOverlay, reportTarget, showNeighborhoodSheet])

  async function refreshHomePosts() {
    if (isRefreshing || loadState === 'loading') return

    const runId = ++loadRunRef.current
    const startedAt = Date.now()
    setIsRefreshing(true)
    setPullDistance(refreshHoldHeight)
    pullDistanceRef.current = refreshHoldHeight

    try {
      const posts = await fetchHomePosts(mode, categoryId, detailCategory)
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

  function handleCategorySelect(nextCategoryId: string) {
    setCategoryId(nextCategoryId)
    setDetailCategory('')
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
    const base = categoryId === 'all' ? dbPosts : dbPosts.filter((request) => request.categoryId === categoryId)
    const detailFiltered = detailCategory
      ? base.filter((request) => request.categoryDetail === detailCategory || requestMatchesDetail(request, detailCategory))
      : base
    const nextBase = detailFiltered.length > 0 ? detailFiltered : base
    const sorted = sortHomeRequests(nextBase)
    return sorted
  }, [categoryId, dbPosts, detailCategory])

  function openPost(postId: string) {
    const postType = mode === 'ask' ? 'request' : 'offer'
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
        `홈 목록에서 신고됨: [${request.category}] ${request.title}`,
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
      setReportError(true)
      setReportSheetError(error instanceof Error ? error.message : '신고에 실패했습니다.')
    } finally {
      setReportingPostId(null)
    }
  }

  return (
    <section className={`screen home-screen ${showDetailOptions ? 'has-detail-category' : 'is-category-all'}`}>
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
      />

      <SegmentedControl value={mode} onChange={setMode} options={homeModeOptions} />
      <CategoryScroller selectedId={categoryId} onSelect={handleCategorySelect} />

      <div className={`home-detail-filter ${showDetailOptions ? 'is-open' : 'is-closed'}`} aria-hidden={!showDetailOptions}>
        <div className="home-detail-chip-row">
          {detailFilterOptions.map((option) => (
            <button
              key={option}
              className={(option === '전체' ? detailCategory === '' : detailCategory === option) ? 'is-active' : ''}
              type="button"
              onClick={() => setDetailCategory(option === '전체' ? '' : option)}
              tabIndex={showDetailOptions ? 0 : -1}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

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
      {guideOverlay && (
        <ActionGuideOverlay
          title={guideOverlay.title}
          description={guideOverlay.description}
          note={guideOverlay.note}
          onClose={() => setGuideOverlay(null)}
        />
      )}
    </section>
  )
}

function filteredCategoryLabel(categoryId: string) {
  return getCategoryLabel(categoryId)
}

async function fetchHomePosts(mode: HomeMode, categoryId: string, detailCategory: string) {
  const posts = await fetchTaskPosts({
    postType: mode === 'ask' ? 'request' : 'offer',
    statusScope: 'public',
    category: categoryId === 'all' ? undefined : filteredCategoryLabel(categoryId),
    categoryDetail: detailCategory || undefined,
  })

  return posts.map(mapApiPostToHomeRequestPost)
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

function requestMatchesDetail(request: RequestPost, detail: string) {
  const text = `${request.category} ${request.title} ${request.description}`.toLowerCase()
  const normalizedDetail = detail.toLowerCase()
  if (text.includes(normalizedDetail)) return true

  if (detail === '음악') return /피아노|기타|보컬|우쿨렐레|음악/.test(text)
  if (detail === '썸네일') return /썸네일|인스타|카드뉴스/.test(text)
  if (detail === 'PPT 정리') return /ppt|발표/.test(text)
  if (detail === '물건 찾아오기') return /픽업|찾아|약국|도서관|전달/.test(text)
  if (detail === '산책') return /산책|강아지/.test(text)
  return false
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
  if (status === '진행중' || status === '완료요청' || status === '수락대기') return 'in_progress'
  if (status === '취소됨') return 'cancelled'
  return 'open'
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function getCurrentPath() {
  if (typeof window === 'undefined') return '/'
  return `${window.location.pathname}${window.location.search}`
}
