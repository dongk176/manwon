import { Stack, router } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { Alert } from 'react-native'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { registerDeviceForPush, subscribeForegroundPush } from '@/api/push'

export default function RootLayout() {
  const queryClient = useMemo(() => new QueryClient(), [])

  useEffect(() => {
    registerDeviceForPush().catch(() => undefined)
    const unsubscribe = subscribeForegroundPush((payload) => {
      Alert.alert(payload.title, payload.body || undefined, [
        { text: '닫기', style: 'cancel' },
        {
          text: '열기',
          onPress: () => {
            if (payload.data.conversationId) router.push(`/chat/${payload.data.conversationId}`)
            else if (payload.data.postId) router.push(`/posts/${payload.data.postId}`)
          },
        },
      ])
    })
    return unsubscribe
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" />
          <Stack.Screen name="posts/[id]" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="nearby/[postId]" />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  )
}
