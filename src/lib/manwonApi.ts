'use client'

import { categories, type IllustrationType, type PostStatus, type RequestMode, type RequestPost, type TradeStatus } from '@/data/mockData'
import type { LocationPermissionState } from '@/lib/location'

export interface ApiTaskPost {
  id: string
  creatorId: string
  creatorProfileId?: string | null
  postType: 'request' | 'offer'
  title: string
  category: string
  categoryDetail: string | null
  description: string
  mode: RequestMode
  price: number
  deadlineAt: string | null
  deadlineText?: string | null
  availableTimeText: string | null
  genderVisibility: 'private' | 'male' | 'female'
  receiptRequired?: boolean
  photoProofRequired?: boolean
  locationSource?: 'gps' | 'manual' | null
  serviceScope?: string[]
  experienceSummary?: string | null
  careerSummary?: string | null
  portfolioUrl?: string | null
  portfolioLinks?: Array<{ title: string; url: string }>
  responseTimeText?: string | null
  responseTime?: string | null
  trustExampleImages?: Array<{ imageUrl: string; storageKey: string; sortOrder: number }>
  workSampleImages?: Array<{ imageUrl: string; storageKey: string; sortOrder: number }>
  status: PostStatus
  capacityType?: 'unlimited' | 'limited'
  capacityLimit?: number | null
  closedReason?: 'capacity_full' | 'manual' | null
  occupiedCount?: number | null
  activeChatCount?: number | null
  favoriteCount?: number | null
  remainingCount?: number | null
  recruitmentRound?: number | null
  latestDealId?: string | null
  latestDealStatus?: 'pending' | 'accepted' | 'in_progress' | 'complete_requested' | 'completed' | 'cancelled' | 'disputed' | null
  latestDealCancelledBy?: string | null
  viewerApplicationId?: string | null
  viewerApplicationStatus?: 'applied' | 'accepted' | 'rejected' | 'cancelled' | null
  viewerConversationId?: string | null
  viewerDealId?: string | null
  viewerDealStatus?: 'pending' | 'accepted' | 'in_progress' | 'complete_requested' | 'completed' | 'cancelled' | 'disputed' | null
  addressText: string | null
  region1depth?: string | null
  region2depth?: string | null
  region3depth?: string | null
  regionCode?: string | null
  latitude: number | null
  longitude: number | null
  distanceMeters?: number | null
  images?: Array<{ id: string; imageUrl: string; storageKey: string; sortOrder: number }>
  creatorNickname?: string | null
  creatorAvatarUrl?: string | null
  creatorDefaultAvatarKey?: string | null
  creatorBio?: string | null
  creatorGender?: 'male' | 'female' | 'unknown' | 'private' | null
  creatorPhoneVerified?: boolean | null
  creatorIdentityVerified?: boolean | null
  creatorRatingAvg?: number | string | null
  creatorReviewCount?: number | null
  creatorCompletedCount?: number | null
  creatorCareerSummary?: string | null
  creatorCareerDescription?: string | null
  creatorPortfolioLinks?: Array<{ title: string; url: string }> | null
  creatorWorkSampleImages?: Array<{ imageUrl: string; storageKey?: string; sortOrder?: number }> | null
  creatorResponseTime?: string | null
  isFavorited?: boolean | null
}

export interface CreateTaskPostPayload {
  profileId: string
  postType: 'request' | 'offer'
  title: string
  category: string
  categoryDetail?: string | null
  description: string
  mode: RequestMode
  price: number
  deadlineAt?: string | null
  deadlineText?: string | null
  availableTimeText?: string | null
  genderVisibility?: 'private' | 'male' | 'female'
  receiptRequired?: boolean
  photoProofRequired?: boolean
  locationSource?: 'gps' | 'manual' | null
  serviceScope?: string[]
  experienceSummary?: string | null
  careerSummary?: string | null
  portfolioUrl?: string | null
  portfolioLinks?: Array<{ title: string; url: string }>
  responseTimeText?: string | null
  responseTime?: string | null
  capacityType?: 'unlimited' | 'limited'
  capacityLimit?: number | null
  closedReason?: 'capacity_full' | 'manual' | null
  addressText?: string | null
  region1Depth?: string | null
  region2Depth?: string | null
  region3Depth?: string | null
  regionCode?: string | null
  latitude?: number | null
  longitude?: number | null
  distanceVisible?: boolean
  images?: Array<{ imageUrl: string; storageKey: string; sortOrder: number }>
  trustExampleImages?: Array<{ imageUrl: string; storageKey: string; sortOrder: number }>
  workSampleImages?: Array<{ imageUrl: string; storageKey: string; sortOrder: number }>
}

export interface ApiConversation {
  id: string
  dealId: string | null
  postId: string | null
  requesterId: string
  helperId: string
  requesterProfileId?: string | null
  helperProfileId?: string | null
  lastMessage: string | null
  lastMessageAt: string | null
  postTitle?: string | null
  postCategory?: string | null
  postPrice?: number | null
  postStatus?: ApiTaskPost['status'] | null
  postCreatorId?: string | null
  postType?: ApiTaskPost['postType'] | null
  dealStatus?: 'pending' | 'accepted' | 'in_progress' | 'complete_requested' | 'completed' | 'cancelled' | 'disputed' | null
  dealCompletedAt?: string | null
  dealReportedAt?: string | null
  dealReportedBy?: string | null
  dealReportedUserId?: string | null
  dealReportReason?: string | null
  dealReportDescription?: string | null
  dealChatBlockedAt?: string | null
  appointmentMode?: 'online' | 'in_person' | null
  appointmentScheduledAt?: string | null
  appointmentLocationText?: string | null
  appointmentCreatedBy?: string | null
  appointmentUpdatedBy?: string | null
  appointmentSetAt?: string | null
  applicationId?: string | null
  applicationStatus?: 'applied' | 'accepted' | 'rejected' | 'cancelled' | null
  applicationApplicantId?: string | null
  requesterNickname?: string | null
  helperNickname?: string | null
  requesterAvatarUrl?: string | null
  helperAvatarUrl?: string | null
  requesterBio?: string | null
  helperBio?: string | null
  otherUserId?: string | null
  otherNickname?: string | null
  otherAvatarUrl?: string | null
  otherDefaultAvatarKey?: string | null
  otherBio?: string | null
  otherGender?: 'male' | 'female' | 'unknown' | 'private' | null
  otherRatingAvg?: number | string | null
  otherReviewCount?: number | null
  otherCompletedCount?: number | null
  otherPhoneVerified?: boolean | null
  otherIdentityVerified?: boolean | null
  otherCareerSummary?: string | null
  otherCareerDescription?: string | null
  otherPortfolioLinks?: Array<{ title: string; url: string }> | null
  otherWorkSampleImages?: Array<{ imageUrl: string; storageKey?: string; sortOrder?: number }> | null
  otherResponseTime?: string | null
  hasChatAfterStarted?: boolean | null
  myReviewId?: string | null
  unreadCount?: number | null
}

export interface ApiUserReview {
  id: string
  dealId?: string | null
  reviewerId: string
  revieweeId: string
  reviewerNickname?: string | null
  reviewerAvatarUrl?: string | null
  reviewerDefaultAvatarKey?: string | null
  rating: number
  content?: string | null
  createdAt: string
  postTitle?: string | null
}

export interface ActivityProfile {
  id: string
  userId: string
  avatarUrl: string | null
  defaultAvatarKey: string | null
  nickname: string
  bio: string
  activityMode: RequestMode
  addressText: string | null
  region1depth?: string | null
  region1Depth?: string | null
  region2depth?: string | null
  region2Depth?: string | null
  region3depth?: string | null
  region3Depth?: string | null
  regionCode?: string | null
  latitude: number | null
  longitude: number | null
  careerSummary: string | null
  careerDescription: string | null
  portfolioLinks: Array<{ title: string; url: string }>
  workSampleImages: Array<{ imageUrl: string; storageKey: string; sortOrder: number }>
  availableTimeText: string | null
  basePrice: number | null
  isActive: boolean
  gender?: 'male' | 'female' | 'unknown' | 'private' | null
  phoneVerified?: boolean | null
  identityVerified?: boolean | null
  ratingAvg?: number | string | null
  reviewCount?: number | null
  completedCount?: number | null
  isDefault?: boolean | null
  createdAt?: string
  updatedAt?: string
}

export function getDefaultProfileImageByGender(gender?: string | null) {
  if (gender === 'male') return '/profile/man.png'
  if (gender === 'female') return '/profile/woman.png'
  return null
}

export function isDefaultActivityProfile(profile: Pick<ActivityProfile, 'id' | 'userId' | 'isDefault'>) {
  return profile.isDefault === true || Boolean(profile.id && profile.userId && profile.id === profile.userId)
}

export type ActivityProfilePayload = {
  avatarUrl?: string | null
  defaultAvatarKey?: string | null
  nickname: string
  bio: string
  activityMode: RequestMode
  addressText?: string | null
  region1Depth?: string | null
  region2Depth?: string | null
  region3Depth?: string | null
  regionCode?: string | null
  latitude?: number | null
  longitude?: number | null
  careerSummary?: string | null
  careerDescription?: string | null
  portfolioLinks?: Array<{ title: string; url: string }>
  workSampleImages?: Array<{ imageUrl: string; storageKey: string; sortOrder: number }>
  availableTimeText?: string | null
  basePrice?: number | null
}

export interface ApiMessage {
  id: string
  conversationId: string
  senderId: string
  messageType: 'text' | 'image' | 'system'
  body: string | null
  imageUrl: string | null
  clientMessageId?: string | null
  deliveredAt?: string | null
  readAt: string | null
  createdAt: string
}

const userIdStorageKey = 'manwon_user_id'
const nicknameStorageKey = 'manwon_nickname'
const accessTokenStorageKey = 'manwon_access_token'
const phoneVerificationRequiredMessage = '휴대폰 인증 후 이용할 수 있습니다.'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function isPhoneVerificationRequired(error: unknown) {
  return error instanceof ApiError && error.status === 403 && error.message === phoneVerificationRequiredMessage
}

export function getCurrentUserId() {
  if (typeof window === 'undefined') return null
  try {
    const existing = window.localStorage.getItem(userIdStorageKey)
    if (existing) return existing

    const nextId = crypto.randomUUID()
    window.localStorage.setItem(userIdStorageKey, nextId)
    window.localStorage.setItem(nicknameStorageKey, '만부탁이')
    return nextId
  } catch {
    return crypto.randomUUID()
  }
}

function getCurrentAccessToken() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(accessTokenStorageKey)
  } catch {
    return null
  }
}

function getResponseAccessToken(value: Record<string, unknown>) {
  return typeof value.accessToken === 'string' ? value.accessToken : undefined
}

export function setCurrentUserId(userId: string, nickname = '만부탁이', accessToken?: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(userIdStorageKey, userId)
    window.localStorage.setItem(nicknameStorageKey, nickname)
    if (accessToken) window.localStorage.setItem(accessTokenStorageKey, accessToken)
  } catch {
    // Local storage can be unavailable in private contexts.
  }
}

export function clearCurrentUserId() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(userIdStorageKey)
    window.localStorage.removeItem(nicknameStorageKey)
    window.localStorage.removeItem(accessTokenStorageKey)
  } catch {
    // Local storage can be unavailable in private contexts.
  }
}

function getAuthHeaders() {
  const headers = new Headers()
  const userId = getCurrentUserId()
  if (userId) headers.set('x-manwon-user-id', userId)
  const accessToken = getCurrentAccessToken()
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`)

  if (typeof window !== 'undefined') {
    try {
      headers.set('x-manwon-nickname', encodeURIComponent(window.localStorage.getItem(nicknameStorageKey) ?? '만부탁이'))
    } catch {
      headers.set('x-manwon-nickname', encodeURIComponent('만부탁이'))
    }
  }

  return headers
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = getAuthHeaders()
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
  const isFormDataBody = typeof FormData !== 'undefined' && init?.body instanceof FormData
  if (!isFormDataBody && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers,
  })
  const payload = (await response.json()) as { ok: boolean; data?: T; error?: string }
  if (!response.ok || !payload.ok) {
    throw new ApiError(payload.error ?? 'API 요청에 실패했습니다.', response.status)
  }
  return payload.data as T
}

export async function fetchTaskPosts(params: {
  postType?: 'request' | 'offer'
  statusScope?: 'open' | 'public'
  category?: string
  categoryDetail?: string
  mode?: RequestMode
  nearby?: boolean
  lat?: number
  lng?: number
  radiusM?: number
  maxPrice?: number
} = {}) {
  const query = new URLSearchParams()
  if (params.postType) query.set('post_type', params.postType)
  if (params.statusScope) query.set('status_scope', params.statusScope)
  if (params.category && params.category !== '전체') query.set('category', params.category)
  if (params.categoryDetail) query.set('category_detail', params.categoryDetail)
  if (params.mode) query.set('mode', params.mode)
  if (params.nearby) query.set('nearby', 'true')
  if (params.lat !== undefined) query.set('lat', String(params.lat))
  if (params.lng !== undefined) query.set('lng', String(params.lng))
  if (params.maxPrice !== undefined) query.set('max_price', String(params.maxPrice))
  if (params.radiusM !== undefined) query.set('radius_m', String(params.radiusM))

  return apiFetch<ApiTaskPost[]>(`/api/task-posts?${query.toString()}`)
}

export async function fetchTaskPost(id: string) {
  return apiFetch<ApiTaskPost>(`/api/task-posts/${id}`)
}

export async function fetchActivityProfiles() {
  return apiFetch<ActivityProfile[]>('/api/activity-profiles')
}

export async function checkActivityProfileNickname(nickname: string, excludeId?: string | null) {
  const query = new URLSearchParams({ nickname })
  if (excludeId) query.set('excludeId', excludeId)
  return apiFetch<{ available: boolean; nickname: string }>(`/api/activity-profiles/nickname?${query.toString()}`)
}

export async function createActivityProfile(payload: ActivityProfilePayload) {
  return apiFetch<ActivityProfile>('/api/activity-profiles', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateActivityProfile(profileId: string, payload: Partial<ActivityProfilePayload>) {
  return apiFetch<ActivityProfile>(`/api/activity-profiles/${encodeURIComponent(profileId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deactivateActivityProfile(profileId: string) {
  return apiFetch<ActivityProfile>(`/api/activity-profiles/${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
  })
}

export async function createTaskPost(payload: CreateTaskPostPayload) {
  return apiFetch<ApiTaskPost>('/api/task-posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateTaskPost(postId: string, payload: Partial<CreateTaskPostPayload> & { status?: PostStatus }) {
  return apiFetch<ApiTaskPost>(`/api/task-posts/${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteTaskPost(postId: string) {
  return apiFetch<ApiTaskPost>(`/api/task-posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
  })
}

export async function reopenTaskPost(postId: string) {
  return apiFetch<ApiTaskPost>(`/api/task-posts/${encodeURIComponent(postId)}/reopen`, {
    method: 'POST',
  })
}

export async function presignImageUpload(file: File, target: 'task-post' | 'profile-avatar' | 'chat-message') {
  return apiFetch<{ uploadUrl: string; publicUrl: string; storageKey: string; expiresIn: number }>('/api/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({
      target,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    }),
  })
}

export async function uploadImageFile(file: File, target: 'task-post' | 'profile-avatar' | 'chat-message') {
  const formData = new FormData()
  formData.set('target', target)
  formData.set('file', file)

  return apiFetch<{ imageUrl: string; storageKey: string }>('/api/uploads/image', {
    method: 'POST',
    body: formData,
  })
}

export function getDisplayImageUrl(image: { imageUrl?: string | null; storageKey?: string | null } | null | undefined) {
  if (!image) return undefined
  if (image.storageKey) return getStorageImageProxyUrl(image.storageKey)
  return normalizeDisplayImageUrl(image.imageUrl)
}

export function normalizeDisplayImageUrl(value?: string | null) {
  const imageUrl = value?.trim()
  if (!imageUrl) return undefined

  const storageKey = inferImageStorageKey(imageUrl)
  if (storageKey) return getStorageImageProxyUrl(storageKey)
  return normalizeRemoteImageUrl(imageUrl)
}

function normalizeRemoteImageUrl(imageUrl: string) {
  try {
    const url = new URL(imageUrl)
    if (url.protocol === 'http:' && isKakaoImageHost(url.hostname)) {
      url.protocol = 'https:'
      return url.toString()
    }
  } catch {
    return imageUrl
  }
  return imageUrl
}

function isKakaoImageHost(hostname: string) {
  const host = hostname.toLowerCase()
  return host === 'k.kakaocdn.net' || host.endsWith('.kakaocdn.net')
}

function getStorageImageProxyUrl(storageKey: string) {
  return `/api/uploads/image?key=${encodeURIComponent(storageKey)}`
}

function inferImageStorageKey(value: string) {
  const directKey = normalizeImageStorageKey(value)
  if (directKey) return directKey

  try {
    const url = new URL(value)
    return normalizeImageStorageKey(url.pathname)
  } catch {
    return null
  }
}

function normalizeImageStorageKey(value: string) {
  const normalized = value.replace(/^\/+/, '')
  const keyStart = normalized.indexOf('manwon/')
  if (keyStart < 0) return null
  const key = normalized.slice(keyStart)
  if (!key.startsWith('manwon/')) return null
  if (key.includes('..')) return null
  if (!/\.(jpe?g|png|webp)$/i.test(key)) return null
  return key
}

export async function fetchConversations() {
  return apiFetch<ApiConversation[]>('/api/conversations')
}

export async function fetchUserReviews(userId: string) {
  return apiFetch<ApiUserReview[]>(`/api/users/${encodeURIComponent(userId)}/reviews`)
}

export async function startConversationFromPost(postId: string, profileId: string, message?: string) {
  return apiFetch<ApiConversation>(`/api/task-posts/${postId}/start-chat`, {
    method: 'POST',
    body: JSON.stringify({ profileId, message }),
  })
}

export async function fetchMessages(conversationId: string, after?: string | null) {
  const query = new URLSearchParams()
  if (after) query.set('after', after)
  const queryString = query.toString()
  const suffix = queryString ? `?${queryString}` : ''
  return apiFetch<ApiMessage[]>(`/api/conversations/${conversationId}/messages${suffix}`)
}

export async function markConversationRead(conversationId: string, lastMessageId?: string | null) {
  return apiFetch<{ readCount: number }>(`/api/conversations/${conversationId}/read`, {
    method: 'PATCH',
    body: JSON.stringify({ lastMessageId: lastMessageId ?? null }),
  })
}

export async function sendConversationMessage(conversationId: string, body: string, clientMessageId?: string) {
  return apiFetch<ApiMessage>(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ messageType: 'text', body, clientMessageId }),
  })
}

export async function fetchRealtimeToken() {
  return apiFetch<{ token: string; expiresIn: number; websocketUrl?: string }>('/api/realtime/token')
}

export async function updateApplicationStatus(applicationId: string, status: 'accepted' | 'rejected' | 'cancelled') {
  return apiFetch(`/api/applications/${applicationId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function updateDealStatus(
  dealId: string,
  status: 'pending' | 'accepted' | 'in_progress' | 'complete_requested' | 'completed' | 'cancelled' | 'disputed',
  options?: {
    reportReason?: string | null
    reportDescription?: string | null
  },
) {
  return apiFetch(`/api/deals/${dealId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...options }),
  })
}

export async function updateConversationAppointment(
  conversationId: string,
  input: {
    mode: 'online' | 'in_person'
    scheduledAt: string
    locationText?: string | null
  },
) {
  return apiFetch(`/api/conversations/${conversationId}/appointment`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function fetchMyPage() {
  return apiFetch<Record<string, unknown>>('/api/me/profile')
}

export async function requestPhoneVerification(phone: string) {
  return apiFetch<{ phone: string; ttlSeconds: number }>('/api/phone-verifications/request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  })
}

export async function confirmPhoneVerification(phone: string, code: string) {
  return apiFetch<Record<string, unknown>>('/api/phone-verifications/confirm', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  })
}

export async function requestLoginOtp(phone: string) {
  return apiFetch<{ phone: string; ttlSeconds: number }>('/api/auth/login/request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  })
}

export async function confirmLoginOtp(phone: string, code: string) {
  const profile = await apiFetch<Record<string, unknown>>('/api/auth/login/confirm', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  })
  if (typeof profile.id === 'string') {
    setCurrentUserId(profile.id, typeof profile.nickname === 'string' ? profile.nickname : '만부탁이', getResponseAccessToken(profile))
  }
  return profile
}

export async function checkLoginCredential(input: { loginId: string; password: string }) {
  const result = await apiFetch<
    | { mode: 'signup_required'; resume?: boolean }
    | { mode: 'signed_in'; profile: Record<string, unknown>; accessToken?: string }
  >('/api/auth/login/check', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  if (result.mode === 'signed_in' && typeof result.profile.id === 'string') {
    setCurrentUserId(result.profile.id, typeof result.profile.nickname === 'string' ? result.profile.nickname : '만부탁이', result.accessToken)
  }

  return result
}

export async function checkSignupLoginId(loginId: string) {
  return apiFetch<{ available: boolean }>('/api/auth/signup/check-id', {
    method: 'POST',
    body: JSON.stringify({ loginId }),
  })
}

export async function requestLoginIdRecovery(phone: string) {
  return apiFetch<{ phone: string; ttlSeconds: number }>('/api/auth/recovery/login-id/request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  })
}

export async function confirmLoginIdRecovery(phone: string, code: string) {
  return apiFetch<{ phone: string; loginId: string }>('/api/auth/recovery/login-id/confirm', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  })
}

export async function requestPasswordRecovery(loginId: string, phone: string) {
  return apiFetch<{ phone: string; ttlSeconds: number }>('/api/auth/recovery/password/request', {
    method: 'POST',
    body: JSON.stringify({ loginId, phone }),
  })
}

export async function resetPasswordWithRecovery(input: { loginId: string; phone: string; code: string; password: string }) {
  return apiFetch<{ success: boolean }>('/api/auth/recovery/password/reset', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export interface SignupOnboardingPayload {
  loginId: string
  password: string
  name: string
  gender: 'male' | 'female'
  birthDate: string
  phone: string
  agreements: {
    terms: boolean
    privacy: boolean
    marketing: boolean
  }
}

export async function requestSignupOtp(input: SignupOnboardingPayload) {
  return apiFetch<{ phone: string; ttlSeconds: number }>('/api/auth/signup/request', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function verifySignupOtp(input: SignupOnboardingPayload & { code: string }) {
  return apiFetch<{ phone: string; verified: boolean }>('/api/auth/signup/verify', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function completeSignup(input: SignupOnboardingPayload) {
  const profile = await apiFetch<Record<string, unknown>>('/api/auth/signup/complete', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (typeof profile.id === 'string') {
    setCurrentUserId(profile.id, typeof profile.nickname === 'string' ? profile.nickname : '만부탁이', getResponseAccessToken(profile))
  }
  return profile
}

export async function confirmSignupOtp(input: SignupOnboardingPayload & { code: string }) {
  const profile = await apiFetch<Record<string, unknown>>('/api/auth/signup/confirm', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (typeof profile.id === 'string') {
    setCurrentUserId(profile.id, typeof profile.nickname === 'string' ? profile.nickname : '만부탁이', getResponseAccessToken(profile))
  }
  return profile
}

export async function acceptRequiredLegalAgreements(input: { terms: boolean; privacy: boolean; marketing?: boolean }) {
  return apiFetch<Record<string, unknown>>('/api/me/legal-agreements', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchAuthSession() {
  const headers = getAuthHeaders()
  headers.set('content-type', 'application/json')
  const response = await fetch('/api/auth/session', {
    cache: 'no-store',
    credentials: 'same-origin',
    headers,
  })
  const payload = (await response.json()) as {
    ok: boolean
    data?: { authenticated: boolean; userId?: string; profile: Record<string, unknown> | null }
    error?: string
  }
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? '로그인 상태를 확인하지 못했습니다.')
  const session = payload.data as { authenticated: boolean; userId?: string; profile: Record<string, unknown> | null }
  if (session.authenticated && session.userId) {
    setCurrentUserId(session.userId, typeof session.profile?.nickname === 'string' ? session.profile.nickname : '만부탁이')
  } else {
    clearCurrentUserId()
  }
  return session
}

export async function logout() {
  const result = await apiFetch<{ success: boolean }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  clearCurrentUserId()
  return result
}

export async function withdrawAccount() {
  const result = await apiFetch<{ success: boolean; withdrawnAt: string }>('/api/me/withdraw', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  clearCurrentUserId()
  return result
}

export async function saveMyLocationPreference(input: {
  latitude?: number | null
  longitude?: number | null
  region1Depth?: string | null
  region2Depth?: string | null
  region3Depth?: string | null
  permissionStatus: LocationPermissionState
}) {
  return apiFetch<Record<string, unknown>>('/api/me/location-preference', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function fetchMyActivity() {
  return apiFetch<{
    myPosts: ApiTaskPost[]
    requestDeals: unknown[]
    helpedDeals: unknown[]
    favorites: unknown[]
    receivedReviews: Array<Record<string, unknown>>
    writtenReviews: Array<Record<string, unknown>>
    reports: Array<Record<string, unknown>>
    blocks: Array<Record<string, unknown>>
  }>('/api/me/activity')
}

export interface SettlementSummary {
  totalRevenue: number
  completedSettlements: number
  pendingSettlements: number
  monthRevenue: number
  monthDealCount: number
  selectedMonth: string
  available: number
  monthlyRevenue: Array<{ month: string; label: string; amount: number }>
  recentIncome: Array<Record<string, unknown>>
}

export async function fetchSettlementSummary(month?: string) {
  const query = month ? `?month=${encodeURIComponent(month)}` : ''
  return apiFetch<SettlementSummary>(`/api/me/settlement-summary${query}`)
}

export async function createApplication(postId: string, profileId: string, message?: string) {
  return apiFetch('/api/applications', {
    method: 'POST',
    body: JSON.stringify({ postId, profileId, message }),
  })
}

export async function createReport(input: {
  targetUserId?: string
  postId?: string
  conversationId?: string
  messageId?: string
  reason: string
  description?: string
}) {
  return apiFetch('/api/reports', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function createReview(input: { dealId: string; rating: number; content?: string | null }) {
  return apiFetch('/api/reviews', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function createSupportInquiry(input: {
  type: string
  contact?: string | null
  body: string
}) {
  return apiFetch('/api/support-inquiries', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function createBlock(blockedUserId: string, context?: {
  postId?: string
  conversationId?: string
  messageId?: string
  reason?: string
  description?: string
}) {
  return apiFetch('/api/blocks', {
    method: 'POST',
    body: JSON.stringify({ blockedUserId, ...context }),
  })
}

export async function deleteBlock(blockedUserId: string) {
  return apiFetch('/api/blocks', {
    method: 'DELETE',
    body: JSON.stringify({ blockedUserId }),
  })
}

export async function addFavorite(postId: string) {
  return apiFetch('/api/favorites', {
    method: 'POST',
    body: JSON.stringify({ postId }),
  })
}

export async function removeFavorite(postId: string) {
  return apiFetch('/api/favorites', {
    method: 'DELETE',
    body: JSON.stringify({ postId }),
  })
}

export async function registerPushToken(input: {
  platform: 'ios' | 'android' | 'web'
  fcmToken: string
  deviceId?: string | null
  appVersion?: string | null
}) {
  return apiFetch('/api/devices/push-token', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function unregisterPushToken(input: { fcmToken?: string | null; deviceId?: string | null }) {
  return apiFetch('/api/devices/push-token', {
    method: 'DELETE',
    body: JSON.stringify(input),
  })
}

export async function fetchNotifications(limit = 50) {
  return apiFetch<Array<Record<string, unknown>>>(`/api/notifications?limit=${encodeURIComponent(String(limit))}`)
}

export async function markNotificationRead(notificationId: string) {
  return apiFetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
  })
}

export function mapApiPostToRequestPost(post: ApiTaskPost): RequestPost {
  const firstImage = post.images?.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0]
  const publicLocation = post.mode === 'online' ? '온라인' : post.addressText ?? '위치 미정'
  const listLocation = post.mode === 'online' ? '온라인' : formatListLocation(post)
  return {
    id: post.id,
    postType: post.postType,
    categoryId: inferCategoryId(post.category),
    category: post.category,
    categoryDetail: post.categoryDetail ?? undefined,
    title: post.title,
    location: publicLocation,
    listLocation,
    detailLocation: post.postType === 'request' ? publicLocation : post.region3depth ?? post.region2depth ?? post.addressText ?? '위치 미정',
    deadline: post.deadlineAt ? formatDeadline(post.deadlineAt) : post.deadlineText ?? post.availableTimeText ?? '시간 협의',
    price: post.price,
    mode: post.mode,
    distance: post.distanceMeters ? `${Math.round(post.distanceMeters)}m` : post.mode === 'online' ? '온라인' : undefined,
    image: inferIllustration(post.category),
    imageUrl: getDisplayImageUrl(firstImage),
    postStatus: post.status,
    capacityType: post.capacityType,
    capacityLimit: post.capacityLimit ?? null,
    occupiedCount: Number(post.occupiedCount ?? 0),
    activeChatCount: Number(post.activeChatCount ?? 0),
    favoriteCount: Number(post.favoriteCount ?? 0),
    remainingCount: post.remainingCount ?? null,
    status: mapApiStatus(post.status),
    description: post.description,
    requesterId: post.creatorId,
    requesterName: post.creatorNickname ?? undefined,
    requesterRating: post.creatorRatingAvg !== undefined && post.creatorRatingAvg !== null ? Number(post.creatorRatingAvg) : undefined,
    requesterCompletedCount: post.creatorCompletedCount ?? undefined,
    genderVisibility: post.genderVisibility,
  }
}

function formatListLocation(post: ApiTaskPost) {
  const region = [post.region1depth, post.region2depth, post.region3depth].filter(Boolean).join(' ')
  if (region) return region
  return trimAddressToNeighborhood(post.addressText ?? '위치 미정')
}

function trimAddressToNeighborhood(address: string) {
  const parts = address.trim().split(/\s+/).filter(Boolean)
  const neighborhoodIndex = parts.findIndex((part) => /(?:동|읍|면|가)$/.test(part))
  if (neighborhoodIndex >= 0) return parts.slice(0, neighborhoodIndex + 1).join(' ')
  return address
}

function inferCategoryId(category: string) {
  const map: Record<string, string> = {
    깨워줘: 'wake',
    들어줘: 'listen',
    조언해줘: 'advice',
    불러줘: 'call',
    놀아줘: 'play',
    골라줘: 'choose',
    대신해줘: 'proxy',
    일해줘: 'work',
    '동네 심부름': 'proxy',
    '집안 도움': 'proxy',
    '문서·자료': 'work',
    '문서 · 자료': 'work',
    '디자인·콘텐츠': 'work',
    디자인: 'work',
    '영상·사진': 'work',
    '사진·영상': 'work',
    '개발 · IT': 'work',
    레슨: 'advice',
    '대신 찾아줘': 'choose',
    반려동물: 'play',
    기타: 'work',
  }
  return categories.find((item) => item.label === category)?.id ?? map[category] ?? 'work'
}

function inferIllustration(category: string): IllustrationType {
  const matchedCategory = categories.find((item) => item.label === category)
  if (matchedCategory) return matchedCategory.icon

  const map: Record<string, IllustrationType> = {
    '동네 심부름': 'store',
    '집안 도움': 'home',
    '문서·자료': 'document',
    '문서 · 자료': 'document',
    '디자인·콘텐츠': 'design',
    디자인: 'design',
    '영상·사진': 'camera',
    '사진·영상': 'camera',
    '개발 · IT': 'document',
    레슨: 'book',
    '대신 찾아줘': 'find',
    반려동물: 'pet',
    기타: 'document',
  }
  return map[category] ?? 'document'
}

function mapApiStatus(status: ApiTaskPost['status']): TradeStatus {
  const map: Record<ApiTaskPost['status'], TradeStatus> = {
    open: '문의중',
    pending: '문의중',
    in_progress: '진행중',
    completed: '거래완료',
    cancelled: '취소됨',
    hidden: '취소됨',
    closed: '마감됨',
  }
  return map[status]
}

function formatDeadline(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '시간 협의'
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
