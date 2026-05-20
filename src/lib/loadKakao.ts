export interface KakaoMapsApi {
  maps: {
    load: (callback: () => void) => void
    LatLng: new (lat: number, lng: number) => KakaoLatLng
    Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap
    Marker: new (options: { position: KakaoLatLng; map?: KakaoMap }) => KakaoMarker
    CustomOverlay: new (options: { position: KakaoLatLng; content: HTMLElement | string; yAnchor?: number; xAnchor?: number }) => KakaoCustomOverlay
    event: {
      addListener: (target: unknown, event: string, handler: () => void) => void
    }
  }
}

export interface KakaoLatLng {
  getLat: () => number
  getLng: () => number
}

export interface KakaoMap {
  getCenter: () => KakaoLatLng
  relayout: () => void
  setCenter: (latlng: KakaoLatLng) => void
  setLevel: (level: number) => void
}

export interface KakaoMarker {
  setMap: (map: KakaoMap | null) => void
}

export interface KakaoCustomOverlay {
  setMap: (map: KakaoMap | null) => void
}

type KakaoWindow = Window & {
  kakao?: KakaoMapsApi
}

let kakaoReady: Promise<KakaoMapsApi> | null = null

export function loadKakao(): Promise<KakaoMapsApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('SSR'))
  }

  const w = window as KakaoWindow
  if (w.kakao?.maps) return Promise.resolve(w.kakao)

  if (!kakaoReady) {
    kakaoReady = new Promise((resolve, reject) => {
      const appkey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY
      if (!appkey) return reject(new Error('Missing NEXT_PUBLIC_KAKAO_MAP_KEY'))

      const id = 'kakao-maps-sdk'
      if (document.getElementById(id)) {
        const existingKakao = w.kakao
        if (!existingKakao?.maps) {
          reject(new Error('Kakao SDK is not ready'))
          return
        }
        existingKakao.maps.load(() => resolve(existingKakao))
        return
      }

      const script = document.createElement('script')
      script.id = id
      script.async = true
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appkey}&autoload=false&libraries=services`
      script.onload = () => {
        const loadedKakao = w.kakao
        if (!loadedKakao?.maps) {
          reject(new Error('Kakao SDK load failed'))
          return
        }
        loadedKakao.maps.load(() => resolve(loadedKakao))
      }
      script.onerror = () => reject(new Error('Kakao SDK load failed'))
      document.head.appendChild(script)
    })
  }

  return kakaoReady
}
