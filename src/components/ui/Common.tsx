'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeft,
  Ban,
  Bell,
  CheckCircle2,
  ChevronRight,
  Flag,
  Funnel,
  Home,
  ListChecks,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Star,
  UserRound,
  X,
} from 'lucide-react'
import { categories, formatPrice, getCategoryIconSrc, type Category, type PostStatus, type RequestPost, type TradeStatus } from '@/data/mockData'
import { fetchAuthSession, fetchConversations, type ApiConversation } from '@/lib/manwonApi'

export type TabKey = 'home' | 'chat' | 'register' | 'activity' | 'my'

const postReportReasons = ['부적절한 게시글', '사기 의심', '거래 금지 요청', '개인정보 요구', '위험한 부탁', '기타'] as const

const navItems: Array<{ key: TabKey; label: string; icon: typeof Home; href: string }> = [
  { key: 'home', label: '홈', icon: Home, href: '/' },
  { key: 'chat', label: '채팅', icon: MessageCircle, href: '/chat' },
  { key: 'register', label: '등록', icon: Plus, href: '/register' },
  { key: 'activity', label: '내 활동', icon: ListChecks, href: '/activity' },
  { key: 'my', label: '마이', icon: UserRound, href: '/my' },
]

interface AppHeaderProps {
  title?: string
  titleContent?: ReactNode
  subtitle?: string
  centered?: boolean
  onBack?: () => void
  showBell?: boolean
  showSearch?: boolean
  showFilter?: boolean
  showSettings?: boolean
  onSettings?: () => void
  onMore?: () => void
}

export function AppHeader({
  title,
  titleContent,
  centered = false,
  onBack,
  showBell,
  showSearch,
  showFilter,
  showSettings,
  onSettings,
  onMore,
}: AppHeaderProps) {
  const className = [
    'app-header',
    centered ? 'is-centered' : '',
    onBack ? 'has-back' : '',
    showBell || showSearch || showFilter || showSettings || onMore ? 'has-actions' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <header className={className}>
      {onBack && (
        <button className="icon-button header-back" type="button" onClick={onBack} aria-label="뒤로가기">
          <ArrowLeft size={24} />
        </button>
      )}
      <div className="header-title-wrap">
        {titleContent ?? (
          <h1 className="app-title">
            {title}
            {!centered && title === '뭐든해줌' && <span className="brand-dot" />}
          </h1>
        )}
      </div>
      <div className="header-actions">
        {showBell && (
          <button className="icon-button has-dot" type="button" aria-label="알림">
            <Bell size={23} />
          </button>
        )}
        {showSearch && (
          <button className="icon-button" type="button" aria-label="검색">
            <Search size={25} />
          </button>
        )}
        {showFilter && (
          <button className="icon-button" type="button" aria-label="필터">
            <Funnel size={24} />
          </button>
        )}
        {showSettings && (
          <button className="icon-button" type="button" onClick={onSettings} aria-label="설정">
            <Settings size={24} />
          </button>
        )}
        {onMore && (
          <button className="icon-button" type="button" onClick={onMore} aria-label="더보기">
            <MoreHorizontal size={24} />
          </button>
        )}
      </div>
    </header>
  )
}

export function BottomNav() {
  const pathname = usePathname()
  const [chatUnreadCount, setChatUnreadCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    const refreshUnreadCount = async () => {
      try {
        const session = await fetchAuthSession()
        if (!session.authenticated) {
          if (!cancelled) setChatUnreadCount(0)
          return
        }
        const conversations = await fetchConversations()
        if (!cancelled) setChatUnreadCount(sumUnreadConversations(conversations))
      } catch {
        if (!cancelled) setChatUnreadCount(0)
      }
    }

    void refreshUnreadCount()
    const timer = window.setInterval(refreshUnreadCount, 8000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [pathname])

  return (
    <nav className="bottom-nav" aria-label="하단 탭">
      {navItems.map((item) => {
        const Icon = item.icon
        const active = isNavItemActive(item.key, pathname)
        const isRegister = item.key === 'register'
        const unreadLabel = item.key === 'chat' && chatUnreadCount > 0 ? formatUnreadCount(chatUnreadCount) : null
        const className = `bottom-nav-item ${active ? 'is-active' : ''} ${isRegister ? 'is-register' : ''}`

        return (
          <Link
            key={item.key}
            href={item.href}
            className={className}
            aria-current={active ? 'page' : undefined}
            aria-label={unreadLabel ? `채팅, 읽지 않은 메시지 ${formatUnreadAriaCount(chatUnreadCount)}` : item.label}
          >
            <span className="bottom-nav-icon">
              <Icon size={isRegister ? 29 : 24} strokeWidth={isRegister ? 2.1 : 1.9} />
              {unreadLabel && <span className="bottom-nav-unread-badge">{unreadLabel}</span>}
            </span>
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function sumUnreadConversations(conversations: ApiConversation[]) {
  let total = 0
  for (const conversation of conversations) {
    total += Math.max(Number(conversation.unreadCount ?? 0), 0)
    if (total > 99) return 100
  }
  return total
}

function formatUnreadCount(count: number) {
  return count > 99 ? '99+' : String(count)
}

function formatUnreadAriaCount(count: number) {
  return count > 99 ? '99개 이상' : `${count}개`
}

export function MapUnavailableOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="confirm-dialog map-unavailable-dialog" role="dialog" aria-modal="true" aria-labelledby="map-unavailable-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="map-unavailable-title">지도 기능은 현재 준비중입니다.</h2>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

export function ActionGuideOverlay({
  title,
  description,
  note,
  onClose,
}: {
  title: string
  description: string
  note?: string
  onClose: () => void
}) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="confirm-dialog action-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="action-guide-title" onClick={(event) => event.stopPropagation()}>
        <span className="action-guide-icon" aria-hidden="true">
          <CheckCircle2 size={18} />
        </span>
        <h2 id="action-guide-title">{title}</h2>
        <p>{description}</p>
        {note && <p className="action-guide-note">{note}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

function isNavItemActive(key: TabKey, pathname: string) {
  if (key === 'home') return pathname === '/' || pathname.startsWith('/posts/')
  if (key === 'chat') return pathname === '/chat' || pathname.startsWith('/chat/')
  if (key === 'register') return pathname === '/register' || pathname.startsWith('/register/')
  if (key === 'activity') return pathname === '/activity' || pathname.startsWith('/activity/')
  return pathname === '/my' || pathname.startsWith('/my/')
}

interface BrandButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'outline' | 'soft' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  full?: boolean
}

export function BrandButton({
  variant = 'filled',
  size = 'md',
  full = false,
  className = '',
  children,
  ...props
}: BrandButtonProps) {
  return (
    <button className={`brand-button brand-button-${variant} brand-button-${size} ${full ? 'is-full' : ''} ${className}`} type="button" {...props}>
      {children}
    </button>
  )
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="segmented-control" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? 'is-active' : ''}
          type="button"
          onClick={() => onChange(option.value)}
          role="tab"
          aria-selected={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface ChipGroupProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  className?: string
}

export function ChipGroup<T extends string>({ options, value, onChange, className = '' }: ChipGroupProps<T>) {
  return (
    <div className={`chip-group ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          className={`chip ${value === option.value ? 'is-active' : ''}`}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface SectionHeaderProps {
  title: string
  action?: string
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {action && (
        <button type="button">
          {action}
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}

interface CategoryScrollerProps {
  selectedId: string
  onSelect: (id: string) => void
  compact?: boolean
  includeAll?: boolean
}

export function CategoryScroller({ selectedId, onSelect, compact = false, includeAll = true }: CategoryScrollerProps) {
  const visibleCategories = includeAll ? categories : categories.filter((category) => category.id !== 'all')

  return (
    <div className={`category-scroller ${compact ? 'is-compact' : ''}`}>
      {visibleCategories.map((category) => (
        <CategoryCard
          key={category.id}
          category={category}
          selected={selectedId === category.id}
          onSelect={() => onSelect(category.id)}
        />
      ))}
    </div>
  )
}

interface CategoryCardProps {
  category: Category
  selected: boolean
  onSelect: () => void
}

export function CategoryCard({ category, selected, onSelect }: CategoryCardProps) {
  return (
    <button className={`category-card ${selected ? 'is-active' : ''}`} type="button" onClick={onSelect}>
      <span className="category-icon-shell">
        <Image className="category-icon-image" src={category.iconSrc} width={52} height={42} alt="" aria-hidden="true" />
      </span>
      <span>{category.label}</span>
    </button>
  )
}

interface StatusBadgeProps {
  status: TradeStatus | string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-${status.replace(/\s/g, '')}`}>{status}</span>
}

interface RequestCardProps {
  request: RequestPost
  onPrimary?: () => void
  onOpen?: () => void
  onReport?: () => void
  reportDisabled?: boolean
  variant?: 'home' | 'nearby' | 'preview'
  primaryLabel?: string
}

export function RequestCard({ request, onPrimary, onOpen, onReport, reportDisabled = false, variant = 'home', primaryLabel = '제가 할게요' }: RequestCardProps) {
  const showPrimaryAction = variant !== 'preview' && Boolean(onPrimary)
  const locationText = variant === 'home' ? request.listLocation ?? trimLocationToNeighborhood(request.location) : request.location
  const statusBadge = variant === 'home' ? getPostStatusBadge(request.postStatus) : null

  return (
    <article className={`request-card request-card-${variant} ${statusBadge ? 'has-post-status-badge' : ''}`} onClick={onOpen}>
      <CategoryImageFrame
        categoryId={request.categoryId}
        imageUrl={request.imageUrl}
        label={request.title}
        size={variant === 'preview' ? 'lg' : 'md'}
      />
      <div className="request-info">
        <div className="request-meta-line">
          <span className="request-category">{request.categoryDetail ?? request.category}</span>
        </div>
        {statusBadge && <span className={`post-status-badge ${statusBadge.className}`}>{statusBadge.label}</span>}
        {variant !== 'preview' && <ReportIcon onReport={onReport} disabled={reportDisabled} />}
        <h3>{request.title}</h3>
        <p className="request-sub request-location">
          {variant !== 'home' && <MapPin size={14} />}
          <span>{request.mode === 'online' ? '온라인' : locationText}</span>
        </p>
        <p className="request-sub request-deadline">
          {variant !== 'home' && <CheckCircle2 size={14} />}
          <span className={isFastDeadlineText(request.deadline) ? 'hot-deadline-text' : undefined}>{request.deadline}</span>
        </p>
      </div>
      <div className="request-side">
        <span className="request-price">{formatPrice(request.price)}</span>
        {showPrimaryAction && (
          <BrandButton
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation()
              onPrimary?.()
            }}
          >
            {primaryLabel}
          </BrandButton>
        )}
      </div>
    </article>
  )
}

function getPostStatusBadge(status?: PostStatus) {
  if (status === 'pending' || status === 'in_progress') return { label: '진행중', className: 'is-progress' }
  if (status === 'completed') return { label: '거래 완료', className: 'is-completed' }
  return null
}

export function CategoryImageFrame({
  categoryId,
  imageUrl,
  label,
  size = 'md',
}: {
  categoryId: string
  imageUrl?: string | null
  label: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)
  const isUploadedImage = Boolean(imageUrl && failedImageUrl !== imageUrl)
  const src = getCategoryIconSrc(categoryId)
  const sizes = size === 'lg' ? '(max-width: 430px) 100vw, 430px' : size === 'sm' ? '42px' : '84px'

  return (
    <div
      className={`mock-image mock-image-${size} cached-image-frame ${isUploadedImage ? 'uploaded-image' : 'category-fallback-image'}`}
      aria-label={label}
    >
      <Image
        className="cached-image-element"
        src={isUploadedImage ? imageUrl ?? src : src}
        alt=""
        aria-hidden="true"
        fill
        sizes={sizes}
        loading={size === 'sm' ? 'lazy' : 'eager'}
        unoptimized={isUploadedImage}
        onError={() => {
          if (imageUrl) setFailedImageUrl(imageUrl)
        }}
      />
    </div>
  )
}

function trimLocationToNeighborhood(location: string) {
  const parts = location.trim().split(/\s+/).filter(Boolean)
  const neighborhoodIndex = parts.findIndex((part) => /(?:동|읍|면|가)$/.test(part))
  if (neighborhoodIndex >= 0) return parts.slice(0, neighborhoodIndex + 1).join(' ')
  return location
}

function isFastDeadlineText(value: string) {
  return value.trim() === '가능한 빠르게'
}

export function ReportIcon({ onReport, disabled = false }: { onReport?: () => void; disabled?: boolean }) {
  return (
    <button
      className="report-icon"
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onReport?.()
      }}
      aria-label="신고하기"
    >
      <Flag size={19} />
    </button>
  )
}

export function MoreMenu({
  onClose,
  onReport,
  onBlock,
}: {
  onClose?: () => void
  onReport?: () => void
  onBlock?: () => void
}) {
  return (
    <div className="more-menu">
      {onClose && (
        <button className="sheet-close" type="button" onClick={onClose} aria-label="닫기">
          <X size={20} />
        </button>
      )}
      <button type="button" onClick={onReport}>
        <Flag size={18} />
        신고하기
      </button>
      <button type="button" onClick={onBlock}>
        <Ban size={18} />
        차단하기
      </button>
    </div>
  )
}

export function ReportConfirmSheet({
  targetLabel,
  busy = false,
  error,
  onClose,
  onSubmit,
}: {
  targetLabel: string
  busy?: boolean
  error?: string
  onClose: () => void
  onSubmit: (input: { reason: string; description: string }) => void
}) {
  const [reason, setReason] = useState<string>(postReportReasons[0])
  const [description, setDescription] = useState('')

  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <div className="report-sheet" role="dialog" aria-modal="true" aria-labelledby="report-confirm-title" onClick={(event) => event.stopPropagation()}>
        <div className="drag-handle" />
        <button className="sheet-x" type="button" onClick={onClose} aria-label="닫기">
          <X size={22} />
        </button>
        <h2 id="report-confirm-title">게시글을 신고할까요?</h2>
        <p>
          {targetLabel} 게시글의 문제를 알려주세요.
          <br />
          신고 내용은 운영팀 확인용으로만 사용됩니다.
        </p>
        <div className="report-reason-grid" role="radiogroup" aria-label="신고 사유">
          {postReportReasons.map((item) => (
            <button
              key={item}
              className={reason === item ? 'is-active' : ''}
              type="button"
              disabled={busy}
              onClick={() => setReason(item)}
              role="radio"
              aria-checked={reason === item}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="report-textarea">
          <span>상세 내용</span>
          <textarea
            value={description}
            disabled={busy}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={1000}
            placeholder="어떤 점이 문제인지 적어주세요."
          />
          <em>{description.length}/1000</em>
        </label>
        {error && <p className="inline-status is-error">{error}</p>}
        <div className="report-sheet-actions">
          <BrandButton variant="outline" size="lg" onClick={onClose} disabled={busy}>
            취소
          </BrandButton>
          <BrandButton size="lg" onClick={() => onSubmit({ reason, description })} disabled={busy}>
            {busy ? '접수 중' : '신고 접수하기'}
          </BrandButton>
        </div>
      </div>
    </div>
  )
}

export function RatingStars({ rating = 5 }: { rating?: number }) {
  return (
    <span className="rating-stars" aria-label={`별점 ${rating}`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} size={18} fill={index < Math.round(rating) ? 'currentColor' : 'none'} />
      ))}
    </span>
  )
}

export function EmptySpacer() {
  return <div className="empty-spacer" aria-hidden="true" />
}
