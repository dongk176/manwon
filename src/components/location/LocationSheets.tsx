'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, MapPin, Navigation, Search, X } from 'lucide-react'
import { openIOSAppSettings } from '@/components/NativeIOSBridge'
import { loadKakao, type KakaoMap } from '@/lib/loadKakao'
import {
  formatRegionFull,
  formatRegionShort,
  reverseGeocode,
  searchAddresses,
  searchNeighborhoods,
  type LocationPermissionState,
  type LocationRegion,
} from '@/lib/location'

export type LocationPromptContext = 'nearby' | 'request' | 'offer'

const promptCopy: Record<LocationPromptContext, { title: string; description: string; allow: string; manual: string }> = {
  nearby: {
    title: '내 주변 부탁을 찾아볼까요?',
    description: '위치를 허용하면 가까운 부탁을 거리순으로 보여드릴게요. 정확한 주소는 공개되지 않아요.',
    allow: '위치 허용하기',
    manual: '동네 직접 선택',
  },
  request: {
    title: '어디 근처에서 진행할까요?',
    description: '선택한 주소가 게시글과 지도에 공개돼요. 실제 진행할 위치를 검색해주세요.',
    allow: '현재 위치 사용',
    manual: '주소 검색',
  },
  offer: {
    title: '어느 동네에서 활동할 수 있나요?',
    description: '현재 위치로 동네를 찾으려면 위치 권한을 켜주세요. 직접 동네를 검색할 수도 있어요.',
    allow: '현재 위치 사용',
    manual: '동네 직접 선택',
  },
}

export function LocationPermissionSheet({
  context,
  permissionState,
  busy,
  error,
  onAllow,
  onManual,
  onClose,
}: {
  context: LocationPromptContext
  permissionState: LocationPermissionState
  busy?: boolean
  error?: string
  onAllow: () => void
  onManual: () => void
  onClose: () => void
}) {
  const copy = promptCopy[context]
  const denied = permissionState === 'denied'
  const primaryLabel = denied ? '설정에서 허용' : copy.allow
  const deniedDescription = context === 'offer'
    ? '위치 사용 동의가 꺼져 있어요. 설정에서 위치 권한을 켜거나 동네를 직접 선택해주세요.'
    : '위치 권한이 꺼져 있어요. 동네를 직접 선택하거나 설정에서 위치 권한을 허용해주세요.'

  function handlePrimaryClick() {
    if (denied) {
      if (!openIOSAppSettings()) onManual()
      return
    }
    onAllow()
  }

  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <div className="location-sheet" role="dialog" aria-modal="true" aria-labelledby="location-prompt-title" onClick={(event) => event.stopPropagation()}>
        <div className="drag-handle" />
        <button className="sheet-x" type="button" onClick={onClose} aria-label="닫기">
          <X size={22} />
        </button>
        <span className="location-sheet-icon">
          <MapPin size={23} />
        </span>
        <h2 id="location-prompt-title">{copy.title}</h2>
        <p>{denied ? deniedDescription : copy.description}</p>
        {error && <p className="location-sheet-error">{error}</p>}
        <div className="location-sheet-actions">
          <button className="is-primary" type="button" onClick={handlePrimaryClick} disabled={busy || permissionState === 'unavailable'}>
            <Navigation size={17} />
            {busy ? '위치 확인 중' : primaryLabel}
          </button>
          <button type="button" onClick={onManual}>
            {copy.manual}
          </button>
        </div>
      </div>
    </div>
  )
}

export function NeighborhoodSelectSheet({
  permissionState,
  busy,
  error,
  searchMode = 'region',
  presentation,
  showCurrentLocation,
  promptContext,
  onUseCurrent,
  onSelect,
  onClose,
}: {
  permissionState: LocationPermissionState
  busy?: boolean
  error?: string
  searchMode?: 'region' | 'address'
  presentation?: 'sheet' | 'modal'
  showCurrentLocation?: boolean
  promptContext?: LocationPromptContext
  onUseCurrent: () => void | Promise<LocationRegion | void>
  onSelect: (region: LocationRegion) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LocationRegion[]>([])
  const [selectedRegion, setSelectedRegion] = useState<LocationRegion | null>(null)
  const [pickedRegion, setPickedRegion] = useState<LocationRegion | null>(null)
  const [addressMode, setAddressMode] = useState<'search' | 'mapPick'>('search')
  const [searchState, setSearchState] = useState<'idle' | 'searching' | 'error'>('idle')
  const [showCurrentPrompt, setShowCurrentPrompt] = useState(false)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      queueMicrotask(() => {
        setResults([])
        setSearchState('idle')
      })
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearchState('searching')
      const search = searchMode === 'address' ? searchAddresses : searchNeighborhoods
      search(trimmed)
        .then((nextResults) => {
          if (!cancelled) {
            setResults(nextResults)
            setSearchState('idle')
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResults([])
            setSearchState('error')
          }
        })
    }, 260)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, searchMode])

  const title = searchMode === 'address' ? '주소를 선택해주세요' : '동네를 선택해주세요'
  const placeholder = searchMode === 'address' ? '주소나 건물명을 검색해보세요' : '동네명을 검색해보세요'
  const shortLabel = searchMode === 'address' ? '지도 핀 위치' : undefined
  const searchingText = searchMode === 'address' ? '주소를 검색하는 중입니다.' : '동네를 검색하는 중입니다.'
  const errorText = searchMode === 'address' ? '주소 검색에 실패했습니다.' : '동네 검색에 실패했습니다.'
  const showCurrentLocationRow = showCurrentLocation ?? searchMode === 'address'
  const deniedText = searchMode === 'address'
    ? '위치 권한이 꺼져 있어요. 주소를 검색하거나 설정에서 위치 권한을 허용해주세요.'
    : '위치 권한이 꺼져 있어요. 동네를 직접 선택하거나 설정에서 위치 권한을 허용해주세요.'
  const isCenteredModal = searchMode === 'address' || presentation === 'modal'

  async function handleUseCurrent(skipPrompt = false) {
    if (!skipPrompt && permissionState !== 'granted') {
      setShowCurrentPrompt(true)
      return
    }

    const region = await onUseCurrent()
    setShowCurrentPrompt(false)
    if (searchMode !== 'address' || !region) return
    setQuery(region.addressText)
    setResults([region])
    setSelectedRegion(region)
    setPickedRegion(region)
    setAddressMode('mapPick')
    setSearchState('idle')
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    setSelectedRegion(null)
    setPickedRegion(null)
    setAddressMode('search')
  }

  function isSelected(region: LocationRegion) {
    if (!selectedRegion) return false
    return selectedRegion.addressText === region.addressText
      && selectedRegion.latitude === region.latitude
      && selectedRegion.longitude === region.longitude
  }

  return (
    <div className={`sheet-overlay ${isCenteredModal ? 'is-centered' : ''}`} role="presentation" onClick={onClose}>
      <div
        className={`location-sheet neighborhood-sheet ${isCenteredModal ? 'is-location-modal' : ''} ${searchMode === 'address' ? 'is-address-modal' : ''} ${addressMode === 'mapPick' ? 'is-map-pick' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="neighborhood-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drag-handle" />
        <button className="sheet-x" type="button" onClick={onClose} aria-label="닫기">
          <X size={22} />
        </button>
        <h2 id="neighborhood-title">{title}</h2>
        {addressMode === 'mapPick' && searchMode === 'address' && pickedRegion ? (
          <AddressMapPicker
            region={pickedRegion}
            onBack={() => setAddressMode('search')}
            onRegionChange={(region) => {
              setPickedRegion(region)
              setSelectedRegion(region)
              setQuery(region.addressText)
              setResults([region])
            }}
          />
        ) : (
          <>
            <label className="neighborhood-search">
              <Search size={18} />
              <input value={query} onChange={(event) => handleQueryChange(event.target.value)} placeholder={placeholder} />
            </label>
            {showCurrentLocationRow && (
              <button className="current-location-row" type="button" onClick={() => void handleUseCurrent()} disabled={busy || permissionState === 'unavailable'}>
                <Navigation size={17} />
                {busy ? '현재 위치 확인 중' : '현재 위치 사용'}
              </button>
            )}
            {error && <p className="location-sheet-error">{error}</p>}
            {permissionState === 'denied' && <p className="location-sheet-error">{deniedText}</p>}
            <div className="neighborhood-results">
              {query.trim().length < 2 && (
                <>
                  {searchMode === 'address' ? (
                    <>
                      <SampleRegion label="서울 마포구 성산로" onClick={() => handleQueryChange('서울 마포구 성산로')} />
                      <SampleRegion label="서울 강남구 테헤란로" onClick={() => handleQueryChange('서울 강남구 테헤란로')} />
                      <SampleRegion label="역삼역" onClick={() => handleQueryChange('역삼역')} />
                    </>
                  ) : (
                    <>
                      <SampleRegion label="서울 강남구 역삼동" onClick={() => handleQueryChange('역삼동')} />
                      <SampleRegion label="서울 마포구 합정동" onClick={() => handleQueryChange('합정동')} />
                      <SampleRegion label="서울 성동구 성수동1가" onClick={() => handleQueryChange('성수동1가')} />
                    </>
                  )}
                </>
              )}
              {searchState === 'searching' && <p className="inline-status">{searchingText}</p>}
              {searchState === 'error' && <p className="inline-status is-error">{errorText}</p>}
              {query.trim().length >= 2 && searchState === 'idle' && results.length === 0 && <p className="inline-status">검색 결과가 없습니다.</p>}
              {results.map((region) => (
                <button
                  key={`${region.regionCode ?? region.addressText}-${region.latitude}-${region.longitude}`}
                  className={searchMode === 'address' && isSelected(region) ? 'is-selected' : ''}
                  type="button"
                  onClick={() => {
                    if (searchMode === 'address') {
                      setSelectedRegion(region)
                      return
                    }
                    onSelect(region)
                  }}
                >
                  <MapPin size={17} />
                  <span>
                    <strong>{searchMode === 'address' ? region.addressText : formatRegionFull(region)}</strong>
                    <small>{shortLabel ?? formatRegionShort(region)}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        {searchMode === 'address' && (
          <button className="address-modal-confirm" type="button" disabled={!selectedRegion} onClick={() => selectedRegion && onSelect(selectedRegion)}>
            확인
          </button>
        )}
      </div>
      {showCurrentPrompt && (
        <LocationPermissionSheet
          context={promptContext ?? (searchMode === 'address' ? 'request' : 'nearby')}
          permissionState={permissionState}
          busy={busy}
          error={error}
          onAllow={() => void handleUseCurrent(true)}
          onManual={() => setShowCurrentPrompt(false)}
          onClose={() => setShowCurrentPrompt(false)}
        />
      )}
    </div>
  )
}

function AddressMapPicker({
  region,
  onBack,
  onRegionChange,
}: {
  region: LocationRegion
  onBack: () => void
  onRegionChange: (region: LocationRegion) => void
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const kakaoMapRef = useRef<KakaoMap | null>(null)
  const initialRegionRef = useRef(region)
  const onRegionChangeRef = useRef(onRegionChange)
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [addressState, setAddressState] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => {
    onRegionChangeRef.current = onRegionChange
  }, [onRegionChange])

  useEffect(() => {
    let cancelled = false

    loadKakao()
      .then((kakao) => {
        if (!mapRef.current || cancelled) return
        const initialRegion = initialRegionRef.current
        const center = new kakao.maps.LatLng(initialRegion.latitude, initialRegion.longitude)
        const map = new kakao.maps.Map(mapRef.current, { center, level: 3 })
        kakaoMapRef.current = map
        map.relayout()
        map.setCenter(center)
        window.requestAnimationFrame(() => {
          map.relayout()
          map.setCenter(center)
        })

        kakao.maps.event.addListener(map, 'idle', () => {
          if (cancelled) return
          const nextCenter = map.getCenter()
          const latitude = nextCenter.getLat()
          const longitude = nextCenter.getLng()
          setAddressState('loading')
          reverseGeocode(latitude, longitude, 'manual', 'address')
            .then((nextRegion) => {
              if (cancelled) return
              onRegionChangeRef.current(nextRegion)
              setAddressState('idle')
            })
            .catch(() => {
              if (cancelled) return
              setAddressState('error')
            })
        })
        setMapState('ready')
      })
      .catch(() => {
        if (!cancelled) setMapState('error')
      })

    return () => {
      cancelled = true
      kakaoMapRef.current = null
    }
  }, [])

  return (
    <div className="address-map-picker">
      <button className="address-map-back" type="button" onClick={onBack}>
        <ArrowLeft size={17} />
        주소 검색으로 돌아가기
      </button>
      <div className="address-map-frame">
        <div ref={mapRef} className="address-map-canvas" />
        <span className="address-map-pin" aria-hidden="true">
          <MapPin size={40} />
        </span>
        {mapState === 'loading' && <p className="address-map-status">지도를 불러오는 중입니다.</p>}
        {mapState === 'error' && <p className="address-map-status is-error">지도를 불러오지 못했습니다.</p>}
      </div>
      <div className="address-map-meta">
        <strong>{addressState === 'loading' ? '주소 확인 중' : region.addressText}</strong>
        <span>{addressState === 'error' ? '지도를 조금 움직여 다시 확인해주세요.' : '지도를 움직여 핀 위치를 맞춰주세요.'}</span>
      </div>
    </div>
  )
}

export function CurrentLocationGlyph({ active = false }: { active?: boolean }) {
  return (
    <svg className={active ? 'is-active' : ''} width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="6.4" />
      <path d="M11 2.5v4.1M11 15.4v4.1M2.5 11h4.1M15.4 11h4.1" />
      <circle cx="11" cy="11" r="1.8" />
    </svg>
  )
}

function SampleRegion({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}>
      <MapPin size={17} />
      <span>
        <strong>{label}</strong>
        <small>검색어 입력</small>
      </span>
    </button>
  )
}
