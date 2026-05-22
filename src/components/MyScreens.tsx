'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  Ban,
  BarChart3,
  Bell,
  Briefcase,
  CalendarDays,
  Camera,
  ChevronRight,
  CircleCheck,
  Clock,
  FileText,
  Flag,
  Globe,
  Headphones,
  Heart,
  HeartHandshake,
  HelpCircle,
  ImagePlus,
  Info,
  Link as LinkIcon,
  ListChecks,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  Monitor,
  Package,
  Plus,
  Shield,
  Settings,
  ShieldCheck,
  Star,
  TriangleAlert,
  UserMinus,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { ActionGuideOverlay, AppHeader, BrandButton, RatingStars } from '@/components/ui/Common'
import { NeighborhoodSelectSheet } from '@/components/location/LocationSheets'
import { notifyNativeProfileOnboardingCompleted } from '@/components/NativeIOSBridge'
import {
  createSupportInquiry,
  createActivityProfile,
  deactivateActivityProfile,
  deleteBlock,
  fetchTaskPost,
  fetchActivityProfiles,
  fetchMyActivity,
  fetchMyPage,
  fetchSettlementSummary,
  getDefaultProfileImageByGender,
  getDisplayImageUrl,
  isDefaultActivityProfile,
  logout,
  updateActivityProfile,
  uploadImageFile,
  withdrawAccount,
  type ActivityProfile,
  type ActivityProfilePayload,
  type ApiTaskPost,
  type SettlementSummary,
} from '@/lib/manwonApi'
import {
  getLocationPermissionState,
  requestBrowserLocation,
  reverseGeocode,
  storeLocationRegion,
  toNeighborhoodRegion,
  type LocationPermissionState,
  type LocationRegion,
} from '@/lib/location'

export type MySection =
  | 'main'
  | 'profiles'
  | 'profileOnboarding'
  | 'manage'
  | 'activity'
  | 'requests'
  | 'helped'
  | 'favorites'
  | 'settlement'
  | 'reviews'
  | 'blocks'
  | 'reports'
  | 'account'
  | 'support'

type ActivityRecord = Record<string, unknown>
type ActivityPost = ApiTaskPost & ActivityRecord
type MyActivity = {
  myPosts: ActivityPost[]
  helpedDeals: ActivityRecord[]
  favorites: ActivityRecord[]
  receivedReviews: ActivityRecord[]
  writtenReviews: ActivityRecord[]
  reports: ActivityRecord[]
  blocks: ActivityRecord[]
}

type FilterStatus = '진행중' | '완료' | '취소' | '마감임박'
type TaskItem = {
  id: string
  postId: string
  conversationId?: string | null
  title: string
  category: string
  price: number
  mode: string
  location: string
  deadline: string
  statusLabel: string
  filterStatus: FilterStatus
  note?: string
  meta?: string
  dueSoon?: boolean
}

const emptyActivity: MyActivity = {
  myPosts: [],
  helpedDeals: [],
  favorites: [],
  receivedReviews: [],
  writtenReviews: [],
  reports: [],
  blocks: [],
}

export function MyScreens({ section = 'main' }: { section?: MySection }) {
  const router = useRouter()
  const [myPage, setMyPage] = useState<ActivityRecord | null>(null)
  const [activity, setActivity] = useState<MyActivity>(emptyActivity)
  const [settlementSummary, setSettlementSummary] = useState<SettlementSummary | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [authBusy, setAuthBusy] = useState(false)
  const [withdrawBusy, setWithdrawBusy] = useState(false)
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false)
  const [withdrawConfirmText, setWithdrawConfirmText] = useState('')
  const [withdrawConfirmError, setWithdrawConfirmError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([fetchMyPage(), fetchSettlementSummary(), fetchMyActivity()]).then(([profileResult, settlementResult, activityResult]) => {
      if (cancelled) return
      if (profileResult.status === 'fulfilled') setMyPage(profileResult.value)
      if (settlementResult.status === 'fulfilled') setSettlementSummary(settlementResult.value)
      if (activityResult.status === 'fulfilled') setActivity(activityResult.value as MyActivity)
      setLoadState(profileResult.status === 'rejected' && activityResult.status === 'rejected' ? 'error' : 'ready')
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogout() {
    setAuthBusy(true)
    try {
      await logout()
      setMyPage(null)
      setActivity(emptyActivity)
      router.push('/login')
    } finally {
      setAuthBusy(false)
    }
  }

  function openWithdrawConfirm() {
    if (withdrawBusy) return
    setWithdrawConfirmText('')
    setWithdrawConfirmError('')
    setWithdrawConfirmOpen(true)
  }

  function closeWithdrawConfirm() {
    if (withdrawBusy) return
    setWithdrawConfirmOpen(false)
    setWithdrawConfirmText('')
    setWithdrawConfirmError('')
  }

  async function handleWithdraw() {
    if (withdrawConfirmText.trim() !== '탈퇴하기') {
      setWithdrawConfirmError('"탈퇴하기"를 정확히 입력해주세요.')
      return
    }

    setWithdrawBusy(true)
    setWithdrawConfirmError('')
    try {
      await withdrawAccount()
      setWithdrawConfirmOpen(false)
      setWithdrawConfirmText('')
      setMyPage(null)
      setActivity(emptyActivity)
      router.replace('/login')
    } catch (error) {
      setWithdrawConfirmError(error instanceof Error ? error.message : '탈퇴를 처리하지 못했습니다.')
    } finally {
      setWithdrawBusy(false)
    }
  }

  function withWithdrawOverlay(content: ReactNode) {
    return (
      <>
        {content}
        {withdrawConfirmOpen && (
          <WithdrawConfirmOverlay
            value={withdrawConfirmText}
            busy={withdrawBusy}
            error={withdrawConfirmError}
            onChange={(value) => {
              setWithdrawConfirmText(value)
              if (withdrawConfirmError) setWithdrawConfirmError('')
            }}
            onClose={closeWithdrawConfirm}
            onConfirm={() => void handleWithdraw()}
          />
        )}
      </>
    )
  }

  const userGender = toProfileGender(myPage?.gender)

  if (section === 'activity' || section === 'requests' || section === 'helped') {
    return withWithdrawOverlay(
      <MyActivityScreen
        posts={activity.myPosts}
        deals={activity.helpedDeals}
        loading={loadState === 'loading'}
        initialTab={section === 'helped' ? '내가 해준 일' : '내 부탁'}
      />
    )
  }

  if (section === 'favorites') {
    return withWithdrawOverlay(<MyFavoritesScreen favorites={activity.favorites} loading={loadState === 'loading'} onBack={() => router.push('/my')} />)
  }

  if (section === 'settlement') {
    return withWithdrawOverlay(
      <SettlementScreen
        initialSummary={settlementSummary}
        onBack={() => router.push('/my')}
        onSummaryChange={setSettlementSummary}
      />
    )
  }

  if (section === 'reviews') {
    return withWithdrawOverlay(<ReviewsScreen reviews={activity.receivedReviews} loading={loadState === 'loading'} onBack={() => router.push('/my')} />)
  }

  if (section === 'account') {
    return withWithdrawOverlay(
      <AccountScreen
        onBack={() => router.push('/my')}
        onLogout={() => void handleLogout()}
        onWithdraw={openWithdrawConfirm}
        authBusy={authBusy}
        withdrawBusy={withdrawBusy}
      />
    )
  }

  if (section === 'support') {
    return withWithdrawOverlay(<SupportScreen onBack={() => router.push('/my')} />)
  }

  if (section === 'profiles') {
    return withWithdrawOverlay(<ActivityProfilesScreen onBack={() => router.push('/my')} userGender={userGender} />)
  }

  if (section === 'profileOnboarding') {
    return withWithdrawOverlay(
      <ActivityProfilesScreen
        onboarding
        userGender={userGender}
        onComplete={() => {
          router.replace('/')
          router.refresh()
        }}
      />
    )
  }

  if (section === 'manage') {
    return withWithdrawOverlay(
      <ManageScreen
        onBack={() => router.push('/my')}
        onOpenBlocks={() => router.push('/my/blocks')}
        onOpenReports={() => router.push('/my/reports')}
        settlementSummary={settlementSummary}
        activity={activity}
      />
    )
  }

  if (section === 'blocks' || section === 'reports') {
    return withWithdrawOverlay(
      <BlocksReportsScreen
        initialTab={section === 'reports' ? 'reports' : 'blocks'}
        blocks={activity.blocks}
        reports={activity.reports}
        onBack={() => router.push('/my')}
        onWithdraw={openWithdrawConfirm}
        withdrawBusy={withdrawBusy}
        onRemoved={(blockedUserId) => {
          setActivity((current) => ({
            ...current,
            blocks: current.blocks.filter((block) => getString(block, 'blockedUserId') !== blockedUserId),
          }))
        }}
      />
    )
  }

  const nickname = getString(myPage ?? {}, 'nickname') || '뭐든해줌'
  const avatarUrl = getString(myPage ?? {}, 'avatarUrl')
  const fallbackAvatarUrl = getDefaultProfileImageByGender(userGender)
  const ratingAvg = getNumber(myPage ?? {}, 'ratingAvg')
  const completedCount = getNumber(myPage ?? {}, 'completedCount')
  const favoriteCount = getNumber(myPage ?? {}, 'favoriteCount', activity.favorites.length)
  const receivedReviewCount = getNumber(myPage ?? {}, 'receivedReviewCount', activity.receivedReviews.length)
  const phoneVerified = myPage?.phoneVerified === true

  if (loadState === 'loading') {
    return withWithdrawOverlay(
      <section className="screen my-screen my-page-loading">
        <AppHeader title="마이" />
        <div className="my-page-loading-indicator" role="status" aria-label="마이페이지 로딩 중">
          <span className="loading-spinner" />
        </div>
      </section>
    )
  }

  return withWithdrawOverlay(
    <section className="screen my-screen my-page-ready">
      <AppHeader title="마이" />
      {loadState === 'error' && <p className="inline-status is-error">마이페이지 정보를 불러오지 못했습니다.</p>}
      <div className="profile-card">
        <InitialAvatar name={nickname} size="lg" imageUrl={avatarUrl || fallbackAvatarUrl || undefined} />
        <div className="profile-main">
          <h2>
            {nickname}
            <ChevronRight size={20} />
          </h2>
          <p>뭐든해줌에서 안전하게 부탁을 주고받아보세요.</p>
        </div>
        <div className="profile-stats">
          <span>
            <Star size={18} />
            평점 {ratingAvg.toFixed(1)}
          </span>
          <span>
            <ListChecks size={18} />
            거래 완료 {completedCount}건
          </span>
        </div>
      </div>

      <MenuGroup>
        <MenuItem icon={<UserRound />} title="내 프로필 관리" badge="활동 프로필" onClick={() => router.push('/my/profiles')} />
        <MenuItem icon={<Heart />} title="찜한 부탁" badge={`${favoriteCount}개`} onClick={() => router.push('/my/favorites')} muted />
      </MenuGroup>

      <MenuGroup>
        <MenuItem icon={<BarChart3 />} title="받은 후기" badge={`${receivedReviewCount}개`} onClick={() => router.push('/my/reviews')} muted />
      </MenuGroup>

      <MenuGroup>
        {!phoneVerified && <MenuItem icon={<LogIn />} title="로그인 / 회원가입" badge="권장" onClick={() => router.push('/login?next=/my')} />}
        <MenuItem icon={<Ban />} title="차단/신고 관리" onClick={() => router.push('/my/blocks')} muted />
        {phoneVerified && <MenuItem icon={<LogOut />} title={authBusy ? '로그아웃 중' : '로그아웃'} onClick={() => void handleLogout()} muted />}
      </MenuGroup>

      <button className="customer-center" type="button" onClick={() => router.push('/my/support')}>
        <Headphones size={18} />
        고객센터
      </button>
      <div className="support-link-stack" aria-label="약관 바로가기">
        <button className="support-link-button" type="button" onClick={() => router.push('/terms/service?returnTo=/my')}>
          <FileText size={17} />
          서비스 이용약관
        </button>
        <button className="support-link-button" type="button" onClick={() => router.push('/terms/privacy?returnTo=/my')}>
          <Shield size={17} />
          개인정보 처리방침
        </button>
      </div>
      <button className="withdraw-cta my-main-withdraw-button" type="button" disabled={withdrawBusy} onClick={openWithdrawConfirm}>
        <UserMinus size={18} />
        {withdrawBusy ? '탈퇴 처리 중' : '탈퇴하기'}
      </button>
    </section>
  )
}

type MyActivityTab = '내 부탁' | '내가 해준 일'

function MyActivityScreen({
  posts,
  deals,
  loading,
  initialTab,
}: {
  posts: ActivityPost[]
  deals: ActivityRecord[]
  loading: boolean
  initialTab: MyActivityTab
}) {
  const [activeTab, setActiveTab] = useState<MyActivityTab>(initialTab)
  const [activeStatus, setActiveStatus] = useState('전체')
  const [selectedItem, setSelectedItem] = useState<TaskItem | null>(null)
  const [postGuide, setPostGuide] = useState<{ title: string; description: string } | null>(null)
  const router = useRouter()
  const postItems = useMemo(() => posts.map(postToTaskItem), [posts])
  const dealItems = useMemo(() => deals.map(dealToTaskItem), [deals])
  const activeItems = activeTab === '내 부탁' ? postItems : dealItems
  const filteredItems = filterTaskItems(activeItems, activeStatus)
  const emptyTitle = activeTab === '내 부탁' ? '아직 등록한 부탁이 없어요' : '아직 해준 일이 없어요'
  const emptyText = activeTab === '내 부탁'
    ? '부탁을 등록하면 이곳에서 상태를 확인할 수 있습니다.'
    : '거래를 수락하면 이곳에서 진행 상황을 볼 수 있습니다.'

  return (
    <section className="screen my-sub-screen my-activity-screen">
      <AppHeader title="내 활동" centered />
      <ChipTabs tabs={['내 부탁', '내가 해준 일']} active={activeTab} onChange={(tab) => setActiveTab(tab as MyActivityTab)} />
      <SegmentTabs tabs={['전체', '진행중', '완료', '취소']} active={activeStatus} onChange={setActiveStatus} />
      <TaskList items={filteredItems} loading={loading} emptyTitle={emptyTitle} emptyText={emptyText} onItemSelect={setSelectedItem} />
      {selectedItem && (
        <ActivityRouteOverlay
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onOpenChat={() => {
            if (!selectedItem.conversationId) return
            router.push(`/chat/${encodeURIComponent(selectedItem.conversationId)}`)
          }}
          onOpenPost={() => {
            if (!selectedItem.postId) return
            void openTaskPost(selectedItem.postId)
          }}
        />
      )}
      {postGuide && (
        <ActionGuideOverlay
          title={postGuide.title}
          description={postGuide.description}
          onClose={() => setPostGuide(null)}
        />
      )}
    </section>
  )

  async function openTaskPost(postId: string) {
    try {
      await fetchTaskPost(postId)
      router.push(`/posts/${encodeURIComponent(postId)}`)
    } catch (error) {
      if (isRemovedPostError(error)) {
        setSelectedItem(null)
        setPostGuide({
          title: '삭제된 게시물입니다.',
          description: '더 이상 확인할 수 없는 게시글이에요.',
        })
        return
      }
      setPostGuide({
        title: '게시글을 열 수 없습니다.',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.',
      })
    }
  }
}

function MyFavoritesScreen({ favorites, loading, onBack }: { favorites: ActivityRecord[]; loading: boolean; onBack: () => void }) {
  const [active, setActive] = useState('전체')
  const items = useMemo(() => favorites.map(favoriteToTaskItem), [favorites])
  const filteredItems = filterTaskItems(items, active)

  return (
    <section className="screen my-sub-screen my-favorites-screen">
      <AppHeader title="찜한 부탁" centered onBack={onBack} />
      <SegmentTabs tabs={['전체', '진행중', '마감임박', '완료']} active={active} onChange={setActive} />
      <p className="my-list-count">찜한 부탁 <strong>{favorites.length}개</strong></p>
      <TaskList items={filteredItems} loading={loading} emptyTitle="아직 찜한 부탁이 없어요" emptyText="관심 있는 부탁을 찜하면 이곳에서 모아볼 수 있습니다." />
      <p className="my-footnote">찜한 부탁은 최대 50개까지 저장할 수 있어요.</p>
    </section>
  )
}

type ActivityProfileFormState = {
  id?: string
  avatarUrl: string | null
  defaultAvatarKey: string
  gender?: 'male' | 'female' | 'unknown' | 'private' | null
  nickname: string
  bio: string
  activityMode: '' | 'online' | 'nearby' | 'both'
  addressText: string
  region1Depth: string
  region2Depth: string
  region3Depth: string
  regionCode: string | null
  latitude: number | null
  longitude: number | null
  careerSummary: string
  careerDescription: string
  linkTitle: string
  linkUrl: string
  availableTimeText: string
  basePriceText: string
  workSampleImages: Array<{ imageUrl: string; storageKey: string; sortOrder: number }>
  phoneVerified?: boolean | null
  ratingAvg?: number | string | null
  reviewCount?: number | null
  completedCount?: number | null
}

type ProfileExtraModalKind = 'career' | 'link' | 'sample'

const defaultProfileAvatars = ['default-1', 'default-2', 'default-3', 'default-4']

function ActivityProfilesScreen({
  onBack,
  onboarding = false,
  userGender,
  onComplete,
}: {
  onBack?: () => void
  onboarding?: boolean
  userGender?: ActivityProfile['gender']
  onComplete?: () => void
}) {
  const [profiles, setProfiles] = useState<ActivityProfile[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(onboarding ? 'ready' : 'loading')
  const [formState, setFormState] = useState<ActivityProfileFormState | null>(
    onboarding ? createEmptyActivityProfileForm(userGender) : null,
  )
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const activeFormState = useMemo(() => {
    if (!formState || formState.id || formState.gender || !userGender) return formState
    return { ...formState, gender: userGender }
  }, [formState, userGender])

  useEffect(() => {
    if (onboarding) return
    let cancelled = false
    fetchActivityProfiles()
      .then((nextProfiles) => {
        if (cancelled) return
        setProfiles(nextProfiles)
        const defaultProfile = nextProfiles.find((profile) => isDefaultActivityProfile(profile)) ?? nextProfiles[0]
        if (defaultProfile) setFormState(activityProfileToForm(defaultProfile))
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [onboarding])

  function openEdit(profile: ActivityProfile) {
    setErrors({})
    setMessage('')
    setSaveState('idle')
    setFormState(activityProfileToForm(profile))
  }

  async function saveProfile(nextForm: ActivityProfileFormState) {
    const nextErrors = validateActivityProfileForm(nextForm)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSaveState('saving')
    setMessage('')
    try {
      const payload = activityProfileFormToPayload(nextForm)
      const saved = nextForm.id
        ? await updateActivityProfile(nextForm.id, payload)
        : await createActivityProfile(payload)
      const savedWithGender: ActivityProfile = saved.gender
        ? saved
        : { ...saved, gender: nextForm.gender ?? userGender ?? null }
      if (onboarding) {
        notifyNativeProfileOnboardingCompleted()
        setSaveState('idle')
        onComplete?.()
        return
      }
      setProfiles((current) => {
        const exists = current.some((profile) => profile.id === savedWithGender.id)
        return exists
          ? current.map((profile) => (profile.id === savedWithGender.id ? savedWithGender : profile))
          : [...current, savedWithGender]
      })
      setFormState(activityProfileToForm(savedWithGender))
      setSaveState('idle')
      setMessage(nextForm.id ? '프로필이 수정되었습니다.' : '프로필이 등록되었습니다.')
    } catch (error) {
      setSaveState('error')
      setMessage(error instanceof Error ? error.message : '프로필을 저장하지 못했습니다.')
    }
  }

  async function deactivateProfile(profile: ActivityProfile) {
    if (profiles.length <= 1) {
      setMessage('활동 프로필은 최소 1개가 필요합니다.')
      return
    }
    if (typeof window !== 'undefined' && !window.confirm(`${profile.nickname} 프로필을 비활성화할까요? 연결된 게시글과 거래 기록은 유지됩니다.`)) return
    setMessage('')
    try {
      await deactivateActivityProfile(profile.id)
      setProfiles((current) => current.filter((item) => item.id !== profile.id))
      setMessage('프로필이 비활성화되었습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '프로필을 비활성화하지 못했습니다.')
    }
  }

  if (activeFormState) {
    return (
      <ActivityProfileFormScreen
        form={activeFormState}
        errors={errors}
        saveState={saveState}
        message={message}
        onChange={setFormState}
        onErrorsChange={setErrors}
        hideBack={onboarding}
        titleOverride={onboarding ? undefined : '내 프로필 관리'}
        onBack={() => {
          if (onboarding) {
            setFormState((current) => current)
            return
          }
          onBack?.()
        }}
        onSave={() => void saveProfile(activeFormState)}
      />
    )
  }

  return (
    <section className="screen my-sub-screen activity-profiles-page">
      <ProfileFlowHeader title="내 프로필 관리" onBack={onBack ?? (() => undefined)} />
      {message && <p className={`inline-status ${saveState === 'error' ? 'is-error' : ''}`}>{message}</p>}
      {loadState === 'loading' && <p className="inline-status">프로필을 불러오는 중입니다.</p>}
      {loadState === 'error' && <p className="inline-status is-error">프로필을 불러오지 못했습니다.</p>}
      {loadState === 'ready' && profiles.length === 0 && (
        <div className="empty-state">
          <strong>아직 활동 프로필이 없어요</strong>
          <span>게시글을 올리거나 지원하려면 활동 프로필이 필요합니다.</span>
        </div>
      )}
      <div className="activity-profile-list">
        {profiles.map((profile) => (
          <ActivityProfileCard
            key={profile.id}
            profile={profile}
            onEdit={() => openEdit(profile)}
            onDeactivate={() => void deactivateProfile(profile)}
          />
        ))}
      </div>
    </section>
  )
}

function ActivityProfileCard({
  profile,
  onEdit,
  onDeactivate,
}: {
  profile: ActivityProfile
  onEdit: () => void
  onDeactivate: () => void
}) {
  const region = getActivityProfileRegion(profile)
  const isDefault = isDefaultActivityProfile(profile)
  const rating = Number(profile.ratingAvg ?? 0)
  const completedCount = Number(profile.completedCount ?? 0)

  return (
    <article className="activity-profile-card">
      <ProfileImage profile={profile} />
      <div className="activity-profile-card-body">
        <div className="activity-profile-card-head">
          <h2>{profile.nickname}</h2>
          <button className="activity-profile-edit-link" type="button" onClick={onEdit}>
            수정
          </button>
        </div>
        <p>{profile.bio}</p>
        <div className="activity-profile-card-meta">
          <span>평점 {rating > 0 ? rating.toFixed(1) : '0.0'}</span>
          <span>거래 완료 {completedCount}건</span>
        </div>
        {region && <small>{region}</small>}
        {!isDefault && (
          <button className="activity-profile-deactivate-link" type="button" onClick={onDeactivate}>
            비활성화
          </button>
        )}
      </div>
    </article>
  )
}

function ActivityProfileFormScreen({
  form,
  errors,
  saveState,
  message,
  onChange,
  onErrorsChange,
  hideBack = false,
  titleOverride,
  onBack,
  onSave,
}: {
  form: ActivityProfileFormState
  errors: Record<string, string>
  saveState: 'idle' | 'saving' | 'error'
  message?: string
  onChange: (form: ActivityProfileFormState) => void
  onErrorsChange: (errors: Record<string, string>) => void
  hideBack?: boolean
  titleOverride?: string
  onBack: () => void
  onSave: () => void
}) {
  const [activeExtraModal, setActiveExtraModal] = useState<ProfileExtraModalKind | null>(null)
  const [permissionState, setPermissionState] = useState<LocationPermissionState>('unknown')
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [showNeighborhoodSheet, setShowNeighborhoodSheet] = useState(false)
  const [modeSheetOpen, setModeSheetOpen] = useState(false)
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const isOffline = form.activityMode === 'nearby' || form.activityMode === 'both'
  const title = titleOverride ?? (form.id ? '프로필 수정' : '프로필 만들기')

  useEffect(() => {
    getLocationPermissionState().then(setPermissionState).catch(() => setPermissionState('unknown'))
  }, [])

  function update(patch: Partial<ActivityProfileFormState>) {
    const nextForm = { ...form, ...patch }
    onChange(nextForm)
    const errorKeys = new Set<string>()
    if ('nickname' in patch) errorKeys.add('nickname')
    if ('bio' in patch) errorKeys.add('bio')
    if ('activityMode' in patch) {
      errorKeys.add('activityMode')
      errorKeys.add('region')
    }
    if ('addressText' in patch || 'region2Depth' in patch || 'region3Depth' in patch) errorKeys.add('region')
    if ('linkUrl' in patch) errorKeys.add('linkUrl')
    if ([...errorKeys].some((key) => errors[key])) {
      const latestErrors = validateActivityProfileForm(nextForm)
      const nextErrors = { ...errors }
      errorKeys.forEach((key) => {
        if (latestErrors[key]) {
          nextErrors[key] = latestErrors[key]
          return
        }
        delete nextErrors[key]
      })
      if (Object.keys(nextErrors).some((key) => nextErrors[key] !== errors[key]) || Object.keys(nextErrors).length !== Object.keys(errors).length) {
        onErrorsChange(nextErrors)
      }
    }
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return
    setUploadState('uploading')
    try {
      const uploaded = await uploadImageFile(file, 'profile-avatar')
      update({ avatarUrl: getUploadDisplayUrl(uploaded) })
      setUploadState('idle')
    } catch {
      setUploadState('error')
    } finally {
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  async function uploadSample(file: File | undefined) {
    if (!file || form.workSampleImages.length >= 5) return
    setUploadState('uploading')
    try {
      const uploaded = await uploadImageFile(file, 'task-post')
      const imageUrl = getUploadDisplayUrl(uploaded)
      update({
        workSampleImages: [
          ...form.workSampleImages,
          { ...uploaded, imageUrl, sortOrder: form.workSampleImages.length },
        ],
      })
      setUploadState('idle')
    } catch {
      setUploadState('error')
    }
  }

  async function requestCurrentLocationFromUser() {
    setLocationBusy(true)
    setLocationError('')
    try {
      const current = await requestBrowserLocation()
      const region = await reverseGeocode(current.latitude, current.longitude, 'gps', 'region')
      applyRegion(region, 'granted')
      return region
    } catch (error) {
      const nextPermission = await getLocationPermissionState()
      setPermissionState(nextPermission)
      setLocationError(error instanceof Error ? error.message : '현재 위치를 가져오지 못했습니다.')
      return undefined
    } finally {
      setLocationBusy(false)
    }
  }

  function applyRegion(region: LocationRegion, nextPermissionState = permissionState) {
    update({
      addressText: region.addressText,
      region1Depth: region.region1Depth,
      region2Depth: region.region2Depth,
      region3Depth: region.region3Depth,
      regionCode: region.regionCode,
      latitude: region.latitude,
      longitude: region.longitude,
    })
    storeLocationRegion(toNeighborhoodRegion(region))
    setPermissionState(nextPermissionState)
    setLocationError('')
    setShowNeighborhoodSheet(false)
  }

  function saveProfile() {
    const nextErrors = validateActivityProfileForm(form)
    onErrorsChange(nextErrors)
    const errorKeys = Object.keys(nextErrors)
    if (errorKeys.length > 0) {
      if (nextErrors.linkUrl && errorKeys.length === 1) setActiveExtraModal('link')
      return
    }
    onSave()
  }

  return (
    <section className="screen my-sub-screen activity-profile-form-page profile-flow-page is-create-step">
      <ProfileFlowHeader title={title} onBack={onBack} hideBack={hideBack} />
      {message && <p className={`inline-status ${saveState === 'error' ? 'is-error' : ''}`}>{message}</p>}
      <div className="profile-flow-stack">
        <section className="profile-flow-photo-card">
          <button className="profile-flow-photo-button" type="button" onClick={() => avatarInputRef.current?.click()} aria-label="프로필 사진 등록">
            <ProfileImage profile={formToPreviewProfile(form)} />
            <span>
              {form.avatarUrl ? <Camera size={18} /> : <Plus size={23} />}
            </span>
          </button>
          <input ref={avatarInputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadAvatar(event.target.files?.[0])} />
          <div>
            <h2>프로필 사진 <em>(선택)</em></h2>
            <p>나를 보여줄 수 있는 사진을 등록해 주세요.</p>
          </div>
        </section>

        <ProfileTextField label="닉네임" value={form.nickname} onChange={(nickname) => update({ nickname })} placeholder="닉네임을 입력해 주세요." maxLength={12} error={errors.nickname} />
        <ProfileTextField label="한 줄 소개" value={form.bio} onChange={(bio) => update({ bio })} placeholder="나를 한 줄로 소개해 주세요." maxLength={40} error={errors.bio} />
        <ProfilePickerRow
          title={profileActivityModeLabel(form.activityMode)}
          error={errors.activityMode}
          titleOnly
          onClick={() => setModeSheetOpen(true)}
        />
        {isOffline && (
          <ProfilePickerRow
            title="활동 지역"
            value={form.addressText || '활동 지역을 선택해 주세요.'}
            error={errors.region}
            onClick={() => setShowNeighborhoodSheet(true)}
          />
        )}
        <ProfileOptionalBoost onOpen={setActiveExtraModal} />
        <ProfileExtraSummaryRows form={form} onOpen={setActiveExtraModal} />
        <div className="profile-flow-fixed-action">
          <button className="profile-flow-primary" type="button" disabled={saveState === 'saving'} onClick={saveProfile}>
            {saveState === 'saving' ? '저장 중' : '저장하기'}
          </button>
        </div>
      </div>

      {uploadState === 'uploading' && <p className="inline-status">이미지를 업로드하는 중입니다.</p>}
      {uploadState === 'error' && <p className="inline-status is-error">이미지 업로드에 실패했습니다.</p>}
      {showNeighborhoodSheet && (
        <NeighborhoodSelectSheet
          searchMode="region"
          presentation="modal"
          showCurrentLocation
          promptContext="offer"
          permissionState={permissionState}
          busy={locationBusy}
          error={locationError}
          onUseCurrent={requestCurrentLocationFromUser}
          onSelect={(region) => applyRegion(region, permissionState === 'granted' ? 'granted' : 'prompt')}
          onClose={() => setShowNeighborhoodSheet(false)}
        />
      )}
      {modeSheetOpen && (
        <ProfileModeSheet
          selected={form.activityMode}
          onClose={() => setModeSheetOpen(false)}
          onApply={(activityMode) => {
            update({ activityMode })
            setModeSheetOpen(false)
            if (activityMode !== 'online' && !form.addressText) setShowNeighborhoodSheet(true)
          }}
        />
      )}
      {activeExtraModal && (
        <ProfileExtraModal
          kind={activeExtraModal}
          form={form}
          errors={errors}
          uploadState={uploadState}
          onChange={update}
          onClose={() => setActiveExtraModal(null)}
          onUploadSample={(file) => void uploadSample(file)}
          onRemoveSample={(index) => update({ workSampleImages: form.workSampleImages.filter((_, itemIndex) => itemIndex !== index).map((item, sortOrder) => ({ ...item, sortOrder })) })}
        />
      )}
    </section>
  )
}

function ProfileFlowHeader({
  title,
  hideBack = false,
  onBack,
}: {
  title: string
  hideBack?: boolean
  onBack: () => void
}) {
  return (
    <header className="profile-flow-header">
      {hideBack ? <i /> : (
        <button type="button" onClick={onBack} aria-label="뒤로가기">
          <ChevronRight size={22} />
        </button>
      )}
      <h1>{title}</h1>
      <i />
    </header>
  )
}

function ProfilePickerRow({
  title,
  value = '',
  error,
  titleOnly = false,
  onClick,
}: {
  title: string
  value?: string
  error?: string
  titleOnly?: boolean
  onClick: () => void
}) {
  return (
    <section className={`profile-flow-field-card ${error ? 'has-error' : ''}`}>
      <button type="button" onClick={onClick}>
        <span>
          <strong>{title}</strong>
          {(error || (!titleOnly && value)) && <small className={error ? 'profile-picker-error' : undefined}>{error || value}</small>}
        </span>
        <ChevronRight size={24} />
      </button>
    </section>
  )
}

function ProfileOptionalBoost({ onOpen }: { onOpen: (kind: ProfileExtraModalKind) => void }) {
  return (
    <section className="profile-optional-boost">
      <h2><Info size={21} />프로필을 더 채우면 더 많은 부탁을 받을 수 있어요.</h2>
      <p>(선택사항)</p>
      <div>
        <button type="button" onClick={() => onOpen('career')}><Briefcase size={20} />경력 추가</button>
        <button type="button" onClick={() => onOpen('link')}><LinkIcon size={20} />링크 추가</button>
        <button type="button" onClick={() => onOpen('sample')}><ImagePlus size={20} />사진 추가</button>
      </div>
    </section>
  )
}

function ProfileExtraSummaryRows({
  form,
  onOpen,
}: {
  form: ActivityProfileFormState
  onOpen: (kind: ProfileExtraModalKind) => void
}) {
  const careerValue = [form.careerSummary, form.careerDescription].map((value) => value.trim()).filter(Boolean).join(' · ')
  const linkValue = [form.linkTitle, form.linkUrl].map((value) => value.trim()).filter(Boolean).join(' · ')
  const sampleValue = form.workSampleImages.length > 0 ? `${form.workSampleImages.length}장 추가됨` : ''

  if (!careerValue && !linkValue && !sampleValue) return null

  return (
    <>
      {careerValue && (
        <ProfilePickerRow
          title="경력"
          value={careerValue}
          onClick={() => onOpen('career')}
        />
      )}
      {linkValue && (
        <ProfilePickerRow
          title="링크"
          value={linkValue}
          onClick={() => onOpen('link')}
        />
      )}
      {sampleValue && (
        <ProfilePickerRow
          title="사진"
          value={sampleValue}
          onClick={() => onOpen('sample')}
        />
      )}
    </>
  )
}

function ProfileExtraModal({
  kind,
  form,
  errors,
  uploadState,
  onChange,
  onClose,
  onUploadSample,
  onRemoveSample,
}: {
  kind: ProfileExtraModalKind
  form: ActivityProfileFormState
  errors: Record<string, string>
  uploadState: 'idle' | 'uploading' | 'error'
  onChange: (patch: Partial<ActivityProfileFormState>) => void
  onClose: () => void
  onUploadSample: (file: File | undefined) => void
  onRemoveSample: (index: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const title = kind === 'career' ? '경력 추가' : kind === 'link' ? '링크 추가' : '사진 추가'
  const description = kind === 'career'
    ? '대표 경력과 강점을 짧게 적어주세요.'
    : kind === 'link'
      ? '포트폴리오나 SNS 링크를 입력해주세요.'
      : '대표 작업물을 사진으로 첨부해주세요.'

  return (
    <div className="modal-overlay profile-extra-modal-overlay" role="presentation" onClick={onClose}>
      <section className="profile-extra-modal" role="dialog" aria-modal="true" aria-labelledby={`profile-extra-${kind}-title`} onClick={(event) => event.stopPropagation()}>
        <button className="profile-extra-modal-close" type="button" onClick={onClose} aria-label="닫기">
          <X size={18} />
        </button>
        <h2 id={`profile-extra-${kind}-title`}>{title}</h2>
        <p>{description}</p>

        <div className="profile-extra-modal-body">
          {kind === 'career' && (
            <>
              <ProfileTextField label="경력 한 줄" value={form.careerSummary} onChange={(careerSummary) => onChange({ careerSummary })} placeholder="예: 5년차 그래픽 디자이너" maxLength={80} />
              <label className="profile-textarea-field is-flat profile-extra-textarea">
                <span>상세 소개</span>
                <textarea value={form.careerDescription} onChange={(event) => onChange({ careerDescription: event.target.value })} placeholder="주요 경력, 전문 분야, 강점 등을 소개해주세요." maxLength={1000} />
                <small>{form.careerDescription.length}/1000</small>
              </label>
            </>
          )}

          {kind === 'link' && (
            <>
              <ProfileTextField label="링크 제목" value={form.linkTitle} onChange={(linkTitle) => onChange({ linkTitle })} placeholder="예: 포트폴리오" maxLength={8} />
              <ProfileTextField label="링크 주소" value={form.linkUrl} onChange={(linkUrl) => onChange({ linkUrl })} placeholder="https://portfolio.com/..." error={errors.linkUrl} />
            </>
          )}

          {kind === 'sample' && (
            <>
              <div className="work-sample-list is-profile-flow is-profile-modal">
                {form.workSampleImages.length < 5 && (
                  <button type="button" onClick={() => inputRef.current?.click()}>
                    <Plus size={22} />
                    <em>사진 추가</em>
                  </button>
                )}
                {form.workSampleImages.map((image, index) => (
                  <span key={`${image.storageKey}-${index}`} style={profileImageBackground(image.imageUrl)}>
                    <button type="button" aria-label="삭제" onClick={() => onRemoveSample(index)}>
                      ×
                    </button>
                  </span>
                ))}
                <input
                  ref={inputRef}
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    onUploadSample(event.target.files?.[0])
                    event.currentTarget.value = ''
                  }}
                />
              </div>
              <p className="activity-form-help">JPG, PNG, WebP 파일을 최대 5개까지 첨부할 수 있어요.</p>
              {uploadState === 'uploading' && <p className="inline-status">이미지를 업로드하는 중입니다.</p>}
              {uploadState === 'error' && <p className="inline-status is-error">이미지 업로드에 실패했습니다.</p>}
            </>
          )}
        </div>

        <button className="profile-flow-primary" type="button" onClick={onClose}>
          완료
        </button>
      </section>
    </div>
  )
}

function ProfileModeSheet({
  selected,
  onClose,
  onApply,
}: {
  selected: '' | 'online' | 'nearby' | 'both'
  onClose: () => void
  onApply: (mode: 'online' | 'nearby' | 'both') => void
}) {
  const [draft, setDraft] = useState(selected)
  const modes: Array<{ value: 'online' | 'nearby' | 'both'; title: string; description: string; icon: ReactNode }> = [
    { value: 'online', title: '온라인', description: '채팅 · 통화 · 온라인 작업 가능', icon: <MessageCircle size={30} /> },
    { value: 'nearby', title: '내 주변', description: '직접 이동해서 도와줄 수 있어요', icon: <MapPin size={34} /> },
    { value: 'both', title: '둘 다', description: '온라인과 오프라인 모두 가능', icon: <Globe size={30} /> },
  ]

  return (
    <div className="sheet-overlay is-dimmed" role="presentation" onClick={onClose}>
      <section className="profile-choice-sheet profile-mode-sheet" role="dialog" aria-modal="true" aria-labelledby="profile-mode-title" onClick={(event) => event.stopPropagation()}>
        <div className="drag-handle" />
        <h2 id="profile-mode-title">활동 방식</h2>
        <p>원하는 활동 방식을 선택해주세요</p>
        <div className="profile-mode-list">
          {modes.map((mode) => (
            <button key={mode.value} className={draft === mode.value ? 'is-selected' : ''} type="button" onClick={() => setDraft(mode.value)}>
              <span>{mode.icon}</span>
              <div>
                <strong>{mode.title}</strong>
                <small>{mode.description}</small>
              </div>
              <i />
            </button>
          ))}
        </div>
        <button className="profile-flow-primary" type="button" disabled={!draft} onClick={() => draft && onApply(draft)}>
          선택 완료
        </button>
      </section>
    </div>
  )
}

function ProfileTextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  maxLength?: number
  error?: string
}) {
  const charCount = maxLength ? `${value.length}/${maxLength}` : ''
  return (
    <label className={`profile-text-field ${error ? 'has-error' : ''}`}>
      {label && <span>{label}</span>}
      <div className={`profile-input-wrap ${charCount ? 'has-count' : ''}`}>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} aria-invalid={Boolean(error)} />
        {error ? <small className="profile-inline-error">{error}</small> : charCount && <small className="profile-char-count">{charCount}</small>}
      </div>
    </label>
  )
}

function TaskList({
  items,
  loading,
  emptyTitle,
  emptyText,
  onItemSelect,
}: {
  items: TaskItem[]
  loading: boolean
  emptyTitle: string
  emptyText: string
  onItemSelect?: (item: TaskItem) => void
}) {
  if (loading) {
    return <p className="inline-status">목록을 불러오는 중입니다.</p>
  }

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <strong>{emptyTitle}</strong>
        <span>{emptyText}</span>
      </div>
    )
  }

  return (
    <div className="my-post-list">
      {items.map((item) => <TaskCard key={item.id} item={item} onSelect={onItemSelect ? () => onItemSelect(item) : undefined} />)}
    </div>
  )
}

function TaskCard({ item, onSelect }: { item: TaskItem; onSelect?: () => void }) {
  const content = (
    <>
      <div className="my-activity-card-body">
        <span>{item.category}</span>
        <h2>{item.title}</h2>
        <strong>{formatPrice(item.price)}</strong>
        <p>
          <MapPin size={16} />
          <span>{item.location}</span>
          <Clock size={16} />
          <span>{item.deadline}</span>
        </p>
        {item.note && (
          <small>
            <b>{item.statusLabel}</b>
            <span>{item.note}</span>
          </small>
        )}
      </div>
      <em className={item.filterStatus === '완료' || item.filterStatus === '취소' ? 'is-muted' : ''}>{item.dueSoon ? '마감임박' : item.statusLabel}</em>
      <ChevronRight size={19} />
    </>
  )

  if (onSelect) {
    return (
      <button className="my-activity-card" type="button" onClick={onSelect}>
        {content}
      </button>
    )
  }

  return (
    <article className="my-activity-card">
      {content}
    </article>
  )
}

function ActivityRouteOverlay({
  item,
  onClose,
  onOpenChat,
  onOpenPost,
}: {
  item: TaskItem
  onClose: () => void
  onOpenChat: () => void
  onOpenPost: () => void
}) {
  const hasChat = Boolean(item.conversationId)
  const hasPost = Boolean(item.postId)

  return (
    <div className="sheet-overlay is-centered activity-route-overlay" role="presentation" onClick={onClose}>
      <section className="activity-route-dialog" role="dialog" aria-modal="true" aria-labelledby="activity-route-title" onClick={(event) => event.stopPropagation()}>
        <button className="activity-route-close" type="button" onClick={onClose} aria-label="닫기">
          <X size={18} />
        </button>
        <span>{item.category}</span>
        <h2 id="activity-route-title">{item.title}</h2>
        <p>어디로 이동할까요?</p>
        <div className="activity-route-actions">
          <BrandButton full size="lg" disabled={!hasChat} onClick={onOpenChat}>
            채팅창 이동
          </BrandButton>
          <BrandButton full size="lg" variant="outline" disabled={!hasPost} onClick={onOpenPost}>
            게시글 이동
          </BrandButton>
        </div>
        {!hasChat && <small>아직 연결된 채팅방이 없어요.</small>}
      </section>
    </div>
  )
}

function SettlementScreen({
  initialSummary,
  onBack,
  onSummaryChange,
}: {
  initialSummary: SettlementSummary | null
  onBack: () => void
  onSummaryChange: (summary: SettlementSummary) => void
}) {
  const [summary, setSummary] = useState(initialSummary)
  const [selectedMonth, setSelectedMonth] = useState(initialSummary?.selectedMonth ?? currentMonth())
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(!initialSummary)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadSummary() {
      setIsLoading(true)
      setError('')
      try {
        const nextSummary = await fetchSettlementSummary(selectedMonth)
        if (cancelled) return
        setSummary(nextSummary)
        onSummaryChange(nextSummary)
      } catch (nextError) {
        if (cancelled) return
        setError(nextError instanceof Error ? nextError.message : '수익 정보를 불러오지 못했습니다.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadSummary()
    return () => {
      cancelled = true
    }
  }, [selectedMonth, onSummaryChange])

  const months = summary?.monthlyRevenue.length ? summary.monthlyRevenue : fallbackMonths(selectedMonth)
  const maxRevenue = Math.max(1, ...months.map((item) => item.amount))
  const recentIncome = summary?.recentIncome ?? []

  return (
    <section className="screen my-sub-screen settlement-page">
      <AppHeader title="수익" centered onBack={onBack} />
      <div className="month-select-wrap">
        <button className="month-select-button" type="button" onClick={() => setIsOpen((value) => !value)}>
          <CalendarDays size={17} />
          {formatMonthLabel(selectedMonth)}
          <ChevronRight size={17} />
        </button>
        {isOpen && (
          <div className="month-select-menu">
            {months.map((item) => (
              <button
                key={item.month}
                className={item.month === selectedMonth ? 'is-active' : ''}
                type="button"
                onClick={() => {
                  setSelectedMonth(item.month)
                  setIsOpen(false)
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="inline-status is-error">{error}</p>}
      {isLoading && <p className="inline-status">수익 정보를 불러오는 중입니다.</p>}
      <div className="settlement-summary-grid">
        <MetricCard label="정산 가능 금액" value={formatPrice(summary?.available ?? 0)} accent note="바로 정산 신청 가능" />
        <MetricCard label="이번 달 수익" value={formatPrice(summary?.monthRevenue ?? 0)} note={`총 ${summary?.monthDealCount ?? 0}건`} />
        <MetricCard label="총 누적 수익" value={formatPrice(summary?.totalRevenue ?? 0)} note="가입 이후 누적" />
        <MetricCard label="정산 대기 금액" value={formatPrice(summary?.pendingSettlements ?? 0)} note="정산 신청 중" />
      </div>
      <div className="revenue-chart-card">
        <div className="my-card-title">
          <strong>최근 6개월 수익</strong>
          <span><i />수익(원)</span>
        </div>
        <div className="revenue-chart">
          {months.map((item) => (
            <div key={item.month} className="revenue-bar-column">
              <span>{item.amount.toLocaleString('ko-KR')}</span>
              <i style={{ height: `${Math.max(6, Math.round((item.amount / maxRevenue) * 150))}px` }} />
              <em>{item.label}</em>
            </div>
          ))}
        </div>
      </div>
      <div className="recent-income-card">
        <div className="my-card-title">
          <strong>최근 수익 내역</strong>
          <button type="button">전체 보기 <ChevronRight size={16} /></button>
        </div>
        {recentIncome.length === 0 ? (
          <div className="empty-state compact">
            <strong>선택한 달의 수익 내역이 없어요</strong>
            <span>거래가 완료되면 이곳에 표시됩니다.</span>
          </div>
        ) : recentIncome.map((income) => (
          <div className="income-row" key={getString(income, 'id')}>
            <TaskThumb category={getString(income, 'category')} mode="nearby" small />
            <div>
              <strong>{getString(income, 'title') || '완료된 거래'}</strong>
              <span>{formatFullDate(income.completedAt)} · 완료</span>
            </div>
            <em>{formatPrice(getNumber(income, 'amount'))}</em>
            <ChevronRight size={17} />
          </div>
        ))}
      </div>
    </section>
  )
}

function ReviewsScreen({ reviews, loading, onBack }: { reviews: ActivityRecord[]; loading: boolean; onBack: () => void }) {
  const ratingAverage = reviews.length ? reviews.reduce((sum, review) => sum + getNumber(review, 'rating'), 0) / reviews.length : 0
  const distribution = [5, 4, 3, 2, 1].map((rating) => {
    if (reviews.length === 0) return 0
    return Math.round((reviews.filter((review) => getNumber(review, 'rating') === rating).length / reviews.length) * 100)
  })

  return (
    <section className="screen my-sub-screen reviews-page">
      <AppHeader title="받은 후기" onBack={onBack} />
      <div className="review-summary-card">
        <div>
          <span>전체 평점</span>
          <strong>{ratingAverage.toFixed(1)}</strong>
          <RatingStars rating={Math.round(ratingAverage)} />
          <small>총 {reviews.length}개 후기</small>
        </div>
        <div className="rating-bars">
          {distribution.map((value, index) => (
            <p key={`${5 - index}star`}>
              <span>{5 - index}점</span>
              <i><b style={{ width: `${value}%` }} /></i>
              <em>{value}%</em>
            </p>
          ))}
        </div>
      </div>
      {loading ? (
        <p className="inline-status">후기를 불러오는 중입니다.</p>
      ) : reviews.length === 0 ? (
        <div className="empty-state">
          <strong>아직 받은 후기가 없어요</strong>
          <span>거래가 완료되면 후기가 표시됩니다.</span>
        </div>
      ) : (
        <div className="review-list-modern">
          {reviews.map((review) => (
            <article key={getString(review, 'id')}>
              <InitialAvatar name={getString(review, 'reviewerNickname') || '사용자'} size="md" />
              <div>
                <header>
                  <strong>{getString(review, 'reviewerNickname') || '사용자'}</strong>
                  <span>{formatFullDate(review.createdAt)}</span>
                  <RatingStars rating={getNumber(review, 'rating')} />
                </header>
                <h2>{getString(review, 'postTitle') || '거래 후기'}</h2>
                <p>{getString(review, 'content') || '후기 내용이 없습니다.'}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function AccountScreen({
  onBack,
  onLogout,
  onWithdraw,
  authBusy,
  withdrawBusy,
}: {
  onBack: () => void
  onLogout: () => void
  onWithdraw: () => void
  authBusy: boolean
  withdrawBusy: boolean
}) {
  return (
    <section className="screen my-sub-screen account-page">
      <AppHeader title="" onBack={onBack} />
      <h1 className="account-title">계정 관리</h1>
      <div className="settings-card">
        <SettingsRow icon={<Bell />} title="알림 설정" subtitle="푸시 및 알림 수신 설정을 관리합니다." />
        <SettingsRow icon={<Globe />} title="공개 설정" subtitle="프로필 및 거래 정보 공개 범위를 설정합니다." />
        <SettingsRow icon={<UserRound />} title="개인정보 관리" subtitle="내 정보 확인 및 수정을 할 수 있습니다." />
      </div>
      <div className="settings-card">
        <SettingsRow icon={<FileText />} title="서비스 이용약관" subtitle="뭐든해줌 서비스 이용약관을 확인하세요." href="/terms/service?returnTo=/my" />
        <SettingsRow icon={<Shield />} title="개인정보 처리방침" subtitle="개인정보 처리방침을 확인하세요." href="/terms/privacy?returnTo=/my" />
        <SettingsRow icon={<Headphones />} title="문의하기" subtitle="자주 묻는 질문과 1:1 문의를 이용하세요." href="/my/support" />
      </div>
      <div className="settings-card danger">
        <SettingsRow icon={<UserMinus />} title={withdrawBusy ? '탈퇴 처리 중' : '회원 탈퇴'} subtitle="회원 탈퇴 시 계정이 비활성화됩니다." danger onClick={onWithdraw} />
        <SettingsRow icon={<LogOut />} title={authBusy ? '로그아웃 중' : '로그아웃'} subtitle="현재 계정에서 로그아웃합니다." danger onClick={onLogout} />
      </div>
    </section>
  )
}

function WithdrawConfirmOverlay({
  value,
  busy,
  error,
  onChange,
  onClose,
  onConfirm,
}: {
  value: string
  busy: boolean
  error: string
  onChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="modal-overlay" role="presentation" onClick={busy ? undefined : onClose}>
      <div className="confirm-dialog withdraw-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="withdraw-confirm-title" onClick={(event) => event.stopPropagation()}>
        <span className="withdraw-confirm-badge">
          <TriangleAlert size={16} />
          탈퇴 전 확인
        </span>
        <h2 id="withdraw-confirm-title">정말 탈퇴하시겠어요?</h2>
        <ul className="withdraw-confirm-list">
          <li>탈퇴 후 같은 휴대폰 번호로 30일 동안 회원가입할 수 없습니다.</li>
          <li>신고, 거래, 정산, 분쟁 대응에 필요한 일부 기록은 보관될 수 있습니다.</li>
        </ul>
        <label className="withdraw-confirm-field">
          <span>확인을 위해 아래 문구를 그대로 입력해주세요.</span>
          <input
            value={value}
            disabled={busy}
            onChange={(event) => onChange(event.target.value)}
            placeholder="탈퇴하기"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        {error && <p className="inline-status is-error">{error}</p>}
        <div className="withdraw-confirm-actions">
          <button type="button" onClick={onClose} disabled={busy}>취소</button>
          <button type="button" onClick={onConfirm} disabled={busy}>
            {busy ? '탈퇴 처리 중' : '탈퇴하기'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SupportScreen({ onBack }: { onBack: () => void }) {
  const [activeSheet, setActiveSheet] = useState<'inquiry' | 'faq' | 'report' | null>(null)
  const [inquiryType, setInquiryType] = useState('거래 진행')
  const [inquiryContact, setInquiryContact] = useState('')
  const [inquiryBody, setInquiryBody] = useState('')
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [submitError, setSubmitError] = useState('')
  const [typePickerOpen, setTypePickerOpen] = useState(false)
  const canSubmitInquiry = inquiryBody.trim().length >= 10

  function openInquirySheet() {
    setSubmitState('idle')
    setSubmitError('')
    setTypePickerOpen(false)
    setActiveSheet('inquiry')
  }

  async function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmitInquiry) return

    setSubmitState('saving')
    setSubmitError('')
    try {
      await createSupportInquiry({
        type: inquiryType,
        contact: inquiryContact.trim() || null,
        body: inquiryBody.trim(),
      })
      setInquiryBody('')
      setInquiryContact('')
      setSubmitState('done')
    } catch (error) {
      setSubmitState('error')
      setSubmitError(error instanceof Error ? error.message : '문의 접수에 실패했습니다.')
    }
  }

  return (
    <section className="screen my-sub-screen support-page">
      <AppHeader title="문의하기" centered onBack={onBack} />
      <div className="support-card">
        <Headphones size={34} />
        <strong>무엇을 도와드릴까요?</strong>
        <p>거래, 신고, 정산, 계정 관련 문의를 남겨주시면 운영팀이 확인합니다.</p>
        <BrandButton onClick={openInquirySheet}>1:1 문의 남기기</BrandButton>
      </div>
      <div className="settings-card">
        <SettingsRow icon={<HelpCircle />} title="자주 묻는 질문" subtitle="서비스 이용 중 자주 묻는 내용을 확인하세요." onClick={() => setActiveSheet('faq')} />
        <SettingsRow icon={<TriangleAlert />} title="문제 신고 안내" subtitle="허위 신고 시 서비스 이용이 제한될 수 있습니다." onClick={() => setActiveSheet('report')} />
      </div>
      {activeSheet === 'inquiry' && (
        <SupportBottomSheet title="1:1 문의 남기기" onClose={() => setActiveSheet(null)}>
          <form className="support-form" onSubmit={submitInquiry}>
            {submitState === 'done' && <p className="support-submit-done">문의가 접수되었습니다. 운영팀 확인 후 앱 알림 또는 남겨주신 연락처로 안내드릴게요.</p>}
            {submitState === 'error' && <p className="support-submit-error">{submitError}</p>}
            <div className="support-form-field">
              <span>문의 유형</span>
              <div className={`support-type-picker ${typePickerOpen ? 'is-open' : ''}`}>
                <button type="button" onClick={() => setTypePickerOpen((value) => !value)} aria-expanded={typePickerOpen}>
                  <strong>{inquiryType}</strong>
                  <ChevronRight size={18} />
                </button>
                {typePickerOpen && (
                  <div className="support-type-options">
                    {supportInquiryTypes.map((type) => (
                      <button
                        key={type}
                        className={type === inquiryType ? 'is-selected' : ''}
                        type="button"
                        onClick={() => {
                          setInquiryType(type)
                          setTypePickerOpen(false)
                        }}
                      >
                        {type}
                        {type === inquiryType && <CircleCheck size={16} fill="currentColor" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <label>
              <span>답변 받을 연락처</span>
              <input value={inquiryContact} onChange={(event) => setInquiryContact(event.target.value)} placeholder="휴대폰 번호 또는 이메일" />
            </label>
            <label>
              <span>문의 내용</span>
              <textarea
                value={inquiryBody}
                onChange={(event) => setInquiryBody(event.target.value)}
                placeholder="게시글 제목, 거래 상대, 발생 시간, 필요한 도움을 함께 적어주세요."
                maxLength={1000}
              />
              <small>{inquiryBody.length}/1000 · 10자 이상 입력해주세요.</small>
            </label>
            <BrandButton full size="lg" disabled={!canSubmitInquiry || submitState === 'saving'}>
              {submitState === 'saving' ? '접수 중' : '문의 접수하기'}
            </BrandButton>
          </form>
        </SupportBottomSheet>
      )}
      {activeSheet === 'faq' && (
        <SupportBottomSheet title="자주 묻는 질문" onClose={() => setActiveSheet(null)}>
          <div className="support-faq-list">
            {supportFaqs.map((item) => (
              <article key={item.question}>
                <strong>{item.question}</strong>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </SupportBottomSheet>
      )}
      {activeSheet === 'report' && (
        <SupportBottomSheet title="문제 신고 안내" onClose={() => setActiveSheet(null)}>
          <div className="support-guide-list">
            <p>뭐든해줌은 동네 기반의 작은 부탁 거래를 전제로 합니다. 금전 선입금 유도, 개인정보 요구, 욕설, 노쇼, 위험한 업무 요청은 신고 대상입니다.</p>
            <strong>신고 전 확인</strong>
            <ul>
              <li>게시글 제목, 상대 닉네임, 채팅 내용, 약속 시간처럼 상황을 확인할 수 있는 정보를 남겨주세요.</li>
              <li>앱 밖 결제나 별도 송금을 요구받았다면 거래를 중단하고 신고해주세요.</li>
              <li>긴급하거나 신체 안전이 우려되는 상황은 먼저 112 또는 119에 연락해주세요.</li>
            </ul>
            <strong>신고 방법</strong>
            <ul>
              <li>게시글 상세의 더보기 메뉴에서 신고 또는 차단을 선택할 수 있습니다.</li>
              <li>채팅 중 문제가 생기면 채팅방 신고 메뉴로 접수해주세요.</li>
              <li>허위 신고가 반복되면 서비스 이용이 제한될 수 있습니다.</li>
            </ul>
          </div>
        </SupportBottomSheet>
      )}
    </section>
  )
}

const supportFaqs = [
  {
    question: '부탁을 맡기거나 도와주려면 어떻게 하나요?',
    answer: '홈이나 주변에서 게시글을 고른 뒤 상세 화면의 제가 할게요 또는 문의하기 버튼을 누르면 채팅으로 이어집니다.',
  },
  {
    question: '위치 정보는 어디까지 공개되나요?',
    answer: '해주세요 글은 작성자가 선택한 주소가 게시글과 지도에 공개됩니다. 온라인 글은 위치 정보를 노출하지 않습니다.',
  },
  {
    question: '금액이나 시간을 바꾸고 싶어요.',
    answer: '거래 시작 전에는 채팅에서 상대와 다시 합의해주세요. 이미 진행 중인 거래라면 변경 내용을 채팅에 남겨 분쟁을 줄이는 것이 좋습니다.',
  },
  {
    question: '거래가 끝나면 무엇을 해야 하나요?',
    answer: '부탁 완료 후에는 채팅 또는 마이 화면에서 완료 상태를 확인하고, 상대에게 후기를 남겨 신뢰도를 쌓을 수 있습니다.',
  },
]

const supportInquiryTypes = ['거래 진행', '결제·정산', '신고·차단', '계정·인증', '기타']

function SupportBottomSheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <section className="support-bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="support-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="drag-handle" />
        <header>
          <h2 id="support-sheet-title">{title}</h2>
          <button type="button" onClick={onClose} aria-label="닫기">닫기</button>
        </header>
        <div className="support-sheet-content">{children}</div>
      </section>
    </div>
  )
}

function ManageScreen({
  onBack,
  onOpenBlocks,
  onOpenReports,
  settlementSummary,
  activity,
}: {
  onBack: () => void
  onOpenBlocks: () => void
  onOpenReports: () => void
  settlementSummary: SettlementSummary | null
  activity: MyActivity
}) {
  const recentReviews = activity.receivedReviews
  const myPosts = activity.myPosts.map(postToTaskItem).slice(0, 3)

  return (
    <section className="screen manage-screen">
      <AppHeader title="정산/후기 관리" subtitle="정산과 후기를 관리해보세요" onBack={onBack} showBell showSearch />
      <div className="settlement-card">
        <div className="settlement-top">
          <span>
            <WalletCards size={23} />
            정산 현황
          </span>
          <button type="button">
            정산 내역 보기
            <ChevronRight size={17} />
          </button>
        </div>
        <p>정산 가능 금액</p>
        <strong>{formatPrice(settlementSummary?.available ?? 0)}</strong>
        <BrandButton variant="outline">정산 신청하기</BrandButton>
        <dl>
          <div>
            <dt>총 수익</dt>
            <dd>{formatPrice(settlementSummary?.totalRevenue ?? 0)}</dd>
          </div>
          <div>
            <dt>완료된 정산</dt>
            <dd>{formatPrice(settlementSummary?.completedSettlements ?? 0)}</dd>
          </div>
        </dl>
        <small>정산 신청은 최소 10,000원 이상부터 가능해요.</small>
      </div>

      <div className="manage-group">
        <ManageRow icon={<Star />} title="받은 후기" subtitle="거래 후 받은 후기를 확인하세요" />
        <ManageRow icon={<BarChart3 />} title="내가 남긴 후기" subtitle="내가 작성한 후기를 확인하세요" />
      </div>

      <div className="review-card">
        <h2>최근 받은 후기</h2>
        {recentReviews.length > 0 ? (
          recentReviews.slice(0, 3).map((review) => (
            <article key={getString(review, 'id')}>
              <div>
                <strong>{getString(review, 'reviewerNickname') || '사용자'}</strong>
                <time>{formatDate(review.createdAt)}</time>
              </div>
              <RatingStars rating={getNumber(review, 'rating')} />
              <p>{getString(review, 'content') || '후기 내용이 없습니다.'}</p>
            </article>
          ))
        ) : (
          <div className="empty-state compact">
            <strong>아직 받은 후기가 없어요</strong>
            <span>거래가 완료되면 후기가 이곳에 표시됩니다.</span>
          </div>
        )}
      </div>

      <div className="manage-group">
        <ManageRow icon={<Ban />} title="차단한 사용자" subtitle={`${activity.blocks.length}명 차단됨`} onClick={onOpenBlocks} />
        <ManageRow icon={<TriangleAlert />} title="신고 내역" subtitle={`${activity.reports.length}건 접수됨`} onClick={onOpenReports} />
        <ManageRow icon={<HelpCircle />} title="고객센터" subtitle="자주 묻는 질문과 문의하기" muted />
        <ManageRow icon={<Settings />} title="앱 설정" subtitle="알림, 개인정보, 언어 설정" muted />
      </div>

      <div className="my-request-snapshot">
        <h2>내 부탁 상태</h2>
        {myPosts.length > 0 ? myPosts.map((item) => (
          <div key={item.id}>
            <span>{item.title}</span>
            <em>{item.statusLabel}</em>
          </div>
        )) : (
          <div className="empty-state compact">
            <strong>등록한 부탁이 없어요</strong>
            <span>부탁을 등록하면 상태가 표시됩니다.</span>
          </div>
        )}
      </div>
    </section>
  )
}

function BlocksReportsScreen({
  initialTab,
  blocks,
  reports,
  onBack,
  onRemoved,
  onWithdraw,
  withdrawBusy,
}: {
  initialTab: 'blocks' | 'reports'
  blocks: ActivityRecord[]
  reports: ActivityRecord[]
  onBack: () => void
  onRemoved: (blockedUserId: string) => void
  onWithdraw: () => void
  withdrawBusy: boolean
}) {
  const [activeTab, setActiveTab] = useState<'blocks' | 'reports'>(initialTab)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  async function unblock(blockedUserId: string) {
    setBusyId(blockedUserId)
    setError('')
    try {
      await deleteBlock(blockedUserId)
      onRemoved(blockedUserId)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '차단을 해제하지 못했습니다.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="screen my-sub-screen moderation-page">
      <AppHeader title="차단/신고 관리" centered onBack={onBack} />
      <div className="split-tabs">
        <button className={activeTab === 'blocks' ? 'is-active' : ''} type="button" onClick={() => setActiveTab('blocks')}>차단 목록</button>
        <button className={activeTab === 'reports' ? 'is-active' : ''} type="button" onClick={() => setActiveTab('reports')}>신고 내역</button>
      </div>
      {activeTab === 'blocks' ? (
        <>
          <p className="moderation-copy">원하지 않는 사용자를 차단하여 안전하게 이용하세요.</p>
          {error && <p className="inline-status is-error">{error}</p>}
          <div className="moderation-card">
            <div className="moderation-card-title">
              <span><ShieldCheck size={18} />차단한 사용자 <b>{blocks.length}</b></span>
              <small><Info size={16} />차단 안내</small>
            </div>
            {blocks.length === 0 ? (
              <div className="empty-state compact">
                <strong>차단한 사용자가 없어요</strong>
                <span>차단하면 이곳에서 해제할 수 있습니다.</span>
              </div>
            ) : blocks.map((block) => {
              const blockedUserId = getString(block, 'blockedUserId')
              const nickname = getString(block, 'blockedNickname') || '사용자'
              return (
                <article className="blocked-user-row" key={getString(block, 'id') || blockedUserId}>
                  <InitialAvatar name={nickname} size="md" />
                  <div>
                    <strong>{nickname}</strong>
                    <span>차단일 {formatFullDate(block.createdAt)}</span>
                  </div>
                  <button type="button" disabled={busyId === blockedUserId || !blockedUserId} onClick={() => void unblock(blockedUserId)}>
                    {busyId === blockedUserId ? '해제 중' : '해제'}
                  </button>
                </article>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <p className="moderation-copy">신고한 내역과 처리 상태를 확인할 수 있습니다.</p>
          <div className="moderation-card">
            <div className="moderation-card-title">
              <span><Flag size={18} />신고 내역 <b>{reports.length}</b></span>
            </div>
            {reports.length === 0 ? (
              <div className="empty-state compact">
                <strong>신고 내역이 없어요</strong>
                <span>신고가 접수되면 이곳에서 상태를 확인할 수 있습니다.</span>
              </div>
            ) : reports.map((report) => (
              <article className="report-modern-row" key={getString(report, 'id')}>
                <span className="report-modern-icon"><Flag /></span>
                <div>
                  <strong>{getString(report, 'postTitle') || getString(report, 'reason') || '신고 내역'}</strong>
                  <small>신고 사유&nbsp;&nbsp;{getString(report, 'description') || getString(report, 'reason') || '-'}</small>
                  <small>신고일&nbsp;&nbsp;{formatFullDate(report.createdAt)}</small>
                </div>
                <em className={`moderation-status ${getString(report, 'status')}`}>{mapReportStatus(getString(report, 'status'))}</em>
              </article>
            ))}
          </div>
        </>
      )}
      <p className="my-footnote">신고는 커뮤니티의 안전을 위한 중요한 수단입니다. 허위 신고 시 서비스 이용에 제한이 있을 수 있습니다.</p>
      <button className="withdraw-cta" type="button" disabled={withdrawBusy} onClick={onWithdraw}>
        <UserMinus size={19} />
        {withdrawBusy ? '탈퇴 처리 중' : '탈퇴하기'}
      </button>
    </section>
  )
}

function SegmentTabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (tab: string) => void }) {
  return (
    <div className="my-segment-tabs">
      {tabs.map((tab) => (
        <button className={tab === active ? 'is-active' : ''} type="button" key={tab} onClick={() => onChange(tab)}>
          {tab}
        </button>
      ))}
    </div>
  )
}

function ChipTabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (tab: string) => void }) {
  return (
    <div className="my-chip-tabs">
      {tabs.map((tab) => (
        <button className={tab === active ? 'is-active' : ''} type="button" key={tab} onClick={() => onChange(tab)}>
          {tab}
        </button>
      ))}
    </div>
  )
}

function MetricCard({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong className={accent ? 'is-accent' : ''}>{value}</strong>
      <small>{accent && <CircleCheck size={13} fill="currentColor" />}{note}</small>
    </div>
  )
}

function SettingsRow({
  icon,
  title,
  subtitle,
  href,
  danger = false,
  onClick,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  href?: string
  danger?: boolean
  onClick?: () => void
}) {
  const content = (
    <>
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
      <ChevronRight size={19} />
    </>
  )

  if (href) {
    return (
      <a className={`settings-row ${danger ? 'is-danger' : ''}`} href={href}>
        {content}
      </a>
    )
  }

  return (
    <button className={`settings-row ${danger ? 'is-danger' : ''}`} type="button" onClick={onClick}>
      {content}
    </button>
  )
}

function MenuGroup({ children }: { children: ReactNode }) {
  return <div className="menu-group">{children}</div>
}

function MenuItem({
  icon,
  title,
  value,
  badge,
  muted = false,
  onClick,
}: {
  icon: ReactNode
  title: string
  value?: string
  badge?: string
  muted?: boolean
  onClick?: () => void
}) {
  return (
    <button className={`menu-item ${muted ? 'is-muted' : ''}`} type="button" onClick={onClick}>
      <span className="menu-icon">{icon}</span>
      <strong>{title}</strong>
      {value && <em>{value}</em>}
      {badge && <b>{badge}</b>}
      <ChevronRight size={19} />
    </button>
  )
}

function ManageRow({
  icon,
  title,
  subtitle,
  muted = false,
  onClick,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  muted?: boolean
  onClick?: () => void
}) {
  return (
    <button className={`manage-row ${muted ? 'is-muted' : ''}`} type="button" onClick={onClick}>
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
      <ChevronRight size={19} />
    </button>
  )
}

function InitialAvatar({ name, size, imageUrl }: { name: string; size: 'sm' | 'md' | 'lg'; imageUrl?: string }) {
  if (imageUrl) {
    return (
      <span className={`initial-avatar initial-avatar-${size} is-photo`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Runtime profile URLs may be external; CSS controls the avatar crop. */}
        <img src={imageUrl} alt="" aria-hidden="true" />
      </span>
    )
  }

  return (
    <span className={`initial-avatar initial-avatar-${size}`}>
      {name.trim().slice(0, 1) || '만'}
    </span>
  )
}

function TaskThumb({ category, mode, small = false }: { category: string; mode: string; small?: boolean }) {
  const Icon = mode === 'online' ? Monitor : category.includes('깨워') ? Bell : category.includes('들어') ? Headphones : category.includes('대신') ? Package : HeartHandshake
  return (
    <span className={`task-thumb ${small ? 'task-thumb-sm' : ''}`}>
      <Icon size={small ? 18 : 23} />
    </span>
  )
}

function postToTaskItem(post: ActivityPost): TaskItem {
  const status = getString(post, 'status')
  const favoriteCount = getNumber(post, 'favoriteCount')
  const applicationCount = getNumber(post, 'applicationCount')
  return {
    id: getString(post, 'id'),
    postId: getString(post, 'id'),
    conversationId: getString(post, 'conversationId') || null,
    title: getString(post, 'title') || '제목 없는 부탁',
    category: getString(post, 'category') || '기타',
    price: getNumber(post, 'price'),
    mode: getString(post, 'mode') || 'nearby',
    location: formatLocation(post),
    deadline: formatDeadline(post.deadlineAt, post.deadlineText, post.availableTimeText),
    statusLabel: mapPostStatus(status),
    filterStatus: toPostFilterStatus(status),
    note: `찜 ${favoriteCount} · 문의 ${applicationCount}`,
  }
}

function dealToTaskItem(deal: ActivityRecord): TaskItem {
  const status = getString(deal, 'status')
  return {
    id: getString(deal, 'id'),
    postId: getString(deal, 'postId'),
    conversationId: getString(deal, 'conversationId') || null,
    title: getString(deal, 'postTitle') || '거래한 부탁',
    category: getString(deal, 'postCategory') || '기타',
    price: getNumber(deal, 'price'),
    mode: getString(deal, 'postMode') || 'nearby',
    location: formatLocation(deal, 'post'),
    deadline: formatDeadline(deal.postDeadlineAt, deal.postDeadlineText, deal.postAvailableTimeText),
    statusLabel: mapDealStatus(status),
    filterStatus: toDealFilterStatus(status),
    note: `${getString(deal, 'requesterNickname') || '요청자'}님과의 거래`,
  }
}

function favoriteToTaskItem(favorite: ActivityRecord): TaskItem {
  const status = getString(favorite, 'postStatus')
  const dueSoon = isDueSoon(favorite.postDeadlineAt)
  return {
    id: getString(favorite, 'id') || getString(favorite, 'postId'),
    postId: getString(favorite, 'postId'),
    conversationId: null,
    title: getString(favorite, 'postTitle') || '찜한 부탁',
    category: getString(favorite, 'postCategory') || '기타',
    price: getNumber(favorite, 'postPrice'),
    mode: getString(favorite, 'postMode') || 'nearby',
    location: formatLocation(favorite, 'post'),
    deadline: formatDeadline(favorite.postDeadlineAt, favorite.postDeadlineText, favorite.postAvailableTimeText),
    statusLabel: mapPostStatus(status),
    filterStatus: dueSoon ? '마감임박' : toPostFilterStatus(status),
    dueSoon,
  }
}

function isRemovedPostError(error: unknown) {
  if (!(error instanceof Error)) return false
  return error.message === '삭제된 게시물입니다.' || error.message === '게시글을 찾을 수 없습니다.'
}

function filterTaskItems(items: TaskItem[], active: string) {
  if (active === '전체') return items
  return items.filter((item) => item.filterStatus === active)
}

function getString(record: ActivityRecord, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function getNumber(record: ActivityRecord, key: string, fallback = 0) {
  const value = record[key]
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toProfileGender(value: unknown): ActivityProfile['gender'] {
  if (value === 'male' || value === 'female' || value === 'unknown' || value === 'private') return value
  return null
}

function createEmptyActivityProfileForm(gender?: ActivityProfile['gender']): ActivityProfileFormState {
  return {
    avatarUrl: null,
    defaultAvatarKey: defaultProfileAvatars[0],
    gender: gender ?? null,
    nickname: '',
    bio: '',
    activityMode: '',
    addressText: '',
    region1Depth: '',
    region2Depth: '',
    region3Depth: '',
    regionCode: null,
    latitude: null,
    longitude: null,
    careerSummary: '',
    careerDescription: '',
    linkTitle: '',
    linkUrl: '',
    availableTimeText: '',
    basePriceText: '',
    workSampleImages: [],
    phoneVerified: false,
    ratingAvg: 0,
    reviewCount: 0,
    completedCount: 0,
  }
}

function activityProfileToForm(profile: ActivityProfile): ActivityProfileFormState {
  const link = profile.portfolioLinks?.[0]
  return {
    id: profile.id,
    avatarUrl: profile.avatarUrl ?? null,
    defaultAvatarKey: profile.defaultAvatarKey || defaultProfileAvatars[0],
    gender: profile.gender ?? null,
    nickname: profile.nickname,
    bio: profile.bio,
    activityMode: profile.activityMode,
    addressText: profile.addressText ?? '',
    region1Depth: profile.region1Depth ?? profile.region1depth ?? '',
    region2Depth: profile.region2Depth ?? profile.region2depth ?? '',
    region3Depth: profile.region3Depth ?? profile.region3depth ?? '',
    regionCode: profile.regionCode ?? null,
    latitude: profile.latitude ?? null,
    longitude: profile.longitude ?? null,
    careerSummary: profile.careerSummary ?? '',
    careerDescription: profile.careerDescription ?? '',
    linkTitle: link?.title ?? '',
    linkUrl: link?.url ?? '',
    availableTimeText: profile.availableTimeText ?? '',
    basePriceText: profile.basePrice ? String(profile.basePrice) : '',
    workSampleImages: Array.isArray(profile.workSampleImages) ? profile.workSampleImages : [],
    phoneVerified: profile.phoneVerified,
    ratingAvg: profile.ratingAvg,
    reviewCount: profile.reviewCount,
    completedCount: profile.completedCount,
  }
}

function validateActivityProfileForm(form: ActivityProfileFormState) {
  const errors: Record<string, string> = {}
  const nickname = form.nickname.trim().replace(/\s+/g, '')
  if (nickname.length < 2 || nickname.length > 12) errors.nickname = '닉네임은 2~12자로 입력해주세요.'
  if (!form.bio.trim()) errors.bio = '한 줄 소개를 입력해주세요.'
  if (!form.activityMode) {
    errors.activityMode = '활동 방식을 선택해주세요.'
  } else if ((form.activityMode === 'nearby' || form.activityMode === 'both') && (!form.region2Depth || !form.region3Depth)) {
    errors.region = '활동 지역을 선택해주세요.'
  }
  if (form.linkUrl.trim() && !isValidHttpUrl(form.linkUrl)) {
    errors.linkUrl = 'http 또는 https 링크를 입력해주세요.'
  }
  return errors
}

function activityProfileFormToPayload(form: ActivityProfileFormState): ActivityProfilePayload {
  if (!form.activityMode) throw new Error('활동 방식을 선택해주세요.')
  const activityMode = form.activityMode
  const linkUrl = form.linkUrl.trim()
  return {
    avatarUrl: form.avatarUrl,
    defaultAvatarKey: form.defaultAvatarKey,
    nickname: form.nickname.trim().replace(/\s+/g, ''),
    bio: form.bio.trim(),
    activityMode,
    addressText: activityMode === 'online' ? null : form.addressText.trim() || null,
    region1Depth: activityMode === 'online' ? null : form.region1Depth || null,
    region2Depth: activityMode === 'online' ? null : form.region2Depth || null,
    region3Depth: activityMode === 'online' ? null : form.region3Depth || null,
    regionCode: activityMode === 'online' ? null : form.regionCode,
    latitude: activityMode === 'online' ? null : form.latitude,
    longitude: activityMode === 'online' ? null : form.longitude,
    careerSummary: form.careerSummary.trim() || null,
    careerDescription: form.careerDescription.trim() || null,
    portfolioLinks: linkUrl ? [{ title: form.linkTitle.trim() || '포트폴리오', url: linkUrl }] : [],
    workSampleImages: form.workSampleImages,
    availableTimeText: form.availableTimeText.trim() || null,
    basePrice: form.basePriceText ? Number(form.basePriceText) : null,
  }
}

function formToPreviewProfile(form: ActivityProfileFormState): ActivityProfile {
  return {
    id: form.id ?? 'preview',
    userId: '',
    avatarUrl: form.avatarUrl,
    defaultAvatarKey: form.defaultAvatarKey,
    gender: form.gender ?? null,
    nickname: form.nickname || '만부탁',
    bio: form.bio,
    activityMode: form.activityMode || 'online',
    addressText: form.addressText || null,
    latitude: form.latitude,
    longitude: form.longitude,
    careerSummary: null,
    careerDescription: null,
    portfolioLinks: [],
    workSampleImages: [],
    availableTimeText: null,
    basePrice: null,
    isActive: true,
  }
}

function ProfileImage({ profile }: { profile: Pick<ActivityProfile, 'avatarUrl' | 'defaultAvatarKey' | 'nickname' | 'gender'> }) {
  if (profile.avatarUrl) {
    return (
      <span className="activity-profile-image is-photo">
        {/* eslint-disable-next-line @next/next/no-img-element -- User-uploaded avatar URLs can be runtime external URLs; CSS controls the crop. */}
        <img src={profile.avatarUrl} alt="" aria-hidden="true" />
      </span>
    )
  }
  const avatarIndex = Number(String(profile.defaultAvatarKey ?? 'default-1').replace(/[^0-9]/g, '')) || 1
  if (profile.defaultAvatarKey) {
    return <span className={`activity-profile-image is-default default-${avatarIndex}`}>{profile.nickname.trim().slice(0, 1) || '만'}</span>
  }
  const fallbackImageUrl = getDefaultProfileImageByGender(profile.gender)
  if (fallbackImageUrl) {
    return (
      <span className="activity-profile-image is-photo">
        {/* eslint-disable-next-line @next/next/no-img-element -- Static public profile defaults are rendered through img for consistency with uploaded avatars. */}
        <img src={fallbackImageUrl} alt="" aria-hidden="true" />
      </span>
    )
  }
  return <span className={`activity-profile-image is-default default-${avatarIndex}`}>{profile.nickname.trim().slice(0, 1) || '만'}</span>
}

function getUploadDisplayUrl(image: { imageUrl: string; storageKey: string }) {
  const displayUrl = getDisplayImageUrl(image) ?? image.imageUrl
  if (/^https?:\/\//i.test(displayUrl)) return displayUrl
  if (typeof window === 'undefined') return image.imageUrl
  return new URL(displayUrl, window.location.origin).toString()
}

function profileImageBackground(imageUrl: string | null | undefined) {
  return imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined
}

function profileActivityModeLabel(mode: '' | 'online' | 'nearby' | 'both') {
  if (!mode) return '활동 방식'
  if (mode === 'online') return '온라인'
  if (mode === 'nearby') return '내 주변'
  return '둘 다 가능'
}

function getActivityProfileRegion(profile: ActivityProfile) {
  return [profile.region1Depth ?? profile.region1depth, profile.region2Depth ?? profile.region2depth, profile.region3Depth ?? profile.region3depth].filter(Boolean).join(' ')
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function mapReportStatus(status: string) {
  if (status === 'reviewed') return '검토 중'
  if (status === 'resolved') return '처리 완료'
  if (status === 'rejected') return '반려'
  return '접수됨'
}

function mapPostStatus(status: string) {
  if (status === 'completed') return '완료'
  if (status === 'cancelled' || status === 'hidden') return '취소'
  if (status === 'pending') return '수락대기'
  if (status === 'in_progress') return '진행중'
  return '모집중'
}

function mapDealStatus(status: string) {
  if (status === 'completed') return '완료'
  if (status === 'cancelled' || status === 'disputed') return '취소'
  if (status === 'complete_requested') return '완료 요청'
  if (status === 'accepted' || status === 'in_progress') return '진행중'
  return '진행중'
}

function toPostFilterStatus(status: string): FilterStatus {
  if (status === 'completed') return '완료'
  if (status === 'cancelled' || status === 'hidden') return '취소'
  return '진행중'
}

function toDealFilterStatus(status: string): FilterStatus {
  if (status === 'completed') return '완료'
  if (status === 'cancelled' || status === 'disputed') return '취소'
  return '진행중'
}

function formatLocation(record: ActivityRecord, prefix = '') {
  const region3 = getString(record, `${prefix}Region3depth`)
  const region2 = getString(record, `${prefix}Region2depth`)
  const address = getString(record, `${prefix}AddressText`)
  const mode = getString(record, `${prefix}Mode`) || getString(record, 'mode')
  if (mode === 'online') return '온라인'
  return region3 || region2 || address || '위치 협의'
}

function formatDeadline(value: unknown, deadlineText?: unknown, availableTimeText?: unknown) {
  const text = typeof deadlineText === 'string' && deadlineText ? deadlineText : typeof availableTimeText === 'string' && availableTimeText ? availableTimeText : ''
  if (!value) return text || '시간 협의'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return text || '시간 협의'
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDate(value: unknown) {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

function formatFullDate(value: unknown) {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) return currentDateLabel()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

function formatPrice(value: number) {
  return `${Math.max(0, value).toLocaleString('ko-KR')}원`
}

function isDueSoon(value: unknown) {
  if (!value) return false
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return false
  const diff = date.getTime() - Date.now()
  return diff > 0 && diff <= 1000 * 60 * 60 * 24 * 3
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function currentDateLabel() {
  const now = new Date()
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
}

function formatMonthLabel(month: string) {
  const [year, monthIndex] = month.split('-')
  return `${year}년 ${Number(monthIndex)}월`
}

function fallbackMonths(selectedMonth: string) {
  const [year, monthIndex] = selectedMonth.split('-').map(Number)
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex - 1 + index - 5, 1))
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    return {
      month,
      label: `${String(date.getUTCFullYear()).slice(2)}년 ${date.getUTCMonth() + 1}월`,
      amount: 0,
    }
  })
}
