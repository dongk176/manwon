import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import type { AuthSession, Conversation, DealStatus, Message, Profile, TaskPost } from '@/types/manwon'

const tokenKey = 'manwon.accessToken'
const expiryKey = 'manwon.expiresAt'

const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  'http://localhost:3000'

export async function saveSession(session: AuthSession) {
  await SecureStore.setItemAsync(tokenKey, session.accessToken)
  await SecureStore.setItemAsync(expiryKey, String(session.expiresAt))
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(tokenKey)
  await SecureStore.deleteItemAsync(expiryKey)
}

export async function getAccessToken() {
  const [token, expiresAt] = await Promise.all([
    SecureStore.getItemAsync(tokenKey),
    SecureStore.getItemAsync(expiryKey),
  ])
  if (!token) return null
  if (expiresAt && Number(expiresAt) * 1000 < Date.now()) {
    await clearSession()
    return null
  }
  return token
}

export async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const token = await getAccessToken()
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (!headers.has('content-type') && !(init.body instanceof FormData)) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
  })
  const payload = (await response.json()) as { ok: boolean; data?: T; error?: string }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? '요청에 실패했습니다.')
  }
  return payload.data as T
}

export async function login(input: { loginId: string; password: string }) {
  const result = await apiFetch<
    | { mode: 'signup_required'; resume?: boolean }
    | ({ mode: 'signed_in'; profile: Profile } & AuthSession)
  >('/api/auth/login/check', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (result.mode === 'signed_in') await saveSession(result)
  return result
}

export async function fetchSession() {
  return apiFetch<{ authenticated: boolean; userId?: string; profile: Profile | null }>('/api/auth/session')
}

export async function logout() {
  await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
  await clearSession()
}

export async function fetchTaskPosts(params: {
  postType?: 'request' | 'offer'
  statusScope?: 'open' | 'public'
  nearby?: boolean
  lat?: number
  lng?: number
  radiusM?: number
  category?: string
  maxPrice?: number
} = {}) {
  const query = new URLSearchParams()
  if (params.postType) query.set('post_type', params.postType)
  if (params.statusScope) query.set('status_scope', params.statusScope)
  if (params.nearby) query.set('nearby', 'true')
  if (params.lat !== undefined) query.set('lat', String(params.lat))
  if (params.lng !== undefined) query.set('lng', String(params.lng))
  if (params.radiusM !== undefined) query.set('radius_m', String(params.radiusM))
  if (params.category) query.set('category', params.category)
  if (params.maxPrice !== undefined) query.set('max_price', String(params.maxPrice))
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return apiFetch<TaskPost[]>(`/api/task-posts${suffix}`)
}

export function fetchTaskPost(postId: string) {
  return apiFetch<TaskPost>(`/api/task-posts/${encodeURIComponent(postId)}`)
}

export function createTaskPost(input: Partial<TaskPost> & {
  postType: 'request' | 'offer'
  title: string
  category: string
  description: string
  mode: 'nearby' | 'online' | 'both'
  price: number
}) {
  return apiFetch<TaskPost>('/api/task-posts', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function reopenTaskPost(postId: string) {
  return apiFetch<TaskPost>(`/api/task-posts/${encodeURIComponent(postId)}/reopen`, { method: 'POST' })
}

export function startConversationFromPost(postId: string, message?: string) {
  return apiFetch<Conversation>(`/api/task-posts/${encodeURIComponent(postId)}/start-chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

export function fetchConversations() {
  return apiFetch<Conversation[]>('/api/conversations')
}

export function fetchMessages(conversationId: string, after?: string | null) {
  const suffix = after ? `?after=${encodeURIComponent(after)}` : ''
  return apiFetch<Message[]>(`/api/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`)
}

export function markConversationRead(conversationId: string) {
  return apiFetch<{ readCount: number }>(`/api/conversations/${encodeURIComponent(conversationId)}/read`, { method: 'PATCH' })
}

export function sendTextMessage(conversationId: string, body: string, clientMessageId: string) {
  return apiFetch<Message>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ messageType: 'text', body, clientMessageId }),
  })
}

export function sendImageMessage(conversationId: string, imageUrl: string, clientMessageId: string) {
  return apiFetch<Message>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ messageType: 'image', imageUrl, clientMessageId }),
  })
}

export async function uploadImageFile(input: { uri: string; fileName?: string | null; mimeType?: string | null; target: 'task-post' | 'profile-avatar' | 'chat-message' }) {
  const formData = new FormData()
  formData.append('target', input.target)
  formData.append('file', {
    uri: input.uri,
    name: input.fileName ?? `upload-${Date.now()}.jpg`,
    type: input.mimeType ?? 'image/jpeg',
  } as unknown as Blob)
  return apiFetch<{ imageUrl: string; storageKey: string }>('/api/uploads/image', {
    method: 'POST',
    body: formData,
  })
}

export function updateDealStatus(dealId: string, status: DealStatus) {
  return apiFetch(`/api/deals/${encodeURIComponent(dealId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function updateApplicationStatus(applicationId: string, status: 'accepted' | 'rejected' | 'cancelled') {
  return apiFetch(`/api/applications/${encodeURIComponent(applicationId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function fetchRealtimeToken() {
  return apiFetch<{ token: string; expiresIn: number }>('/api/realtime/token')
}

export function registerPushToken(input: { platform: 'ios' | 'android'; fcmToken: string; deviceId?: string | null; appVersion?: string | null }) {
  return apiFetch('/api/devices/push-token', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
