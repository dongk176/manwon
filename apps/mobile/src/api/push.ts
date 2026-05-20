import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import messaging from '@react-native-firebase/messaging'
import { registerPushToken } from '@/api/client'

export async function registerDeviceForPush() {
  const status = await messaging().requestPermission()
  const enabled =
    status === messaging.AuthorizationStatus.AUTHORIZED ||
    status === messaging.AuthorizationStatus.PROVISIONAL

  if (!enabled) return null

  const fcmToken = await messaging().getToken()
  const deviceId = Platform.OS === 'ios'
    ? await Application.getIosIdForVendorAsync()
    : Application.getAndroidId()

  await registerPushToken({
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    fcmToken,
    deviceId,
    appVersion: Constants.expoConfig?.version ?? null,
  })

  return fcmToken
}

export function subscribeForegroundPush(onMessage: (payload: { title: string; body: string; data: Record<string, string> }) => void) {
  return messaging().onMessage(async (message) => {
    onMessage({
      title: message.notification?.title ?? '만원부탁소',
      body: message.notification?.body ?? '',
      data: Object.fromEntries(Object.entries(message.data ?? {}).map(([key, value]) => [key, String(value)])),
    })
  })
}
