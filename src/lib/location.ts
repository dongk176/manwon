'use client'

export type LocationPermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unavailable'
export type LocationSource = 'gps' | 'manual'

export interface LocationRegion {
  latitude: number
  longitude: number
  addressText: string
  region1Depth: string
  region2Depth: string
  region3Depth: string
  regionCode: string | null
  locationSource: LocationSource
}

const locationStorageKey = 'manwon_selected_region'

export function getStoredLocationRegion() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(locationStorageKey)
    if (!raw) return null
    return parseLocationRegion(JSON.parse(raw))
  } catch {
    return null
  }
}

export function storeLocationRegion(region: LocationRegion) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(locationStorageKey, JSON.stringify(region))
  } catch {
    // localStorage is optional for this flow.
  }
}

export async function getLocationPermissionState(): Promise<LocationPermissionState> {
  if (typeof window === 'undefined' || !navigator.geolocation) return 'unavailable'
  if (!navigator.permissions?.query) return 'unknown'

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    if (status.state === 'granted') return 'granted'
    if (status.state === 'denied') return 'denied'
    return 'prompt'
  } catch {
    return 'unknown'
  }
}

export function requestBrowserLocation(): Promise<{ latitude: number; longitude: number }> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('위치 기능을 사용할 수 없는 환경입니다.'))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      () => reject(new Error('위치 권한이 꺼져 있어요. 동네를 직접 선택하거나 설정에서 위치 권한을 허용해주세요.')),
      {
        enableHighAccuracy: true,
        timeout: 9000,
        maximumAge: 1000 * 60 * 5,
      },
    )
  })
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
  source: LocationSource,
  mode: 'region' | 'address' = 'region',
): Promise<LocationRegion> {
  const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude), source, mode })
  const response = await fetch(`/api/location/reverse?${params.toString()}`)
  const payload = (await response.json()) as { ok: boolean; data?: LocationRegion; error?: string }
  if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error ?? '동네 정보를 찾지 못했습니다.')
  return payload.data
}

export async function searchNeighborhoods(query: string): Promise<LocationRegion[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const response = await fetch(`/api/location/search?q=${encodeURIComponent(trimmed)}`)
  const payload = (await response.json()) as { ok: boolean; data?: LocationRegion[]; error?: string }
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? '동네 검색에 실패했습니다.')
  return payload.data ?? []
}

export async function searchAddresses(query: string): Promise<LocationRegion[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const response = await fetch(`/api/location/search?q=${encodeURIComponent(trimmed)}&mode=address`)
  const payload = (await response.json()) as { ok: boolean; data?: LocationRegion[]; error?: string }
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? '주소 검색에 실패했습니다.')
  return payload.data ?? []
}

export function formatRegionFull(region: LocationRegion | null) {
  if (!region) return '동네 선택'
  return [region.region1Depth, region.region2Depth, region.region3Depth].filter(Boolean).join(' ') || region.addressText
}

export function formatRegionShort(region: LocationRegion | null) {
  if (!region) return '동네 선택'
  return region.region3Depth || region.region2Depth || region.addressText
}

export function toNeighborhoodRegion(region: LocationRegion): LocationRegion {
  return {
    ...region,
    addressText: formatRegionFull(region),
  }
}

export function getApproximateCoordinate(latitude: number, longitude: number, seed: string, radiusMeters = 180) {
  const hash = Array.from(seed).reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const angle = (hash % 360) * (Math.PI / 180)
  const distance = 100 + (hash % Math.max(1, radiusMeters - 99))
  const latOffset = (Math.cos(angle) * distance) / 111_320
  const lngOffset = (Math.sin(angle) * distance) / (111_320 * Math.cos((latitude * Math.PI) / 180))

  return {
    latitude: latitude + latOffset,
    longitude: longitude + lngOffset,
  }
}

function parseLocationRegion(value: unknown): LocationRegion | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.latitude !== 'number' || typeof record.longitude !== 'number') return null
  if (typeof record.addressText !== 'string') return null

  return {
    latitude: record.latitude,
    longitude: record.longitude,
    addressText: record.addressText,
    region1Depth: typeof record.region1Depth === 'string' ? record.region1Depth : '',
    region2Depth: typeof record.region2Depth === 'string' ? record.region2Depth : '',
    region3Depth: typeof record.region3Depth === 'string' ? record.region3Depth : '',
    regionCode: typeof record.regionCode === 'string' ? record.regionCode : null,
    locationSource: record.locationSource === 'gps' ? 'gps' : 'manual',
  }
}
