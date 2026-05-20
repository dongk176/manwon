# 만원부탁소 Mobile

React Native + Expo Dev Build 기반 iOS/Android 앱입니다.

## Local

```bash
pnpm --dir apps/mobile install
pnpm mobile:ios
```

필수 환경변수는 `.env.example`을 기준으로 설정합니다.

- `EXPO_PUBLIC_API_BASE_URL`: Next API 서버 주소. iOS 시뮬레이터는 `http://localhost:3000`, 실기기는 Mac LAN IP 사용.
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY`

푸시는 Firebase Console에서 iOS/Android 앱을 만들고 APNs key를 연결한 뒤 `GoogleService-Info.plist`, `google-services.json`을 Dev Build에 포함해야 합니다.

Kakao 지도는 `KakaoMapView` 어댑터를 통해 붙이도록 분리해두었습니다. 현재 구현은 앱 화면/바텀시트 검증용 fallback이며, 실제 SDK bridge는 native prebuild 단계에서 연결합니다.
