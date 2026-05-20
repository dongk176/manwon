import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: '만원부탁소',
  slug: 'manwon',
  scheme: 'manwon',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.manwon.app',
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription: '게시글과 채팅에 사진을 첨부하기 위해 카메라 접근이 필요합니다.',
      NSPhotoLibraryUsageDescription: '게시글과 채팅에 사진을 첨부하기 위해 사진 접근이 필요합니다.',
      NSLocationWhenInUseUsageDescription: '내 주변 부탁을 보여주기 위해 현재 위치 접근이 필요합니다.',
    },
  },
  android: {
    package: 'com.manwon.app',
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA', 'POST_NOTIFICATIONS'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-location',
    'expo-image-picker',
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
  ],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    kakaoNativeAppKey: process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY,
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    },
  },
}

export default config
