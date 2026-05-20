export type PostStatus = 'open' | 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'hidden'
export type RequestMode = 'nearby' | 'online' | 'both'
export type DealStatus = 'pending' | 'accepted' | 'in_progress' | 'complete_requested' | 'completed' | 'cancelled' | 'disputed'

export interface AuthSession {
  accessToken: string
  expiresAt: number
  expiresIn?: number
}

export interface Profile {
  id: string
  nickname?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  phoneVerified?: boolean | null
  completedCount?: number | null
  ratingAvg?: number | string | null
}

export interface TaskPost {
  id: string
  creatorId: string
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
  status: PostStatus
  recruitmentRound?: number | null
  latestDealId?: string | null
  latestDealStatus?: DealStatus | null
  latestDealCancelledBy?: string | null
  addressText?: string | null
  latitude?: number | null
  longitude?: number | null
  distanceMeters?: number | null
  images?: Array<{ id: string; imageUrl: string; storageKey: string; sortOrder: number }>
  creatorNickname?: string | null
  creatorAvatarUrl?: string | null
  creatorRatingAvg?: number | string | null
  creatorCompletedCount?: number | null
}

export interface Conversation {
  id: string
  dealId: string | null
  postId: string | null
  requesterId: string
  helperId: string
  lastMessage: string | null
  lastMessageAt: string | null
  postTitle?: string | null
  postCategory?: string | null
  postPrice?: number | null
  postStatus?: PostStatus | null
  dealStatus?: DealStatus | null
  applicationId?: string | null
  applicationStatus?: 'applied' | 'accepted' | 'rejected' | 'cancelled' | null
  requesterNickname?: string | null
  helperNickname?: string | null
  otherUserId?: string | null
  otherNickname?: string | null
  unreadCount?: number | null
}

export interface Message {
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
