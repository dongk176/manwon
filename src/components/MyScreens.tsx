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
import { notifyNativeProfileOnboardingCompleted, requestIOSPushPermission } from '@/components/NativeIOSBridge'
import { PhoneVerificationOverlay } from '@/components/PhoneVerificationOverlay'
import {
  createSupportInquiry,
  createActivityProfile,
  checkActivityProfileNickname,
  createTaskPost,
  deactivateActivityProfile,
  deleteBlock,
  fetchTaskPost,
  fetchActivityProfiles,
  fetchMyActivity,
  fetchMyPage,
  fetchSettlementSummary,
  generateOnboardingBioDraft,
  getDefaultProfileImageByGender,
  getDisplayImageUrl,
  isPhoneVerificationRequired,
  isDefaultActivityProfile,
  logout,
  normalizeDisplayImageUrl,
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
  requestDeals: ActivityRecord[]
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
  requestDeals: [],
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
  const profileDefaults = useMemo(() => {
    const profile = myPage ?? {}
    return {
      nickname: getString(profile, 'nickname') || getString(profile, 'displayName'),
      avatarUrl: getString(profile, 'avatarUrl') || null,
    }
  }, [myPage])

  if (section === 'activity' || section === 'requests' || section === 'helped') {
    return withWithdrawOverlay(
      <MyActivityScreen
        requestDeals={activity.requestDeals}
        helpedDeals={activity.helpedDeals}
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
      <SignupOnboardingFlow
        userGender={userGender}
        profileDefaults={profileDefaults}
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

  const nickname = getString(myPage ?? {}, 'defaultActivityProfileNickname') || getString(myPage ?? {}, 'nickname') || '뭐든해줌'
  const profileBio = getString(myPage ?? {}, 'defaultActivityProfileBio') || '뭐든해줌에서 안전하게 부탁을 주고받아보세요.'
  const avatarUrl = getString(myPage ?? {}, 'defaultActivityProfileAvatarUrl') || getString(myPage ?? {}, 'avatarUrl')
  const defaultAvatarKey = getString(myPage ?? {}, 'defaultActivityProfileDefaultAvatarKey') || null
  const ratingAvg = getNumber(myPage ?? {}, 'ratingAvg')
  const completedCount = getNumber(myPage ?? {}, 'completedCount')
  const favoriteCount = getNumber(myPage ?? {}, 'favoriteCount', activity.favorites.length)
  const receivedReviewCount = getNumber(myPage ?? {}, 'receivedReviewCount', activity.receivedReviews.length)
  const isAuthenticated = Boolean(getString(myPage ?? {}, 'id'))

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
        <ProfileImage profile={{ avatarUrl: avatarUrl || null, defaultAvatarKey, nickname, gender: userGender }} />
        <div className="profile-main">
          <h2>
            {nickname}
            <ChevronRight size={20} />
          </h2>
          <p>{profileBio}</p>
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
        {!isAuthenticated && <MenuItem icon={<LogIn />} title="로그인 / 회원가입" badge="권장" onClick={() => router.push('/login?next=/my')} />}
        <MenuItem icon={<Ban />} title="차단/신고 관리" onClick={() => router.push('/my/blocks')} muted />
        {isAuthenticated && <MenuItem icon={<LogOut />} title={authBusy ? '로그아웃 중' : '로그아웃'} onClick={() => void handleLogout()} muted />}
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
        <button className="support-link-button" type="button" onClick={() => router.push('/terms/location?returnTo=/my')}>
          <MapPin size={17} />
          위치기반서비스 약관
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
  requestDeals,
  helpedDeals,
  loading,
  initialTab,
}: {
  requestDeals: ActivityRecord[]
  helpedDeals: ActivityRecord[]
  loading: boolean
  initialTab: MyActivityTab
}) {
  const [activeTab, setActiveTab] = useState<MyActivityTab>(initialTab)
  const [activeStatus, setActiveStatus] = useState('전체')
  const [selectedItem, setSelectedItem] = useState<TaskItem | null>(null)
  const [postGuide, setPostGuide] = useState<{ title: string; description: string } | null>(null)
  const router = useRouter()
  const requestDealItems = useMemo(() => requestDeals.map(dealToTaskItem), [requestDeals])
  const helpedDealItems = useMemo(() => helpedDeals.map(dealToTaskItem), [helpedDeals])
  const activeItems = activeTab === '내 부탁' ? requestDealItems : helpedDealItems
  const filteredItems = filterTaskItems(activeItems, activeStatus)
  const emptyTitle = activeTab === '내 부탁' ? '아직 진행한 부탁 거래가 없어요' : '아직 해준 일이 없어요'
  const emptyText = activeTab === '내 부탁'
    ? '내가 올린 해주세요 게시물에서 거래가 시작되면 이곳에서 확인할 수 있습니다.'
    : '제가 할게요나 문의하기로 채팅이 시작되면 이곳에서 확인할 수 있습니다.'

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
  nicknameEdited?: boolean
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
type ActivityProfileDefaults = {
  nickname?: string
  avatarUrl?: string | null
}

const defaultProfileAvatars = ['default-1', 'default-2', 'default-3', 'default-4']
const aiBioDraftCooldownSeconds = 60
const aiBioDraftRateWindowMs = 2 * 60 * 1000
const aiBioDraftNoticeThreshold = 6
const onboardingMinimumOfferPrice = 1000
const onboardingMinimumOfferPriceLabel = '1,000원'

type SignupOnboardingStep = 'profile' | 'bio' | 'examples' | 'offer'
type OnboardingSaveState = 'idle' | 'checking' | 'saving' | 'error'
type OnboardingPostImage = { imageUrl: string; storageKey: string; sortOrder: number }

const onboardingExampleCards = [
  { title: '썸 카톡 해석해드려요', price: '20,000원', description: '답장 하나에도 의미 부여해드립니다.' },
  { title: '아침에 진짜 깨워드려요', price: '5,000원', description: '알람 꺼버리고 다시 자는 분들께 전화드립니다.' },
  { title: '벌레 잡아드립니다', price: '10,000원', description: '자취방에 나타난 벌레, 대신 처리해드려요.' },
  { title: '고민 들어드려요', price: '10,000원', description: '말 못 할 고민, 편하게 들어드릴게요.' },
  { title: '데이트코스, 선물 대신 알아봐드립니다', price: '5,000원', description: '맛집, 선물, 데이트 코스 대신 찾아드려요.' },
  { title: '공부나 다이어트 하라고 잔소리해드려요', price: '3,000원', description: '시작하기 힘든 분들께 약속한 시간에 연락드려요.' },
  { title: '운동 인증 체크해드려요', price: '3,000원', description: '운동했는지 확인하고 계속 하게 도와드려요.' },
  { title: '선물 대신 골라드려요', price: '5,000원', description: '상황과 예산에 맞춰 선물을 추천해드려요.' },
  { title: '친구인 척 전화해드려요', price: '3,000원', description: '어색한 상황에서 자연스럽게 전화해드려요.' },
  { title: '편의점 심부름 해드려요', price: '5,000원', description: '가까운 거리의 간단한 심부름을 도와드려요.' },
  { title: '카톡 답장 같이 짜드려요', price: '3,000원', description: '어떻게 답장할지 같이 고민해드려요.' },
  { title: '면접 답변 연습해드려요', price: '10,000원', description: '예상 질문에 맞춰 답변을 같이 다듬어드려요.' },
  { title: '발표 대본 들어드려요', price: '8,000원', description: '말이 어색한 부분을 듣고 짧게 피드백해드려요.' },
  { title: '자기소개서 문장 다듬어드려요', price: '15,000원', description: '내가 쓴 문장을 더 자연스럽게 정리해드려요.' },
  { title: '중고거래 문구 같이 써드려요', price: '3,000원', description: '상품 설명과 가격 제안 문장을 같이 만들어드려요.' },
  { title: '여행 일정 가볍게 짜드려요', price: '10,000원', description: '일정과 취향에 맞춰 동선을 간단히 정리해드려요.' },
  { title: '맛집 후보 정리해드려요', price: '5,000원', description: '지역과 취향에 맞춰 갈 만한 곳을 추려드려요.' },
  { title: '장보기 목록 정리해드려요', price: '3,000원', description: '필요한 물건을 빠뜨리지 않게 목록으로 정리해드려요.' },
  { title: '택배 반품 방법 찾아드려요', price: '3,000원', description: '복잡한 반품 절차를 대신 확인해드려요.' },
  { title: '가전제품 비교표 만들어드려요', price: '10,000원', description: '후보 제품의 가격과 장단점을 표로 정리해드려요.' },
  { title: '휴대폰 요금제 비교해드려요', price: '8,000원', description: '사용 패턴에 맞는 요금제 후보를 찾아드려요.' },
  { title: '공연 예매 일정 체크해드려요', price: '3,000원', description: '오픈 시간과 준비할 정보를 미리 정리해드려요.' },
  { title: '사진 셀렉 도와드려요', price: '5,000원', description: '프로필이나 업로드용 사진 후보를 같이 골라드려요.' },
  { title: 'SNS 프로필 문구 써드려요', price: '5,000원', description: '짧고 자연스러운 소개 문구를 같이 만들어드려요.' },
  { title: '생일 축하 멘트 녹음해드려요', price: '5,000원', description: '짧은 축하 메시지를 따뜻하게 녹음해드려요.' },
  { title: '잠깐 통화하며 산책해드려요', price: '8,000원', description: '혼자 걷기 심심할 때 가볍게 통화해드려요.' },
  { title: '동네 웨이팅 상황 확인해드려요', price: '8,000원', description: '가게 앞 줄이나 현장 분위기를 대신 확인해드려요.' },
  { title: '프린트 심부름 해드려요', price: '5,000원', description: '근처에서 문서 출력이나 복사를 도와드려요.' },
  { title: '생활용품 사다드려요', price: '8,000원', description: '가까운 편의점이나 마트에서 필요한 물건을 사다드려요.' },
  { title: '분리수거 같이 도와드려요', price: '10,000원', description: '헷갈리는 분리수거를 같이 정리해드려요.' },
  { title: '작은 가구 조립 도와드려요', price: '20,000원', description: '혼자 하기 애매한 조립을 옆에서 도와드려요.' },
  { title: '택배 옮기는 것 도와드려요', price: '10,000원', description: '무겁거나 많은 택배를 문 앞까지 같이 옮겨드려요.' },
  { title: '이사 박스 몇 개 옮겨드려요', price: '20,000원', description: '짧은 거리의 작은 짐 옮기기를 도와드려요.' },
  { title: '강아지 산책 동행해드려요', price: '10,000원', description: '동네 산책을 함께하며 보호자 곁에서 도와드려요.' },
  { title: '식물 물주기 도와드려요', price: '5,000원', description: '잠깐 집을 비울 때 식물 상태를 확인해드려요.' },
  { title: '집 앞 상황 사진 찍어드려요', price: '5,000원', description: '멀리 있어 확인하기 어려운 현장을 사진으로 보내드려요.' },
  { title: '분실물 찾기 동선 같이 봐드려요', price: '5,000원', description: '어디서 잃어버렸을지 동선을 같이 정리해드려요.' },
  { title: '예약 전화 대신 해드려요', price: '5,000원', description: '전화가 부담스러울 때 필요한 내용을 확인해드려요.' },
  { title: '공지나 메일 내용 요약해드려요', price: '3,000원', description: '긴 안내문에서 중요한 내용만 뽑아드려요.' },
  { title: '짧은 영어 문장 확인해드려요', price: '5,000원', description: '어색한 표현이나 오타를 가볍게 봐드려요.' },
  { title: '노션 표 정리해드려요', price: '10,000원', description: '흩어진 내용을 보기 좋게 표로 정리해드려요.' },
  { title: '엑셀 목록 정리해드려요', price: '10,000원', description: '간단한 리스트를 보기 좋게 정돈해드려요.' },
  { title: '캘린더 일정 정리해드려요', price: '5,000원', description: '약속과 할 일을 날짜별로 깔끔하게 정리해드려요.' },
  { title: '아침 루틴 체크해드려요', price: '3,000원', description: '정해둔 루틴을 했는지 메시지로 확인해드려요.' },
  { title: '청소 시작하게 전화해드려요', price: '5,000원', description: '미루던 청소를 시작하도록 짧게 독려해드려요.' },
  { title: '게임 같이 한 판 해드려요', price: '5,000원', description: '혼자 하기 심심한 게임을 함께 플레이해드려요.' },
  { title: '오늘 입을 옷 같이 골라드려요', price: '5,000원', description: '날씨와 일정에 맞는 옷 조합을 같이 골라드려요.' },
  { title: '모임 장소 후보 찾아드려요', price: '8,000원', description: '인원, 위치, 분위기에 맞는 장소를 추려드려요.' },
  { title: '중요한 말 연습 상대 해드려요', price: '8,000원', description: '고백, 사과, 요청처럼 떨리는 말을 같이 연습해드려요.' },
  { title: '하루 계획 같이 세워드려요', price: '5,000원', description: '해야 할 일을 시간대별로 현실적으로 나눠드려요.' },
]

const onboardingOfferTitleExamples = [
  '카톡 답장 같이 짜드려요',
  '썸 카톡 의미 해석해드려요',
  '고민 편하게 들어드려요',
  '면접 답변 연습해드려요',
  '발표 대본 들어드려요',
  '자기소개서 문장 다듬어드려요',
  '중고거래 문구 같이 써드려요',
  'SNS 프로필 문구 써드려요',
  '짧은 영어 문장 확인해드려요',
  '공지나 메일 내용 요약해드려요',
  '노션 표 정리해드려요',
  '엑셀 목록 정리해드려요',
  '캘린더 일정 정리해드려요',
  '하루 계획 같이 세워드려요',
  '아침 루틴 체크해드려요',
  '공부하라고 잔소리해드려요',
  '다이어트 루틴 체크해드려요',
  '운동 인증 체크해드려요',
  '청소 시작하게 전화해드려요',
  '아침에 진짜 깨워드려요',
  '잠깐 통화하며 산책해드려요',
  '게임 같이 한 판 해드려요',
  '사진 셀렉 도와드려요',
  '오늘 입을 옷 같이 골라드려요',
  '선물 대신 골라드려요',
  '데이트 코스 짜드려요',
  '맛집 후보 정리해드려요',
  '여행 일정 가볍게 짜드려요',
  '모임 장소 후보 찾아드려요',
  '가전제품 비교표 만들어드려요',
  '휴대폰 요금제 비교해드려요',
  '공연 예매 일정 체크해드려요',
  '택배 반품 방법 찾아드려요',
  '예약 전화 대신 해드려요',
  '전화 문의 대신 해드려요',
  '중요한 말 연습 상대 해드려요',
  '사과 문장 같이 정리해드려요',
  '생일 축하 멘트 녹음해드려요',
  '유튜브 영상 내용 요약해드려요',
  '블로그 글 초안 다듬어드려요',
  '편의점 심부름 해드려요',
  '생활용품 사다드려요',
  '프린트 심부름 해드려요',
  '동네 웨이팅 상황 확인해드려요',
  '집 앞 상황 사진 찍어드려요',
  '택배 옮기는 것 도와드려요',
  '작은 가구 조립 도와드려요',
  '분리수거 같이 도와드려요',
  '식물 물주기 도와드려요',
  '벌레 잡아드립니다',
]

function getRandomOnboardingOfferTitleExample() {
  if (typeof crypto === 'undefined') return onboardingOfferTitleExamples[0]
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return onboardingOfferTitleExamples[(values[0] ?? 0) % onboardingOfferTitleExamples.length] ?? onboardingOfferTitleExamples[0]
}

function SignupOnboardingFlow({
  userGender,
  profileDefaults,
}: {
  userGender?: ActivityProfile['gender']
  profileDefaults?: ActivityProfileDefaults
}) {
  const router = useRouter()
  const profileInputRef = useRef<HTMLInputElement>(null)
  const postImageInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<SignupOnboardingStep>('profile')
  const [nickname, setNickname] = useState(() => normalizeProfileDefaultNickname(profileDefaults?.nickname))
  const [nicknameEdited, setNicknameEdited] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profileDefaults?.avatarUrl ?? null)
  const [bio, setBio] = useState('')
  const [bioError, setBioError] = useState('')
  const [aiBioState, setAiBioState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [aiBioError, setAiBioError] = useState('')
  const [aiBioDraftRequestTimestamps, setAiBioDraftRequestTimestamps] = useState<number[]>([])
  const [aiBioCooldownRemaining, setAiBioCooldownRemaining] = useState(0)
  const [showAiBioRateLimit, setShowAiBioRateLimit] = useState(false)
  const [savedProfileId, setSavedProfileId] = useState('')
  const [showProfileGuide, setShowProfileGuide] = useState(false)
  const [showProfileReadyGuide, setShowProfileReadyGuide] = useState(false)
  const [profileState, setProfileState] = useState<OnboardingSaveState>('idle')
  const [profileError, setProfileError] = useState('')
  const [avatarUploadState, setAvatarUploadState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [postTitle, setPostTitle] = useState('')
  const [postTitleExample, setPostTitleExample] = useState(onboardingOfferTitleExamples[0])
  const [postTitleExamplesOpen, setPostTitleExamplesOpen] = useState(false)
  const [postPrice, setPostPrice] = useState('')
  const [postDescription, setPostDescription] = useState('')
  const [postImages, setPostImages] = useState<OnboardingPostImage[]>([])
  const [postImageUploadState, setPostImageUploadState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [postErrors, setPostErrors] = useState<Record<string, string>>({})
  const [postState, setPostState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [postError, setPostError] = useState('')
  const [showPostConfirm, setShowPostConfirm] = useState(false)
  const [completedPost, setCompletedPost] = useState<ApiTaskPost | null>(null)
  const [showPhoneVerification, setShowPhoneVerification] = useState(false)
  const defaultNickname = normalizeProfileDefaultNickname(profileDefaults?.nickname)
  const effectiveNickname = nicknameEdited ? nickname : nickname || defaultNickname
  const effectiveAvatarUrl = avatarUrl ?? profileDefaults?.avatarUrl ?? null
  const aiBioButtonLabel = aiBioState === 'loading'
    ? 'AI가 쓰는 중'
    : aiBioCooldownRemaining > 0
      ? `${aiBioCooldownRemaining}초 후 다시 대필`
      : 'AI가 소개를 써줘요'

  useEffect(() => {
    if (aiBioCooldownRemaining <= 0) return
    const timer = window.setTimeout(() => {
      setAiBioCooldownRemaining((current) => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [aiBioCooldownRemaining])

  function goToStep(nextStep: SignupOnboardingStep) {
    setStep(nextStep)
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0)
  }

  function updateNickname(value: string) {
    setNickname(value)
    setNicknameEdited(true)
    if (profileError) setProfileError('')
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return
    setAvatarUploadState('uploading')
    setProfileError('')
    try {
      const uploaded = await uploadImageFile(file, 'profile-avatar')
      setAvatarUrl(getUploadDisplayUrl(uploaded))
      setAvatarUploadState('idle')
    } catch {
      setAvatarUploadState('error')
    } finally {
      if (profileInputRef.current) profileInputRef.current.value = ''
    }
  }

  async function uploadPostImage(file: File | undefined) {
    if (!file || postImages.length >= 5) return
    setPostImageUploadState('uploading')
    setPostError('')
    try {
      const uploaded = await uploadImageFile(file, 'task-post')
      setPostImages((current) => [
        ...current,
        {
          imageUrl: getUploadDisplayUrl(uploaded),
          storageKey: uploaded.storageKey,
          sortOrder: current.length,
        },
      ])
      setPostErrors((current) => {
        if (!current.images) return current
        const next = { ...current }
        delete next.images
        return next
      })
      setPostImageUploadState('idle')
    } catch {
      setPostImageUploadState('error')
    } finally {
      if (postImageInputRef.current) postImageInputRef.current.value = ''
    }
  }

  async function handleProfileNext() {
    const normalizedNickname = normalizeOnboardingNickname(effectiveNickname)
    if (!isValidOnboardingNickname(normalizedNickname)) {
      setProfileError('닉네임은 2~12자로 입력해주세요.')
      return
    }
    setProfileState('checking')
    setProfileError('')
    try {
      const result = await checkActivityProfileNickname(normalizedNickname)
      if (!result.available) {
        setProfileState('idle')
        setProfileError('이미 사용 중인 닉네임입니다.')
        return
      }
      setProfileState('idle')
      setShowProfileGuide(true)
    } catch (error) {
      setProfileState('error')
      setProfileError(error instanceof Error ? error.message : '닉네임을 확인하지 못했습니다.')
    }
  }

  async function ensureProfileSaved() {
    if (savedProfileId) return savedProfileId
    const normalizedNickname = normalizeOnboardingNickname(effectiveNickname)
    if (!isValidOnboardingNickname(normalizedNickname)) {
      setStep('profile')
      setProfileError('닉네임은 2~12자로 입력해주세요.')
      throw new Error('닉네임은 2~12자로 입력해주세요.')
    }
    if (!bio.trim()) {
      setBioError('한 줄 소개를 입력해주세요.')
      goToStep('bio')
      throw new Error('한 줄 소개를 입력해주세요.')
    }

    setProfileState('saving')
    setProfileError('')
    try {
      const saved = await createActivityProfile({
        avatarUrl: effectiveAvatarUrl,
        defaultAvatarKey: defaultProfileAvatars[0],
        nickname: normalizedNickname,
        bio: bio.trim(),
        activityMode: 'online',
        addressText: null,
        region1Depth: null,
        region2Depth: null,
        region3Depth: null,
        regionCode: null,
        latitude: null,
        longitude: null,
        careerSummary: null,
        careerDescription: null,
        portfolioLinks: [],
        workSampleImages: [],
        availableTimeText: null,
        basePrice: null,
      })
      setSavedProfileId(saved.id)
      setProfileState('idle')
      notifyNativeProfileOnboardingCompleted()
      return saved.id
    } catch (error) {
      setProfileState('error')
      const message = error instanceof Error ? error.message : '프로필을 저장하지 못했습니다.'
      setProfileError(message)
      if (message.includes('닉네임') || message.includes('프로필')) setStep('profile')
      throw error
    }
  }

  async function goHomeAfterProfile() {
    try {
      await ensureProfileSaved()
      router.replace('/?welcome=1')
    } catch {
      // Error state is shown near the active CTA.
    }
  }

  async function handleBioNext() {
    if (!bio.trim()) {
      setBioError('한 줄 소개를 입력해주세요.')
      return
    }
    setBioError('')
    try {
      await ensureProfileSaved()
      setShowProfileReadyGuide(true)
    } catch {
      // Error state is shown near the active CTA.
    }
  }

  function startOfferRegistration() {
    if (!bio.trim()) {
      setBioError('한 줄 소개를 입력해주세요.')
      goToStep('bio')
      return
    }
    setPostTitleExample(getRandomOnboardingOfferTitleExample())
    goToStep('offer')
  }

  async function requestAiBioDraft() {
    if (aiBioState === 'loading' || aiBioCooldownRemaining > 0) return
    const now = Date.now()
    const recentRequestTimestamps = aiBioDraftRequestTimestamps.filter((requestedAt) => now - requestedAt < aiBioDraftRateWindowMs)
    const nextRequestTimestamps = [...recentRequestTimestamps, now]
    setAiBioDraftRequestTimestamps(nextRequestTimestamps)
    if (nextRequestTimestamps.length >= aiBioDraftNoticeThreshold) {
      setAiBioCooldownRemaining(aiBioDraftCooldownSeconds)
      setShowAiBioRateLimit(true)
    }
    setAiBioState('loading')
    setAiBioError('')
    try {
      const result = await generateOnboardingBioDraft()
      setBio(result.bio)
      setBioError('')
      setAiBioState('idle')
    } catch (error) {
      setAiBioState('error')
      setAiBioError(error instanceof Error ? error.message : 'AI 대필에 실패했어요. 잠시 후 다시 시도해주세요.')
    }
  }

  function validatePostDraft() {
    const errors: Record<string, string> = {}
    const price = Number(postPrice)
    if (!postTitle.trim()) errors.title = '제목을 입력해주세요.'
    if (!postPrice || !Number.isInteger(price)) {
      errors.price = '금액을 입력해주세요.'
    } else if (price < onboardingMinimumOfferPrice) {
      errors.price = `최소 ${onboardingMinimumOfferPriceLabel}`
    }
    if (!postDescription.trim()) errors.description = '상세 설명을 입력해주세요.'
    if (postImages.length < 1) errors.images = '사진을 1장 이상 추가해주세요.'
    return errors
  }

  function handlePostPriceChange(value: string) {
    setPostPrice(value.replace(/[^0-9]/g, '').slice(0, 7))
    if (postErrors.price) {
      setPostErrors((current) => {
        const next = { ...current }
        delete next.price
        return next
      })
    }
  }

  function requestPostSubmit() {
    const errors = validatePostDraft()
    setPostErrors(errors)
    setPostError('')
    if (Object.keys(errors).length > 0) return
    setShowPostConfirm(true)
  }

  function selectPostTitleExample(title: string) {
    setPostTitle(title)
    setPostTitleExamplesOpen(false)
    if (postErrors.title) {
      setPostErrors((current) => {
        const next = { ...current }
        delete next.title
        return next
      })
    }
  }

  async function submitPost() {
    const errors = validatePostDraft()
    setPostErrors(errors)
    if (Object.keys(errors).length > 0) {
      setShowPostConfirm(false)
      return
    }

    setPostState('saving')
    setPostError('')
    try {
      const profileId = await ensureProfileSaved()
      const createdPost = await createTaskPost({
        profileId,
        postType: 'offer',
        title: postTitle.trim(),
        description: postDescription.trim(),
        mode: 'online',
        price: Number(postPrice),
        availableTimeText: null,
        genderVisibility: 'private',
        capacityType: 'unlimited',
        capacityLimit: null,
        addressText: null,
        region1Depth: null,
        region2Depth: null,
        region3Depth: null,
        regionCode: null,
        locationSource: null,
        latitude: null,
        longitude: null,
        images: postImages,
        workSampleImages: [],
        trustExampleImages: [],
      })
      requestIOSPushPermission('post_created')
      setCompletedPost(createdPost)
      setShowPostConfirm(false)
      setPostState('idle')
    } catch (error) {
      if (isPhoneVerificationRequired(error)) {
        setPostState('idle')
        setShowPostConfirm(false)
        setShowPhoneVerification(true)
        return
      }
      setPostState('error')
      setPostError(error instanceof Error ? error.message : '게시글을 등록하지 못했습니다.')
      setShowPostConfirm(false)
    }
  }

  if (step === 'profile') {
    const normalizedNickname = normalizeOnboardingNickname(effectiveNickname)
    const canContinue = isValidOnboardingNickname(normalizedNickname) && profileState !== 'checking'
    return (
      <section className="screen signup-onboarding-screen is-profile-step">
        <div className="signup-onboarding-centered-stack">
          <div className="signup-onboarding-hero">
            <h1>반가워요!<br />먼저 당신을 소개해주세요</h1>
            <p>닉네임과 사진은 거래할 때 첫인상처럼 보여요.</p>
          </div>

          <div className="signup-onboarding-form">
            <section className="signup-profile-photo-card">
              <button className="signup-profile-photo-button" type="button" onClick={() => profileInputRef.current?.click()} aria-label="프로필 사진 선택">
                <ProfileImage profile={{ avatarUrl: effectiveAvatarUrl, defaultAvatarKey: defaultProfileAvatars[0], nickname: normalizedNickname || '만', gender: userGender ?? null }} />
                <span><Camera size={18} /></span>
              </button>
              <input ref={profileInputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadAvatar(event.target.files?.[0])} />
              <div>
                <strong>프로필 사진 <em>선택</em></strong>
                <p>사진은 나중에 바꿀 수 있어요</p>
                {avatarUploadState === 'uploading' && <small>사진을 올리는 중이에요.</small>}
                {avatarUploadState === 'error' && <small className="is-error">사진 업로드에 실패했어요.</small>}
              </div>
            </section>

            <label className={`signup-onboarding-field ${profileError ? 'has-error' : ''}`}>
              <span>닉네임 <em>필수</em></span>
              <input value={effectiveNickname} onChange={(event) => updateNickname(event.target.value)} placeholder="예: 친절한 민지, 자취도우미, 카톡해석러" maxLength={18} />
              {profileError && <small>{profileError}</small>}
            </label>
          </div>
        </div>

        <div className="signup-onboarding-fixed-action is-single">
          <button className="signup-onboarding-primary" type="button" disabled={!canContinue} onClick={() => void handleProfileNext()}>
            {profileState === 'checking' ? '확인 중' : '다음'}
          </button>
        </div>

        {showProfileGuide && (
          <OnboardingDialog
            title={'좋아요!\n이제 사람들이 당신을 기억할 수 있어요.'}
            description={'다음은 한 줄 소개예요.\n거창하지 않아도 괜찮아요.'}
            primaryLabel="확인"
            onPrimary={() => {
              setShowProfileGuide(false)
              goToStep('bio')
            }}
          />
        )}
      </section>
    )
  }

  if (step === 'bio') {
    return (
      <section className="screen signup-onboarding-screen is-bio-step">
        <div className="signup-onboarding-centered-stack">
          <div className="signup-onboarding-hero">
            <h1>나를 한 줄로 소개해주세요</h1>
            <p>어떤 사람인지 가볍게 알려주세요.<br />나중에 언제든 바꿀 수 있어요.</p>
          </div>

          <div className="signup-onboarding-form">
            <label className={`signup-onboarding-textarea-field is-bio-intro ${bioError ? 'has-error' : ''}`}>
              <span>한 줄 소개 <em>필수</em></span>
              <textarea
                value={bio}
                onChange={(event) => {
                  setBio(event.target.value)
                  if (bioError) setBioError('')
                  if (aiBioError) setAiBioError('')
                }}
                placeholder="예: 친구처럼 고민 잘 들어줘요"
                maxLength={60}
              />
              <small>{bioError || `${bio.length}/60 · 나중에 언제든 바꿀 수 있어요.`}</small>
            </label>

            <button className="signup-ai-draft-button" type="button" disabled={aiBioState === 'loading' || aiBioCooldownRemaining > 0} onClick={() => void requestAiBioDraft()}>
              {aiBioButtonLabel}
            </button>
            {aiBioError && <p className="signup-ai-draft-error">{aiBioError}</p>}

            {profileError && <p className="signup-onboarding-error">{profileError}</p>}
          </div>
        </div>
        <div className="signup-onboarding-fixed-action is-split">
          <button className="signup-onboarding-secondary" type="button" onClick={() => goToStep('profile')}>
            이전
          </button>
          <button className="signup-onboarding-primary" type="button" disabled={profileState === 'saving' || !bio.trim()} onClick={() => void handleBioNext()}>
            {profileState === 'saving' ? '저장 중' : '완료'}
          </button>
        </div>
        {showProfileReadyGuide && (
          <OnboardingDialog
            title="프로필이 준비되었어요!"
            description="이제 내가 해줄 수 있는 일을 등록하고 바로 시작해요!"
            primaryLabel="확인"
            onPrimary={() => {
              setShowProfileReadyGuide(false)
              goToStep('examples')
            }}
          />
        )}
        {showAiBioRateLimit && (
          <OnboardingDialog
            title="요청이 너무 잦아요"
            description={`AI 대필은 잠시 후 다시 사용할 수 있어요.\n${aiBioCooldownRemaining || aiBioDraftCooldownSeconds}초 뒤에 다시 시도해주세요.`}
            primaryLabel="확인"
            onPrimary={() => setShowAiBioRateLimit(false)}
            onClose={() => setShowAiBioRateLimit(false)}
          />
        )}
      </section>
    )
  }

  if (step === 'examples') {
    return (
      <>
        <section className="screen signup-onboarding-screen signup-offer-examples-page">
          <div className="signup-onboarding-hero">
            <h1>할 수 있는 일을 하나만 올려보세요</h1>
            <p>사소한 도움도 거래가 될 수 있어요.</p>
          </div>
          <p className="signup-example-note">이런 일부터 시작해볼 수 있어요</p>

          <div className="signup-example-grid">
            {onboardingExampleCards.map((example) => (
              <article key={example.title} className="signup-example-card">
                <strong>{example.title}</strong>
                <b>{example.price}</b>
                <p>{example.description}</p>
              </article>
            ))}
          </div>

          {profileError && <p className="signup-onboarding-error">{profileError}</p>}
        </section>
        <div className="signup-onboarding-fixed-action is-split is-examples-action">
          <button className="signup-onboarding-secondary" type="button" disabled={profileState === 'saving'} onClick={() => void goHomeAfterProfile()}>
            나중에
          </button>
          <button className="signup-onboarding-primary" type="button" disabled={profileState === 'saving'} onClick={startOfferRegistration}>
            {profileState === 'saving' ? '저장 중' : '지금 바로 시작하기'}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <section className="screen signup-onboarding-screen signup-offer-write-page">
        <div className="signup-onboarding-hero">
          <h1>나는 어떤 일을 해줄 수 있나요?</h1>
          <p>가볍게 하나만 올려보세요.<br />올린 뒤에도 언제든 수정할 수 있어요.</p>
        </div>

        <div className="signup-onboarding-form">
          <div className={`signup-onboarding-field ${postErrors.title ? 'has-error' : ''}`}>
            <span>제목 <em>필수</em></span>
            <div className="signup-title-input-wrap">
              <input value={postTitle} onChange={(event) => setPostTitle(event.target.value)} placeholder={`예: ${postTitleExample}`} maxLength={80} />
              <button className="signup-title-example-trigger" type="button" onClick={() => setPostTitleExamplesOpen(true)}>
                예시
              </button>
            </div>
            {postErrors.title && <small>{postErrors.title}</small>}
          </div>
          <label className={`signup-onboarding-field ${postErrors.price ? 'has-error' : ''}`}>
            <span>금액 <em>필수</em></span>
            <div className="signup-price-input-wrap">
              <input inputMode="numeric" value={postPrice} onChange={(event) => handlePostPriceChange(event.target.value)} placeholder="예: 3000" />
              {postErrors.price && <span className="signup-price-input-error">{postErrors.price}</span>}
            </div>
            {!postErrors.price && <small>처음에는 1,000원~5,000원처럼 가볍게 시작해보세요.</small>}
          </label>
          <label className={`signup-onboarding-textarea-field ${postErrors.description ? 'has-error' : ''}`}>
            <span>상세 설명 <em>필수</em></span>
            <textarea value={postDescription} onChange={(event) => setPostDescription(event.target.value)} placeholder="가능한 시간, 진행 방식, 도와줄 수 있는 범위를 적어주세요." maxLength={1200} />
            {postErrors.description && <small>{postErrors.description}</small>}
          </label>
          <section className="signup-post-photo-card">
            <div>
              <strong>사진 첨부 <em>필수</em></strong>
              <p>사진을 1장 이상 추가해주세요.</p>
            </div>
            <div className="signup-post-image-list">
              {postImages.map((image, index) => (
                <span key={`${image.storageKey}-${index}`} style={profileImageBackground(image.imageUrl)}>
                  <button
                    type="button"
                    aria-label="사진 삭제"
                    onClick={() => setPostImages((current) => current.filter((_, itemIndex) => itemIndex !== index).map((item, sortOrder) => ({ ...item, sortOrder })))}
                  >
                    ×
                  </button>
                </span>
              ))}
              {postImages.length < 5 && (
                <button type="button" onClick={() => postImageInputRef.current?.click()}>
                  <ImagePlus size={20} />
                  사진 추가
                </button>
              )}
              <input ref={postImageInputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadPostImage(event.target.files?.[0])} />
            </div>
            {postImageUploadState === 'uploading' && <small>사진을 올리는 중이에요.</small>}
            {postImageUploadState === 'error' && <small className="is-error">사진 업로드에 실패했어요.</small>}
            {postErrors.images && <small className="is-error">{postErrors.images}</small>}
          </section>
        </div>

        {postError && <p className="signup-onboarding-error">{postError}</p>}
      </section>
      <div className="signup-onboarding-fixed-action is-single with-note">
        <button className="signup-onboarding-primary" type="button" disabled={postState === 'saving'} onClick={requestPostSubmit}>
          {postState === 'saving' ? '등록 중' : '첫 해줄게요 등록하기'}
        </button>
        <small>등록 후에도 언제든 수정할 수 있어요.</small>
      </div>

      {postTitleExamplesOpen && (
        <OnboardingOfferTitleExampleSheet
          examples={onboardingOfferTitleExamples}
          onSelect={selectPostTitleExample}
          onClose={() => setPostTitleExamplesOpen(false)}
        />
      )}

      {showPostConfirm && (
        <OnboardingDialog
          title="이대로 첫 해줄게요를 올릴까요?"
          description={'올리면 바로 사람들이 문의할 수 있어요.\n제목, 금액, 설명은 나중에 수정할 수 있어요.'}
          primaryLabel={postState === 'saving' ? '등록 중' : '네, 등록할게요'}
          secondaryLabel="조금 더 수정하기"
          primaryDisabled={postState === 'saving'}
          onPrimary={() => void submitPost()}
          onSecondary={() => setShowPostConfirm(false)}
          onClose={() => setShowPostConfirm(false)}
        />
      )}

      {completedPost && (
        <OnboardingDialog
          title="첫 해줄게요가 등록됐어요!"
          description={'이제 누군가 필요할 때\n당신에게 바로 문의할 수 있어요.'}
          primaryLabel="내 게시글 보러가기"
          secondaryLabel="다른 해줄게요 둘러보기"
          preview={(
            <article className="signup-complete-preview-card">
              <strong>{completedPost.title}</strong>
              <b>{formatPrice(completedPost.price)}</b>
              <p>{completedPost.description}</p>
            </article>
          )}
          onPrimary={() => router.replace(`/posts/${encodeURIComponent(completedPost.id)}`)}
          onSecondary={() => router.replace('/')}
        />
      )}

      {showPhoneVerification && (
        <PhoneVerificationOverlay
          onClose={() => setShowPhoneVerification(false)}
          onVerified={() => void submitPost()}
        />
      )}
    </>
  )
}

function OnboardingOfferTitleExampleSheet({
  examples,
  onSelect,
  onClose,
}: {
  examples: string[]
  onSelect: (title: string) => void
  onClose: () => void
}) {
  return (
    <div className="sheet-overlay onboarding-title-example-overlay" role="presentation" onClick={onClose}>
      <section
        className="onboarding-title-example-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title-example-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drag-handle" />
        <h2 id="onboarding-title-example-title">제목 예시</h2>
        <div className="onboarding-title-example-list">
          {examples.map((example) => (
            <button key={example} type="button" onClick={() => onSelect(example)}>
              {example}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function OnboardingDialog({
  title,
  description,
  primaryLabel,
  secondaryLabel,
  tertiaryLabel,
  primaryDisabled = false,
  preview,
  onPrimary,
  onSecondary,
  onTertiary,
  onClose,
}: {
  title: string
  description: string
  primaryLabel: string
  secondaryLabel?: string
  tertiaryLabel?: string
  primaryDisabled?: boolean
  preview?: ReactNode
  onPrimary: () => void
  onSecondary?: () => void
  onTertiary?: () => void
  onClose?: () => void
}) {
  return (
    <div className="modal-overlay signup-onboarding-dialog-overlay" role="presentation" onClick={onClose}>
      <section className="signup-onboarding-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p>{description}</p>
        {preview}
        <div className="signup-onboarding-dialog-actions">
          <button type="button" disabled={primaryDisabled} onClick={onPrimary}>
            {primaryLabel}
          </button>
          {secondaryLabel && (
            <button type="button" disabled={primaryDisabled} onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
          {tertiaryLabel && (
            <button className="is-text" type="button" disabled={primaryDisabled} onClick={onTertiary}>
              {tertiaryLabel}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

function normalizeOnboardingNickname(value: string) {
  return value.trim().replace(/\s+/g, '')
}

function isValidOnboardingNickname(value: string) {
  return value.length >= 2 && value.length <= 12
}

function ActivityProfilesScreen({
  onBack,
  onboarding = false,
  userGender,
  profileDefaults,
  onComplete,
}: {
  onBack?: () => void
  onboarding?: boolean
  userGender?: ActivityProfile['gender']
  profileDefaults?: ActivityProfileDefaults
  onComplete?: () => void
}) {
  const [profiles, setProfiles] = useState<ActivityProfile[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(onboarding ? 'ready' : 'loading')
  const [formState, setFormState] = useState<ActivityProfileFormState | null>(
    onboarding ? createEmptyActivityProfileForm(userGender, profileDefaults) : null,
  )
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [successToast, setSuccessToast] = useState('')
  const activeFormState = useMemo(() => {
    if (!formState) return formState

    let nextForm = formState
    if (onboarding && !nextForm.id && profileDefaults) {
      const defaultNickname = normalizeProfileDefaultNickname(profileDefaults.nickname)
      const nickname = !nextForm.nicknameEdited && !nextForm.nickname ? defaultNickname : nextForm.nickname
      const avatarUrl = nextForm.avatarUrl ?? profileDefaults.avatarUrl ?? null
      if (nickname !== nextForm.nickname || avatarUrl !== nextForm.avatarUrl) {
        nextForm = { ...nextForm, nickname, avatarUrl }
      }
    }

    if (!nextForm.id && !nextForm.gender && userGender) {
      return { ...nextForm, gender: userGender }
    }
    return nextForm
  }, [formState, onboarding, profileDefaults, userGender])

  useEffect(() => {
    if (!successToast) return undefined
    const toastTimer = window.setTimeout(() => {
      setSuccessToast('')
    }, 2200)
    return () => window.clearTimeout(toastTimer)
  }, [successToast])

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
    setSuccessToast('')
    setSaveState('idle')
    setFormState(activityProfileToForm(profile))
  }

  async function saveProfile(nextForm: ActivityProfileFormState) {
    const nextErrors = validateActivityProfileForm(nextForm)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSaveState('saving')
    setMessage('')
    setSuccessToast('')
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
      setSuccessToast(nextForm.id ? '프로필이 수정되었습니다.' : '프로필이 등록되었습니다.')
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
        successToast={successToast}
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
  successToast,
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
  successToast?: string
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
  const hasRequiredProfileFields = hasRequiredActivityProfileFields(form)

  useEffect(() => {
    getLocationPermissionState().then(setPermissionState).catch(() => setPermissionState('unknown'))
  }, [])

  function update(patch: Partial<ActivityProfileFormState>) {
    const nextForm = { ...form, ...patch, ...('nickname' in patch ? { nicknameEdited: true } : {}) }
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
    if (!hasRequiredProfileFields) return
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
      {message && saveState === 'error' && <p className="inline-status is-error">{message}</p>}
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
        <ProfileTextField label="한 줄 소개" value={form.bio} onChange={(bio) => update({ bio })} placeholder="나를 한 줄로 소개해 주세요." maxLength={60} error={errors.bio} />
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
          <button className="profile-flow-primary" type="button" disabled={saveState === 'saving' || !hasRequiredProfileFields} onClick={saveProfile}>
            {saveState === 'saving' ? '저장 중' : '저장하기'}
          </button>
        </div>
      </div>

      {uploadState === 'uploading' && <p className="inline-status">이미지를 업로드하는 중입니다.</p>}
      {uploadState === 'error' && <p className="inline-status is-error">이미지 업로드에 실패했습니다.</p>}
      {successToast && (
        <p className="profile-save-toast" role="status" aria-live="polite">
          {successToast}
        </p>
      )}
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
            <TaskThumb mode="nearby" small />
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
          {reviews.map((review) => {
            const reviewerName = getString(review, 'reviewerNickname') || '사용자'
            return (
              <article key={getString(review, 'id')}>
                <InitialAvatar
                  name={reviewerName}
                  size="md"
                  imageUrl={normalizeDisplayImageUrl(getString(review, 'reviewerAvatarUrl')) || undefined}
                  defaultAvatarKey={getString(review, 'reviewerDefaultAvatarKey') || undefined}
                />
                <div>
                  <header>
                    <strong>{reviewerName}</strong>
                    <span>{formatFullDate(review.createdAt)}</span>
                    <RatingStars rating={getNumber(review, 'rating')} />
                  </header>
                  <h2>{getString(review, 'postTitle') || '거래 후기'}</h2>
                  <p>{getString(review, 'content') || '후기 내용이 없습니다.'}</p>
                </div>
              </article>
            )
          })}
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
        <SettingsRow icon={<MapPin />} title="위치기반서비스 약관" subtitle="위치정보 처리 기준을 확인하세요." href="/terms/location?returnTo=/my" />
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
  const [showPhoneVerification, setShowPhoneVerification] = useState(false)
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
    await submitInquiryFromState()
  }

  async function submitInquiryFromState() {
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
      if (isPhoneVerificationRequired(error)) {
        setSubmitState('idle')
        setShowPhoneVerification(true)
        return
      }
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
      {showPhoneVerification && (
        <PhoneVerificationOverlay
          onClose={() => setShowPhoneVerification(false)}
          onVerified={() => void submitInquiryFromState()}
        />
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
          recentReviews.slice(0, 3).map((review) => {
            const reviewerName = getString(review, 'reviewerNickname') || '사용자'
            return (
              <article key={getString(review, 'id')}>
                <InitialAvatar
                  name={reviewerName}
                  size="sm"
                  imageUrl={normalizeDisplayImageUrl(getString(review, 'reviewerAvatarUrl')) || undefined}
                  defaultAvatarKey={getString(review, 'reviewerDefaultAvatarKey') || undefined}
                />
                <div className="review-card-content">
                  <div className="review-card-author">
                    <strong>{reviewerName}</strong>
                    <time>{formatDate(review.createdAt)}</time>
                  </div>
                  <RatingStars rating={getNumber(review, 'rating')} />
                  <p>{getString(review, 'content') || '후기 내용이 없습니다.'}</p>
                </div>
              </article>
            )
          })
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

function InitialAvatar({
  name,
  size,
  imageUrl,
  defaultAvatarKey,
}: {
  name: string
  size: 'sm' | 'md' | 'lg'
  imageUrl?: string
  defaultAvatarKey?: string
}) {
  if (imageUrl) {
    return (
      <span className={`initial-avatar initial-avatar-${size} is-photo`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Runtime profile URLs may be external; CSS controls the avatar crop. */}
        <img src={imageUrl} alt="" aria-hidden="true" />
      </span>
    )
  }

  const avatarIndex = Number(String(defaultAvatarKey ?? '').replace(/[^0-9]/g, '')) || 1
  return (
    <span className={`initial-avatar initial-avatar-${size} ${defaultAvatarKey ? `is-default default-${avatarIndex}` : ''}`}>
      {name.trim().slice(0, 1) || '만'}
    </span>
  )
}

function TaskThumb({ mode, small = false }: { mode: string; small?: boolean }) {
  const Icon = mode === 'online' ? Monitor : HeartHandshake
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
  const reported = Boolean(deal.reportedAt || deal.chatBlockedAt || getString(deal, 'reportReason'))
  const appointmentScheduledAt = getString(deal, 'appointmentScheduledAt')
  const activityRole = getString(deal, 'activityRole')
  const counterpartName = getString(deal, 'counterpartNickname')
    || (activityRole === 'requester' ? getString(deal, 'helperNickname') : getString(deal, 'requesterNickname'))
    || (activityRole === 'requester' ? '수행자' : '요청자')
  return {
    id: getString(deal, 'id'),
    postId: getString(deal, 'postId'),
    conversationId: getString(deal, 'conversationId') || null,
    title: getString(deal, 'postTitle') || '거래한 부탁',
    price: getNumber(deal, 'price'),
    mode: getString(deal, 'postMode') || 'nearby',
    location: formatLocation(deal, 'post'),
    deadline: formatDeadline(deal.postDeadlineAt, deal.postDeadlineText, deal.postAvailableTimeText),
    statusLabel: reported && status === 'completed' ? '완료 · 신고' : mapDealStatus(status, appointmentScheduledAt),
    filterStatus: toDealFilterStatus(status),
    note: reported
      ? `${counterpartName}님과의 거래 · ${getString(deal, 'reportReason') || '신고 접수'}`
      : `${counterpartName}님과의 거래`,
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

function normalizeProfileDefaultNickname(value?: string) {
  const nickname = value?.trim().replace(/\s+/g, '').slice(0, 12) ?? ''
  return nickname.length >= 2 ? nickname : ''
}

function createEmptyActivityProfileForm(gender?: ActivityProfile['gender'], defaults?: ActivityProfileDefaults): ActivityProfileFormState {
  return {
    avatarUrl: defaults?.avatarUrl ?? null,
    defaultAvatarKey: defaultProfileAvatars[0],
    gender: gender ?? null,
    nickname: normalizeProfileDefaultNickname(defaults?.nickname),
    nicknameEdited: false,
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
    nicknameEdited: true,
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

function hasRequiredActivityProfileFields(form: ActivityProfileFormState) {
  const nickname = form.nickname.trim().replace(/\s+/g, '')
  return nickname.length >= 2 && Boolean(form.bio.trim()) && Boolean(form.activityMode)
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
  const avatarUrl = normalizeDisplayImageUrl(profile.avatarUrl)
  if (avatarUrl) {
    return (
      <span className="activity-profile-image is-photo">
        {/* eslint-disable-next-line @next/next/no-img-element -- User-uploaded avatar URLs can be runtime external URLs; CSS controls the crop. */}
        <img src={avatarUrl} alt="" aria-hidden="true" />
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
  if (status === 'closed') return '마감'
  if (status === 'cancelled' || status === 'hidden') return '취소'
  if (status === 'pending' || status === 'in_progress') return '진행중'
  return '모집중'
}

function mapDealStatus(status: string, appointmentScheduledAt = '') {
  if (status === 'completed') return '완료'
  if (status === 'cancelled' || status === 'disputed') return '취소'
  if (appointmentScheduledAt) return '약속'
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
