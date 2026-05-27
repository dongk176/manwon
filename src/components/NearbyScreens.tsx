'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  MapPin,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import {
  BrandButton,
  ChipGroup,
  SectionHeader,
} from '@/components/ui/Common'
import { Avatar } from '@/components/ui/Illustration'
import {
  CurrentLocationGlyph,
  LocationPermissionSheet,
  NeighborhoodSelectSheet,
} from '@/components/location/LocationSheets'
import { formatPrice, getUser, type RequestPost } from '@/data/mockData'
import {
  fetchMyPage,
  fetchTaskPost,
  fetchTaskPosts,
  mapApiPostToRequestPost,
  saveMyLocationPreference,
  type ApiTaskPost,
} from '@/lib/manwonApi'
import { loadKakao, type KakaoCustomOverlay, type KakaoLatLng, type KakaoMap } from '@/lib/loadKakao'
import {
  formatRegionShort,
  getLocationPermissionState,
  getStoredLocationRegion,
  requestBrowserLocation,
  reverseGeocode,
  storeLocationRegion,
  type LocationPermissionState,
  type LocationRegion,
} from '@/lib/location'

type DistanceFilter = '500m' | '1km' | '3km' | '5km'
type QuickFilter = 'now' | 'under'
type NearbyPanelState = 'collapsed' | 'peek' | 'expanded'

interface NearbyPost {
  request: RequestPost
  latitude: number | null
  longitude: number | null
  displayLatitude: number
  displayLongitude: number
}

const defaultRegion: LocationRegion = {
  latitude: 37.5009,
  longitude: 127.0365,
  addressText: '서울 강남구 역삼동',
  region1Depth: '서울',
  region2Depth: '강남구',
  region3Depth: '역삼동',
  regionCode: null,
  locationSource: 'manual',
}

const distanceOptions = [
  { value: '500m', label: '500m' },
  { value: '1km', label: '1km' },
  { value: '3km', label: '3km' },
  { value: '5km', label: '5km' },
] satisfies Array<{ value: DistanceFilter; label: string }>

const quickFilters = [
  { value: 'now', label: '지금 가능' },
  { value: 'under', label: '만원 이하' },
] satisfies Array<{ value: QuickFilter; label: string }>

export function NearbyScreens() {
  const router = useRouter()
  const [showFilter, setShowFilter] = useState(false)
  const [showLocationPrompt, setShowLocationPrompt] = useState(false)
  const [showNeighborhoodSheet, setShowNeighborhoodSheet] = useState(false)
  const [distance, setDistance] = useState<DistanceFilter>('1km')
  const [quickFilter, setQuickFilter] = useState<QuickFilter | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<LocationRegion | null>(null)
  const [permissionState, setPermissionState] = useState<LocationPermissionState>('unknown')
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [apiPosts, setApiPosts] = useState<ApiTaskPost[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [panelState, setPanelState] = useState<NearbyPanelState>('peek')
  const panelDragStartYRef = useRef<number | null>(null)
  const panelDragLastYRef = useRef<number | null>(null)
  const panelDragMovedRef = useRef(false)

  const activeRegion = selectedRegion ?? defaultRegion
  const radiusM = distanceToMeters(distance)

  useEffect(() => {
    let cancelled = false

    getLocationPermissionState()
      .then((nextState) => {
        if (!cancelled) setPermissionState(nextState)
      })
      .catch(() => {
        if (!cancelled) setPermissionState('unknown')
      })

    const stored = getStoredLocationRegion()
    if (stored) {
      queueMicrotask(() => setSelectedRegion(stored))
      return () => {
        cancelled = true
      }
    }

    fetchMyPage()
      .then((profile) => {
        if (cancelled) return
        const profileRegion = profileToLocationRegion(profile)
        if (profileRegion) {
          setSelectedRegion(profileRegion)
          storeLocationRegion(profileRegion)
        } else {
          queueMicrotask(() => setShowLocationPrompt(true))
        }
      })
      .catch(() => {
        if (!cancelled) queueMicrotask(() => setShowLocationPrompt(true))
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => setLoadState('loading'))

    fetchTaskPosts({
      nearby: true,
      lat: activeRegion.latitude,
      lng: activeRegion.longitude,
      radiusM,
      maxPrice: quickFilter === 'under' ? 10000 : undefined,
    })
      .then((posts) => {
        if (!cancelled) {
          setApiPosts(posts)
          setLoadState('ready')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApiPosts([])
          setLoadState('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeRegion.latitude, activeRegion.longitude, quickFilter, radiusM])

  const displayPosts = useMemo(() => {
    const source = apiPostsToNearbyPosts(apiPosts)
    return source.filter((post) => {
      if (quickFilter === 'under' && post.request.price > 10000) return false
      if (quickFilter === 'now' && !/지금|오늘/.test(post.request.deadline)) return false
      if (!withinDistance(post.request.distance, distance)) return false
      return true
    })
  }, [apiPosts, distance, quickFilter])

  const selectedPost = displayPosts.find((post) => post.request.id === selectedPostId) ?? displayPosts[0] ?? null

  async function applyRegion(region: LocationRegion, nextPermissionState: LocationPermissionState) {
    setSelectedRegion(region)
    setSelectedPostId(null)
    storeLocationRegion(region)
    setPermissionState(nextPermissionState)
    setLocationError('')
    await saveMyLocationPreference({
      latitude: region.latitude,
      longitude: region.longitude,
      region1Depth: region.region1Depth,
      region2Depth: region.region2Depth,
      region3Depth: region.region3Depth,
      permissionStatus: nextPermissionState,
    }).catch(() => undefined)
  }

  async function requestCurrentLocationFromUser() {
    setLocationBusy(true)
    setLocationError('')
    try {
      const current = await requestBrowserLocation()
      const region = await reverseGeocode(current.latitude, current.longitude, 'gps')
      await applyRegion(region, 'granted')
      setShowLocationPrompt(false)
      setShowNeighborhoodSheet(false)
    } catch (error) {
      const nextPermission = await getLocationPermissionState()
      setPermissionState(nextPermission)
      setLocationError(error instanceof Error ? error.message : '현재 위치를 가져오지 못했습니다.')
      await saveMyLocationPreference({ permissionStatus: nextPermission }).catch(() => undefined)
    } finally {
      setLocationBusy(false)
    }
  }

  async function handleMapLocate() {
    const nextPermission = await getLocationPermissionState()
    setPermissionState(nextPermission)
    if (nextPermission !== 'granted') {
      setShowLocationPrompt(true)
      return
    }
    void requestCurrentLocationFromUser()
  }

  function handlePanelPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    panelDragStartYRef.current = event.clientY
    panelDragLastYRef.current = event.clientY
    panelDragMovedRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePanelPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (panelDragStartYRef.current == null) return
    panelDragLastYRef.current = event.clientY
    if (Math.abs(event.clientY - panelDragStartYRef.current) > 8) {
      panelDragMovedRef.current = true
    }
  }

  function handlePanelPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (panelDragStartYRef.current == null) return
    const deltaY = (panelDragLastYRef.current ?? event.clientY) - panelDragStartYRef.current
    panelDragStartYRef.current = null
    panelDragLastYRef.current = null

    if (deltaY < -36) {
      setPanelState('expanded')
      return
    }
    if (deltaY > 36) {
      setPanelState('collapsed')
    }
  }

  function togglePanelState() {
    setPanelState((current) => (current === 'expanded' ? 'collapsed' : 'expanded'))
  }

  return (
    <section className="screen nearby-screen">
      <header className="nearby-header">
        <button type="button" className="nearby-location-button" onClick={() => setShowNeighborhoodSheet(true)}>
          <MapPin size={16} />
          {formatRegionShort(activeRegion)}
          <ChevronDown size={14} />
        </button>
        <button type="button" className="nearby-filter-button" onClick={() => setShowFilter(true)} aria-label="필터">
          <SlidersHorizontal size={18} />
        </button>
      </header>

      <div className={`nearby-map-stage is-panel-${panelState}`}>
        <NearbyMap
          posts={displayPosts}
          selectedPostId={selectedPost?.request.id ?? null}
          center={activeRegion}
          panelState={panelState}
          onSelectPost={(postId) => {
            setSelectedPostId(postId)
            if (panelState === 'collapsed') setPanelState('peek')
          }}
          onLocate={() => void handleMapLocate()}
        />

        <p className="map-privacy-note">
          <MapPin size={14} />
          등록한 주소 기준으로 표시돼요.
        </p>

        <section className={`nearby-bottom-panel is-${panelState}`} aria-label="주변 부탁 목록">
          <div
            className="nearby-panel-drag-area"
            role="button"
            tabIndex={0}
            aria-label="주변 부탁 목록 열고 닫기"
            onPointerDown={handlePanelPointerDown}
            onPointerMove={handlePanelPointerMove}
            onPointerUp={handlePanelPointerUp}
            onClick={() => {
              if (panelDragMovedRef.current) {
                panelDragMovedRef.current = false
                return
              }
              togglePanelState()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                togglePanelState()
              }
            }}
          >
            <div className="drag-handle" />
          </div>
          <div className="nearby-panel-header">
            <div>
              <strong>주변 부탁</strong>
              <span>{displayPosts.length}개</span>
            </div>
            <button type="button" onClick={togglePanelState}>
              {panelState === 'expanded' ? '지도 보기' : '목록 보기'}
            </button>
          </div>
          <div className="nearby-panel-body">
            {loadState === 'loading' && <p className="inline-status">주변 부탁을 불러오는 중입니다.</p>}
            {loadState === 'error' && <p className="inline-status is-error">주변 부탁을 불러오지 못해 예시를 보여드려요.</p>}
            {loadState === 'ready' && apiPosts.length === 0 && <p className="inline-status">조건에 맞는 주변 부탁이 없어서 예시를 보여드려요.</p>}
            {selectedPost ? (
              <NearbySummaryCard post={selectedPost} onOpen={() => router.push(`/nearby/${encodeURIComponent(selectedPost.request.id)}`)} />
            ) : (
              <div className="empty-state compact">
                <strong>조건에 맞는 주변 부탁이 없어요</strong>
                <span>거리나 상태 조건을 넓혀보세요.</span>
              </div>
            )}
            {displayPosts.length > 0 && (
              <div className="nearby-sheet-list" aria-label="주변 부탁 리스트">
                {displayPosts.map((post) => (
                  <NearbyListCard
                    key={post.request.id}
                    post={post}
                    selected={selectedPost?.request.id === post.request.id}
                    onSelect={() => {
                      setSelectedPostId(post.request.id)
                      if (panelState === 'collapsed') setPanelState('peek')
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {showFilter && (
        <FilterSheet
          distance={distance}
          quickFilter={quickFilter}
          onDistanceChange={setDistance}
          onQuickFilterChange={setQuickFilter}
          onClose={() => setShowFilter(false)}
        />
      )}
      {showLocationPrompt && (
        <LocationPermissionSheet
          context="nearby"
          permissionState={permissionState}
          busy={locationBusy}
          error={locationError}
          onAllow={() => void requestCurrentLocationFromUser()}
          onManual={() => {
            setShowLocationPrompt(false)
            setShowNeighborhoodSheet(true)
          }}
          onClose={() => setShowLocationPrompt(false)}
        />
      )}
      {showNeighborhoodSheet && (
        <NeighborhoodSelectSheet
          showCurrentLocation
          promptContext="nearby"
          permissionState={permissionState}
          busy={locationBusy}
          error={locationError}
          onUseCurrent={() => void requestCurrentLocationFromUser()}
          onSelect={(region) => {
            void applyRegion(region, permissionState === 'granted' ? 'granted' : 'prompt')
            setShowNeighborhoodSheet(false)
          }}
          onClose={() => setShowNeighborhoodSheet(false)}
        />
      )}
    </section>
  )
}

export function NearbyDetailScreen({ postId }: { postId: string }) {
  const router = useRouter()
  const [region, setRegion] = useState<LocationRegion>(defaultRegion)
  const [apiPost, setApiPost] = useState<ApiTaskPost | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const stored = getStoredLocationRegion()
    if (stored) queueMicrotask(() => setRegion(stored))
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => setLoadState('loading'))
    fetchTaskPost(postId)
      .then((post) => {
        if (cancelled) return
        setApiPost(post)
        setLoadState('ready')
      })
      .catch(() => {
        if (cancelled) return
        setApiPost(null)
        setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [postId])

  const detailPost = useMemo(() => {
    return apiPost ? apiPostToNearbyPost(apiPost, region) : null
  }, [apiPost, region])

  const detailRegion = apiPost ? regionFromApiPost(apiPost, region) : region

  if (loadState === 'loading') {
    return (
      <section className="screen nearby-detail-screen">
        <p className="inline-status">주변 부탁을 불러오는 중입니다.</p>
      </section>
    )
  }

  if (!detailPost) {
    return (
      <section className="screen nearby-detail-screen">
        <header className="detail-header-wrap">
          <button type="button" className="icon-button header-back" onClick={() => router.push('/nearby')} aria-label="뒤로가기">
            <ArrowLeft size={24} />
          </button>
          <h1>주변 상세</h1>
        </header>
        <div className="empty-state">
          <strong>주변 부탁을 찾지 못했어요</strong>
          <span>목록에서 다시 선택해주세요.</span>
        </div>
      </section>
    )
  }

  return <NearbyDetail post={detailPost} region={detailRegion} onBack={() => router.push('/nearby')} />
}

function NearbyMap({
  posts,
  selectedPostId,
  center,
  panelState = 'peek',
  compact = false,
  onSelectPost,
  onLocate,
}: {
  posts: NearbyPost[]
  selectedPostId: string | null
  center: LocationRegion
  panelState?: NearbyPanelState
  compact?: boolean
  onSelectPost: (postId: string) => void
  onLocate: () => void
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const kakaoMapRef = useRef<KakaoMap | null>(null)
  const centerLatLngRef = useRef<KakaoLatLng | null>(null)
  const overlaysRef = useRef<KakaoCustomOverlay[]>([])
  const [realMapReady, setRealMapReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    loadKakao()
      .then((kakao) => {
        if (!mapRef.current || cancelled) return
        const centerLatLng = new kakao.maps.LatLng(center.latitude, center.longitude)
        centerLatLngRef.current = centerLatLng
        if (!kakaoMapRef.current) {
          kakaoMapRef.current = new kakao.maps.Map(mapRef.current, {
            center: centerLatLng,
            level: compact ? 4 : 5,
          })
        } else {
          kakaoMapRef.current.setCenter(centerLatLng)
          kakaoMapRef.current.setLevel(compact ? 4 : 5)
        }
        relayoutKakaoMap(kakaoMapRef.current, centerLatLng)

        overlaysRef.current.forEach((overlay) => overlay.setMap(null))
        overlaysRef.current = posts.map((post) => {
          const position = new kakao.maps.LatLng(post.displayLatitude, post.displayLongitude)
          const button = document.createElement('button')
          button.type = 'button'
          button.className = `map-price-overlay ${selectedPostId === post.request.id ? 'is-selected' : ''}`
          const label = document.createElement('span')
          label.textContent = formatPrice(post.request.price)
          const markerDot = document.createElement('i')
          markerDot.setAttribute('aria-hidden', 'true')
          button.append(label, markerDot)
          button.addEventListener('click', () => onSelectPost(post.request.id))
          const overlay = new kakao.maps.CustomOverlay({
            position,
            content: button,
            yAnchor: 1.15,
          })
          overlay.setMap(kakaoMapRef.current)
          return overlay
        })
        setRealMapReady(true)
      })
      .catch(() => setRealMapReady(false))

    return () => {
      cancelled = true
      overlaysRef.current.forEach((overlay) => overlay.setMap(null))
      overlaysRef.current = []
    }
  }, [center.latitude, center.longitude, compact, onSelectPost, posts, selectedPostId])

  useEffect(() => {
    if (!mapRef.current || !kakaoMapRef.current) return undefined
    const mapElement = mapRef.current
    const map = kakaoMapRef.current
    let rafId = 0

    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(rafId)
      rafId = window.requestAnimationFrame(() => {
        const centerLatLng = centerLatLngRef.current
        if (!centerLatLng) return
        relayoutKakaoMap(map, centerLatLng)
      })
    })
    observer.observe(mapElement)

    return () => {
      window.cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [center.latitude, center.longitude, panelState, realMapReady])

  return (
    <div className={`map-view ${compact ? 'is-compact' : `is-panel-${panelState}`}`}>
      <div ref={mapRef} className="real-map-layer" />
      {!realMapReady && (
        <div className="mock-map-layer">
          <span className="map-road road-a" />
          <span className="map-road road-b" />
          <span className="map-road road-c" />
          <span className="map-label label-a">{center.region3Depth || '동네'}</span>
          <span className="map-label label-b">주소 위치</span>
          <span className="map-label label-c">주변 부탁</span>
          {posts.slice(0, 4).map((post, index) => (
            <PricePin
              key={post.request.id}
              className={['pin-a', 'pin-b', 'pin-c', 'pin-d'][index] ?? 'pin-a'}
              price={formatPrice(post.request.price)}
              active={selectedPostId === post.request.id}
              onClick={() => onSelectPost(post.request.id)}
            />
          ))}
        </div>
      )}
      {!compact && (
        <button className="locate-button" type="button" aria-label="현재 위치" onClick={onLocate}>
          <CurrentLocationGlyph active={realMapReady} />
        </button>
      )}
    </div>
  )
}

function relayoutKakaoMap(map: KakaoMap, centerLatLng: KakaoLatLng) {
  map.relayout()
  map.setCenter(centerLatLng)
  window.requestAnimationFrame(() => {
    map.relayout()
    map.setCenter(centerLatLng)
  })
  window.setTimeout(() => {
    map.relayout()
    map.setCenter(centerLatLng)
  }, 180)
}

function NearbySummaryCard({ post, onOpen }: { post: NearbyPost; onOpen: () => void }) {
  const request = post.request
  return (
    <article className="nearby-summary-card">
      <button type="button" onClick={onOpen}>
        <div>
          <strong>{request.title}</strong>
          <p>
            <MapPin size={15} />
            {request.distance ?? '거리 계산 중'} · {request.detailLocation}
          </p>
          <p>
            <Clock size={15} />
            <b className={isFastDeadlineText(request.deadline) ? 'hot-deadline-text' : undefined}>{request.deadline}</b>
          </p>
        </div>
        <em>{formatPrice(request.price)}</em>
      </button>
      <BrandButton full size="md">
        제가 할게요
      </BrandButton>
    </article>
  )
}

function NearbyListCard({
  post,
  selected,
  onSelect,
}: {
  post: NearbyPost
  selected: boolean
  onSelect: () => void
}) {
  const request = post.request

  return (
    <button className={`nearby-list-card ${selected ? 'is-selected' : ''}`} type="button" onClick={onSelect}>
      <strong>{request.title}</strong>
      <p>
        <MapPin size={14} />
        {request.distance ?? '거리 계산 중'} · {request.detailLocation}
      </p>
      <em>{formatPrice(request.price)}</em>
    </button>
  )
}

function NearbyDetail({ post, region, onBack }: { post: NearbyPost; region: LocationRegion; onBack: () => void }) {
  const request = post.request
  const requester = getUser(request.requesterId)

  return (
    <section className="screen nearby-detail-screen">
      <header className="detail-header-wrap">
        <button type="button" className="icon-button header-back" onClick={onBack} aria-label="뒤로가기">
          <ArrowLeft size={24} />
        </button>
        <h1>주변 상세</h1>
      </header>
      <NearbyMap posts={[post]} selectedPostId={request.id} center={region} compact onSelectPost={() => undefined} onLocate={() => undefined} />
      <div className="nearby-detail-card">
        <div className="detail-tags">
          <span>
            <MapPin size={14} />
            내 주변
          </span>
          <em>{request.distance}</em>
        </div>
        <h2>{request.title}</h2>
        <strong className="detail-price">{formatPrice(request.price)}</strong>
        <div className="detail-meta">
          <span>
            <Clock size={18} />
            <strong className={isFastDeadlineText(request.deadline) ? 'hot-deadline-text' : undefined}>{request.deadline}</strong>
          </span>
          <span>
            <MapPin size={18} />
            {request.detailLocation}
          </span>
        </div>
      </div>

      <div className="detail-section-card">
        <h3>상세 설명</h3>
        <p>{request.description}</p>
      </div>

      <div className="detail-section-card requester-card">
        <h3>요청자 정보</h3>
        <div>
          <Avatar user={requester} size="lg" />
          <span>
            <strong>{requester.name}</strong>
            <em>★ {requester.rating}</em>
            <small>거래 완료 {requester.completedCount}회</small>
          </span>
          <ChevronRight size={20} />
        </div>
      </div>

      <div className="fixed-bottom-button">
        <BrandButton full size="lg">
          제가 할게요
        </BrandButton>
      </div>
    </section>
  )
}

function PricePin({
  price,
  className,
  active,
  onClick,
}: {
  price: string
  className: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button className={`price-pin ${className} ${active ? 'is-selected' : ''}`} type="button" onClick={onClick}>
      <span>{price}</span>
      <i />
    </button>
  )
}

function ChipButton({ children, active = false, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button className={`nearby-chip ${active ? 'is-active' : ''}`} type="button" onClick={onClick}>
      {children}
    </button>
  )
}

function FilterSheet({
  distance,
  quickFilter,
  onDistanceChange,
  onQuickFilterChange,
  onClose,
}: {
  distance: DistanceFilter
  quickFilter: QuickFilter | null
  onDistanceChange: (value: DistanceFilter) => void
  onQuickFilterChange: (value: QuickFilter | null) => void
  onClose: () => void
}) {
  return (
    <div className="sheet-overlay">
      <div className="filter-sheet">
        <div className="drag-handle" />
        <button className="sheet-x" type="button" onClick={onClose} aria-label="닫기">
          <X size={24} />
        </button>
        <h2>필터</h2>
        <div className="filter-sheet-content">
          <SectionHeader title="거리 선택" />
          <ChipGroup options={distanceOptions} value={distance} onChange={onDistanceChange} />
          <SectionHeader title="상태" />
          <div className="nearby-filter-row in-sheet">
            {quickFilters.map((option) => (
              <ChipButton
                key={option.value}
                active={quickFilter === option.value}
                onClick={() => onQuickFilterChange(quickFilter === option.value ? null : option.value)}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
        </div>
        <div className="two-buttons filter-sheet-actions">
          <BrandButton
            variant="outline"
            size="lg"
            onClick={() => {
              onDistanceChange('1km')
              onQuickFilterChange(null)
            }}
          >
            초기화
          </BrandButton>
          <BrandButton size="lg" onClick={onClose}>
            적용하기
          </BrandButton>
        </div>
      </div>
    </div>
  )
}

function apiPostsToNearbyPosts(posts: ApiTaskPost[]): NearbyPost[] {
  const result: NearbyPost[] = []
  for (const post of posts) {
    const nearbyPost = apiPostToNearbyPost(post, defaultRegion, true)
    if (nearbyPost) result.push(nearbyPost)
  }
  return result
}

function apiPostToNearbyPost(post: ApiTaskPost, fallbackRegion: LocationRegion, requireCoordinates = false): NearbyPost | null {
  const request = mapApiPostToRequestPost(post)
  const rawLatitude = post.latitude == null ? null : Number(post.latitude)
  const rawLongitude = post.longitude == null ? null : Number(post.longitude)
  const hasCoordinates = Number.isFinite(rawLatitude) && Number.isFinite(rawLongitude)
  if (requireCoordinates && !hasCoordinates) return null

  const latitude = hasCoordinates ? Number(rawLatitude) : fallbackRegion.latitude
  const longitude = hasCoordinates ? Number(rawLongitude) : fallbackRegion.longitude
  return {
    request,
    latitude,
    longitude,
    displayLatitude: latitude,
    displayLongitude: longitude,
  }
}

function regionFromApiPost(post: ApiTaskPost, fallbackRegion: LocationRegion): LocationRegion {
  const latitude = post.latitude == null ? fallbackRegion.latitude : Number(post.latitude)
  const longitude = post.longitude == null ? fallbackRegion.longitude : Number(post.longitude)
  const region1Depth = post.region1depth ?? fallbackRegion.region1Depth
  const region2Depth = post.region2depth ?? fallbackRegion.region2Depth
  const region3Depth = post.region3depth ?? fallbackRegion.region3Depth

  return {
    latitude: Number.isFinite(latitude) ? latitude : fallbackRegion.latitude,
    longitude: Number.isFinite(longitude) ? longitude : fallbackRegion.longitude,
    addressText: post.addressText ?? [region1Depth, region2Depth, region3Depth].filter(Boolean).join(' '),
    region1Depth,
    region2Depth,
    region3Depth,
    regionCode: post.regionCode ?? null,
    locationSource: post.locationSource ?? 'manual',
  }
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

function distanceToMeters(distance: DistanceFilter) {
  if (distance === '500m') return 500
  if (distance === '1km') return 1000
  if (distance === '3km') return 3000
  return 5000
}

function withinDistance(distanceText: string | undefined, selected: DistanceFilter) {
  if (!distanceText || distanceText === '온라인') return true
  const numeric = Number(distanceText.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(numeric)) return true
  const meters = distanceText.includes('km') ? numeric * 1000 : numeric
  return meters <= distanceToMeters(selected)
}

function isFastDeadlineText(value: string) {
  return value.trim() === '가능한 빠르게'
}
