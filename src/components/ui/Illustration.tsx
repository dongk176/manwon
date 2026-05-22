'use client'

import {
  BookOpen,
  Camera,
  FileText,
  Grid2X2,
  HeartHandshake,
  ImageIcon,
  Music,
  Package,
  Palette,
  PawPrint,
  SearchCheck,
  ShieldCheck,
  ShoppingBasket,
  Sofa,
  Store,
  UserRound,
  WalletCards,
} from 'lucide-react'
import type { IllustrationType, UserProfile } from '@/data/mockData'
import { getDefaultProfileImageByGender } from '@/lib/manwonApi'

const iconMap = {
  all: Grid2X2,
  basket: ShoppingBasket,
  home: Sofa,
  document: FileText,
  design: Palette,
  camera: Camera,
  find: SearchCheck,
  pet: PawPrint,
  etc: Package,
  store: Store,
  book: BookOpen,
  food: ShoppingBasket,
  profile: UserRound,
  wallet: WalletCards,
  review: HeartHandshake,
  shield: ShieldCheck,
  music: Music,
} satisfies Record<IllustrationType, typeof Grid2X2>

interface IllustrationProps {
  type: IllustrationType
  size?: 'sm' | 'md' | 'lg'
  active?: boolean
  label?: string
}

export function Illustration({ type, size = 'md', active = false, label }: IllustrationProps) {
  const Icon = iconMap[type] ?? ImageIcon

  return (
    <div className={`mock-image mock-image-${size} ${active ? 'is-active' : ''}`} aria-label={label}>
      <span className="mock-image-glow" />
      <Icon aria-hidden="true" strokeWidth={1.8} />
    </div>
  )
}

interface AvatarProps {
  user: UserProfile
  size?: 'sm' | 'md' | 'lg'
  online?: boolean
}

export function Avatar({ user, size = 'md', online = false }: AvatarProps) {
  const initial = user.name.slice(0, 1)
  const imageUrl = user.avatarUrl?.trim() || ''
  const defaultAvatarKey = user.defaultAvatarKey?.trim() || ''
  const fallbackImageUrl = !imageUrl && !defaultAvatarKey ? getDefaultProfileImageByGender(user.gender) ?? '' : ''
  const displayImageUrl = imageUrl || fallbackImageUrl
  const avatarIndex = Number(defaultAvatarKey.replace(/[^0-9]/g, '')) || 1

  return (
    <span
      className={[
        `avatar avatar-${size} avatar-${user.avatarTone}`,
        displayImageUrl ? 'is-image-avatar' : '',
        !displayImageUrl && defaultAvatarKey ? `is-default-avatar avatar-default-${avatarIndex}` : '',
      ].filter(Boolean).join(' ')}
    >
      {displayImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Runtime profile avatar URLs may be external; CSS handles cropping.
        <img src={displayImageUrl} alt="" aria-hidden="true" />
      ) : (
        <span>{initial}</span>
      )}
      {online && <i aria-label="온라인" />}
    </span>
  )
}
