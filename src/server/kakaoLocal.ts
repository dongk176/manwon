import type { LocationRegion, LocationSource } from '@/lib/location'

interface KakaoRegionDocument {
  region_type?: string
  code?: string
  address_name?: string
  region_1depth_name?: string
  region_2depth_name?: string
  region_3depth_name?: string
  x?: number | string
  y?: number | string
}

interface KakaoAddressDocument {
  address_name?: string
  x?: string
  y?: string
  address?: {
    region_1depth_name?: string
    region_2depth_name?: string
    region_3depth_name?: string
    b_code?: string
    h_code?: string
  } | null
}

interface KakaoCoordAddressDocument {
  address?: {
    address_name?: string
    region_1depth_name?: string
    region_2depth_name?: string
    region_3depth_name?: string
  } | null
  road_address?: {
    address_name?: string
    region_1depth_name?: string
    region_2depth_name?: string
    region_3depth_name?: string
  } | null
}

interface KakaoKeywordDocument {
  place_name?: string
  address_name?: string
  road_address_name?: string
  x?: string
  y?: string
}

type KakaoSearchMode = 'region' | 'address'

function getKakaoRestKey() {
  const key = process.env.KAKAO_LOCAL_REST_API_KEY ?? process.env.KAKAO_REST_API_KEY
  if (!key) throw new Error('KAKAO_LOCAL_UNAVAILABLE')
  return key
}

async function kakaoFetch<T>(path: string, params: URLSearchParams) {
  const response = await fetch(`https://dapi.kakao.com${path}?${params.toString()}`, {
    headers: {
      Authorization: `KakaoAK ${getKakaoRestKey()}`,
    },
  })

  if (!response.ok) throw new Error('KAKAO_LOCAL_REQUEST_FAILED')
  return (await response.json()) as T
}

export async function reverseKakaoRegion(latitude: number, longitude: number, source: LocationSource): Promise<LocationRegion> {
  const payload = await kakaoFetch<{ documents?: KakaoRegionDocument[] }>(
    '/v2/local/geo/coord2regioncode.json',
    new URLSearchParams({ x: String(longitude), y: String(latitude) }),
  )
  const document = payload.documents?.find((item) => item.region_type === 'H') ?? payload.documents?.[0]
  if (!document) throw new Error('KAKAO_REGION_NOT_FOUND')

  return {
    latitude,
    longitude,
    addressText: makeAddressText(document.region_1depth_name, document.region_2depth_name, document.region_3depth_name, document.address_name),
    region1Depth: document.region_1depth_name ?? '',
    region2Depth: document.region_2depth_name ?? '',
    region3Depth: document.region_3depth_name ?? '',
    regionCode: document.code ?? null,
    locationSource: source,
  }
}

export async function reverseKakaoAddress(latitude: number, longitude: number, source: LocationSource): Promise<LocationRegion> {
  const [addressPayload, region] = await Promise.all([
    kakaoFetch<{ documents?: KakaoCoordAddressDocument[] }>(
      '/v2/local/geo/coord2address.json',
      new URLSearchParams({ x: String(longitude), y: String(latitude) }),
    ),
    reverseKakaoRegion(latitude, longitude, source),
  ])
  const document = addressPayload.documents?.[0]
  const roadAddress = document?.road_address
  const address = document?.address
  const addressText = roadAddress?.address_name || address?.address_name || region.addressText

  return {
    ...region,
    addressText,
    region1Depth: roadAddress?.region_1depth_name || address?.region_1depth_name || region.region1Depth,
    region2Depth: roadAddress?.region_2depth_name || address?.region_2depth_name || region.region2Depth,
    region3Depth: roadAddress?.region_3depth_name || address?.region_3depth_name || region.region3Depth,
  }
}

export async function searchKakaoNeighborhoods(query: string, mode: KakaoSearchMode = 'region'): Promise<LocationRegion[]> {
  const [addressPayload, keywordPayload] = await Promise.all([
    kakaoFetch<{ documents?: KakaoAddressDocument[] }>('/v2/local/search/address.json', new URLSearchParams({ query, analyze_type: 'similar' })).catch(() => ({
      documents: [],
    })),
    kakaoFetch<{ documents?: KakaoKeywordDocument[] }>('/v2/local/search/keyword.json', new URLSearchParams({ query })).catch(() => ({ documents: [] })),
  ])

  const candidates = [
    ...(addressPayload.documents ?? []).map((item) => addressDocumentToCandidate(item)),
    ...(keywordPayload.documents ?? []).map((item) => keywordDocumentToCandidate(item)),
  ].filter((item): item is { latitude: number; longitude: number; addressText: string } => item !== null)

  const regions = await Promise.all(
    candidates.slice(0, 8).map((candidate) =>
      reverseKakaoRegion(candidate.latitude, candidate.longitude, 'manual')
        .then((region) => ({
          ...region,
          addressText: mode === 'address' ? candidate.addressText || region.addressText : region.addressText,
        }))
        .catch(() => ({
          ...candidate,
          region1Depth: '',
          region2Depth: '',
          region3Depth: candidate.addressText.split(' ').at(-1) ?? '',
          regionCode: null,
          locationSource: 'manual' as const,
        })),
    ),
  )

  const unique = new Map<string, LocationRegion>()
  for (const region of regions) {
    const key = mode === 'address'
      ? `${region.addressText}-${region.latitude}-${region.longitude}`
      : region.regionCode ?? `${region.region1Depth}-${region.region2Depth}-${region.region3Depth}-${region.latitude}-${region.longitude}`
    if (!unique.has(key)) unique.set(key, region)
  }

  return Array.from(unique.values()).slice(0, 6)
}

function addressDocumentToCandidate(document: KakaoAddressDocument) {
  const latitude = Number(document.y)
  const longitude = Number(document.x)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return {
    latitude,
    longitude,
    addressText: document.address_name ?? makeAddressText(
      document.address?.region_1depth_name,
      document.address?.region_2depth_name,
      document.address?.region_3depth_name,
    ),
  }
}

function keywordDocumentToCandidate(document: KakaoKeywordDocument) {
  const latitude = Number(document.y)
  const longitude = Number(document.x)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return {
    latitude,
    longitude,
    addressText: document.road_address_name || document.address_name || document.place_name || '',
  }
}

function makeAddressText(region1?: string, region2?: string, region3?: string, fallback?: string) {
  return [region1, region2, region3].filter(Boolean).join(' ') || fallback || ''
}
