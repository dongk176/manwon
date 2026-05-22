'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  Ban,
  BarChart3,
  Bell,
  CalendarDays,
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
  Info,
  ListChecks,
  LogIn,
  LogOut,
  MapPin,
  Monitor,
  Package,
  Shield,
  Settings,
  ShieldCheck,
  Smartphone,
  Star,
  TriangleAlert,
  UserMinus,
  UserRound,
  WalletCards,
} from 'lucide-react'
import { AppHeader, BrandButton, RatingStars } from '@/components/ui/Common'
import {
  confirmPhoneVerification,
  createSupportInquiry,
  deleteBlock,
  fetchMyActivity,
  fetchMyPage,
  fetchSettlementSummary,
  logout,
  requestPhoneVerification,
  withdrawAccount,
  type ApiTaskPost,
  type SettlementSummary,
} from '@/lib/manwonApi'

export type MySection =
  | 'main'
  | 'manage'
  | 'requests'
  | 'helped'
  | 'favorites'
  | 'settlement'
  | 'reviews'
  | 'verify'
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

  async function handleWithdraw() {
    if (typeof window !== 'undefined' && !window.confirm('회원 탈퇴 시 계정이 비활성화되고 개인정보가 마스킹됩니다. 탈퇴하시겠어요?')) return
    setWithdrawBusy(true)
    try {
      await withdrawAccount()
      setMyPage(null)
      setActivity(emptyActivity)
      router.push('/login')
    } finally {
      setWithdrawBusy(false)
    }
  }

  if (section === 'requests') {
    return <MyRequestsScreen posts={activity.myPosts} loading={loadState === 'loading'} onBack={() => router.push('/my')} />
  }

  if (section === 'helped') {
    return <MyHelpedScreen deals={activity.helpedDeals} loading={loadState === 'loading'} onBack={() => router.push('/my')} />
  }

  if (section === 'favorites') {
    return <MyFavoritesScreen favorites={activity.favorites} loading={loadState === 'loading'} onBack={() => router.push('/my')} />
  }

  if (section === 'settlement') {
    return (
      <SettlementScreen
        initialSummary={settlementSummary}
        onBack={() => router.push('/my')}
        onSummaryChange={setSettlementSummary}
      />
    )
  }

  if (section === 'reviews') {
    return <ReviewsScreen reviews={activity.receivedReviews} loading={loadState === 'loading'} onBack={() => router.push('/my')} />
  }

  if (section === 'account') {
    return (
      <AccountScreen
        onBack={() => router.push('/my')}
        onLogout={() => void handleLogout()}
        onWithdraw={() => void handleWithdraw()}
        authBusy={authBusy}
        withdrawBusy={withdrawBusy}
      />
    )
  }

  if (section === 'support') {
    return <SupportScreen onBack={() => router.push('/my/account')} />
  }

  if (section === 'manage') {
    return (
      <ManageScreen
        onBack={() => router.push('/my')}
        onOpenVerification={() => router.push('/my/verify')}
        onOpenBlocks={() => router.push('/my/blocks')}
        onOpenReports={() => router.push('/my/reports')}
        settlementSummary={settlementSummary}
        activity={activity}
      />
    )
  }

  if (section === 'verify') {
    return (
      <PhoneVerificationScreen
        profile={myPage}
        onBack={() => router.push('/my')}
        onVerified={(profile) => setMyPage(profile)}
      />
    )
  }

  if (section === 'blocks' || section === 'reports') {
    return (
      <BlocksReportsScreen
        initialTab={section === 'reports' ? 'reports' : 'blocks'}
        blocks={activity.blocks}
        reports={activity.reports}
        onBack={() => router.push('/my')}
        onWithdraw={() => void handleWithdraw()}
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

  const nickname = getString(myPage ?? {}, 'nickname') || '만원부탁소'
  const ratingAvg = getNumber(myPage ?? {}, 'ratingAvg')
  const completedCount = getNumber(myPage ?? {}, 'completedCount')
  const activePostsCount = getNumber(myPage ?? {}, 'activePostsCount', activity.myPosts.filter((post) => toPostFilterStatus(getString(post, 'status')) === '진행중').length)
  const activeHelpingCount = getNumber(myPage ?? {}, 'activeHelpingCount', activity.helpedDeals.filter((deal) => toDealFilterStatus(getString(deal, 'status')) === '진행중').length)
  const favoriteCount = getNumber(myPage ?? {}, 'favoriteCount', activity.favorites.length)
  const receivedReviewCount = getNumber(myPage ?? {}, 'receivedReviewCount', activity.receivedReviews.length)
  const phoneVerified = myPage?.phoneVerified === true

  return (
    <section className="screen my-screen">
      <AppHeader title="마이" showSettings onSettings={() => router.push('/my/account')} />
      {loadState === 'loading' && <p className="inline-status">마이페이지 정보를 불러오는 중입니다.</p>}
      {loadState === 'error' && <p className="inline-status is-error">마이페이지 정보를 불러오지 못했습니다.</p>}
      <div className="profile-card">
        <InitialAvatar name={nickname} size="lg" />
        <div className="profile-main">
          <h2>
            {nickname}
            <ChevronRight size={20} />
          </h2>
          <p>만원부탁소에서 안전하게 부탁을 주고받아보세요.</p>
        </div>
        <div className="profile-stats">
          <span>
            <ShieldCheck size={18} />
            {phoneVerified ? '인증 완료' : '휴대폰 인증 필요'}
          </span>
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
        <MenuItem icon={<WalletCards />} title="내 부탁" badge={activePostsCount > 0 ? `${activePostsCount}개 진행중` : '없음'} onClick={() => router.push('/my/requests')} />
        <MenuItem icon={<HeartHandshake />} title="내가 해준 일" badge={activeHelpingCount > 0 ? `${activeHelpingCount}개 진행중` : '없음'} onClick={() => router.push('/my/helped')} />
        <MenuItem icon={<Heart />} title="찜한 부탁" badge={`${favoriteCount}개`} onClick={() => router.push('/my/favorites')} muted />
      </MenuGroup>

      <MenuGroup>
        <MenuItem icon={<BarChart3 />} title="받은 후기" badge={`${receivedReviewCount}개`} onClick={() => router.push('/my/reviews')} muted />
      </MenuGroup>

      <MenuGroup>
        {!phoneVerified && <MenuItem icon={<LogIn />} title="로그인 / 회원가입" badge="권장" onClick={() => router.push('/login?next=/my')} />}
        <MenuItem icon={<ShieldCheck />} title="인증 관리" badge={phoneVerified ? '완료' : '필요'} onClick={() => router.push('/my/verify')} />
        <MenuItem icon={<Ban />} title="차단/신고 관리" onClick={() => router.push('/my/blocks')} muted />
        {phoneVerified && <MenuItem icon={<LogOut />} title={authBusy ? '로그아웃 중' : '로그아웃'} onClick={() => void handleLogout()} muted />}
      </MenuGroup>

      <button className="customer-center" type="button" onClick={() => router.push('/my/support')}>
        <Headphones size={18} />
        고객센터
      </button>
    </section>
  )
}

function MyRequestsScreen({ posts, loading, onBack }: { posts: ActivityPost[]; loading: boolean; onBack: () => void }) {
  const [active, setActive] = useState('전체')
  const items = useMemo(() => posts.map(postToTaskItem), [posts])
  const filteredItems = filterTaskItems(items, active)

  return (
    <section className="screen my-sub-screen my-task-screen">
      <AppHeader title="내 부탁" centered onBack={onBack} />
      <SegmentTabs tabs={['전체', '진행중', '완료', '취소']} active={active} onChange={setActive} />
      <TaskList items={filteredItems} loading={loading} emptyTitle="아직 등록한 부탁이 없어요" emptyText="부탁을 등록하면 이곳에서 상태를 확인할 수 있습니다." />
    </section>
  )
}

function MyHelpedScreen({ deals, loading, onBack }: { deals: ActivityRecord[]; loading: boolean; onBack: () => void }) {
  const [active, setActive] = useState('전체')
  const items = useMemo(() => deals.map(dealToTaskItem), [deals])
  const filteredItems = filterTaskItems(items, active)

  return (
    <section className="screen my-sub-screen my-helped-screen">
      <AppHeader title="내가 해준 일" centered onBack={onBack} />
      <SegmentTabs tabs={['전체', '진행중', '완료', '취소']} active={active} onChange={setActive} />
      <TaskList items={filteredItems} loading={loading} emptyTitle="아직 해준 일이 없어요" emptyText="거래를 수락하면 이곳에서 진행 상황을 볼 수 있습니다." />
    </section>
  )
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

function TaskList({ items, loading, emptyTitle, emptyText }: { items: TaskItem[]; loading: boolean; emptyTitle: string; emptyText: string }) {
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
      {items.map((item) => <TaskCard key={item.id} item={item} />)}
    </div>
  )
}

function TaskCard({ item }: { item: TaskItem }) {
  return (
    <article className="my-activity-card">
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
    </article>
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
  const [active, setActive] = useState('전체')
  const ratingAverage = reviews.length ? reviews.reduce((sum, review) => sum + getNumber(review, 'rating'), 0) / reviews.length : 0
  const distribution = [5, 4, 3, 2, 1].map((rating) => {
    if (reviews.length === 0) return 0
    return Math.round((reviews.filter((review) => getNumber(review, 'rating') === rating).length / reviews.length) * 100)
  })

  return (
    <section className="screen my-sub-screen reviews-page">
      <AppHeader title="받은 후기" onBack={onBack} />
      <UnderlineTabs tabs={['전체', '도움이 된 후기', '거래 후기']} active={active} onChange={setActive} />
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
      {reviews.length > 0 && <button className="more-review-button" type="button">후기 더 보기 <ChevronRight size={16} /></button>}
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
        <SettingsRow icon={<FileText />} title="서비스 이용약관" subtitle="만원부탁소 서비스 이용약관을 확인하세요." href="/terms/service" />
        <SettingsRow icon={<Shield />} title="개인정보 처리방침" subtitle="개인정보 처리방침을 확인하세요." href="/terms/privacy" />
        <SettingsRow icon={<Headphones />} title="문의하기" subtitle="자주 묻는 질문과 1:1 문의를 이용하세요." href="/my/support" />
      </div>
      <div className="settings-card danger">
        <SettingsRow icon={<UserMinus />} title={withdrawBusy ? '탈퇴 처리 중' : '회원 탈퇴'} subtitle="회원 탈퇴 시 계정이 비활성화됩니다." danger onClick={onWithdraw} />
        <SettingsRow icon={<LogOut />} title={authBusy ? '로그아웃 중' : '로그아웃'} subtitle="현재 계정에서 로그아웃합니다." danger onClick={onLogout} />
      </div>
    </section>
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
            <p>만원부탁소는 동네 기반의 작은 부탁 거래를 전제로 합니다. 금전 선입금 유도, 개인정보 요구, 욕설, 노쇼, 위험한 업무 요청은 신고 대상입니다.</p>
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
  onOpenVerification,
  onOpenBlocks,
  onOpenReports,
  settlementSummary,
  activity,
}: {
  onBack: () => void
  onOpenVerification: () => void
  onOpenBlocks: () => void
  onOpenReports: () => void
  settlementSummary: SettlementSummary | null
  activity: MyActivity
}) {
  const recentReviews = activity.receivedReviews
  const myPosts = activity.myPosts.map(postToTaskItem).slice(0, 3)

  return (
    <section className="screen manage-screen">
      <AppHeader title="정산/후기/인증 관리" subtitle="정산, 후기, 인증 정보를 관리해보세요" onBack={onBack} showBell showSearch />
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
        <ManageRow icon={<ShieldCheck />} title="인증 관리" subtitle="휴대폰 인증 상태를 관리하세요" onClick={onOpenVerification} />
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

function PhoneVerificationScreen({
  profile,
  onBack,
  onVerified,
}: {
  profile: ActivityRecord | null
  onBack: () => void
  onVerified: (profile: ActivityRecord) => void
}) {
  const [phone, setPhone] = useState(() => getString(profile ?? {}, 'phone'))
  const [code, setCode] = useState('')
  const [requestedPhone, setRequestedPhone] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'verified' | 'error'>(
    profile?.phoneVerified === true ? 'verified' : 'idle',
  )
  const [message, setMessage] = useState('')
  const phoneVerified = profile?.phoneVerified === true || status === 'verified'

  async function requestCode() {
    setStatus('sending')
    setMessage('')
    try {
      const result = await requestPhoneVerification(phone)
      setRequestedPhone(result.phone)
      setStatus('sent')
      setMessage(`인증번호를 보냈습니다. ${Math.ceil(result.ttlSeconds / 60)}분 안에 입력해주세요.`)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '인증번호를 보내지 못했습니다.')
    }
  }

  async function verifyCode() {
    setStatus('verifying')
    setMessage('')
    try {
      const profile = await confirmPhoneVerification(requestedPhone || phone, code)
      onVerified(profile)
      setStatus('verified')
      setMessage('휴대폰 인증이 완료되었습니다.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '인증번호를 확인하지 못했습니다.')
    }
  }

  return (
    <section className="screen my-sub-screen verification-page">
      <AppHeader title="인증관리" centered onBack={onBack} />
      <div className="verify-hero">
        <h1>안전한 거래를 위해<br />휴대폰 인증을 완료해주세요.</h1>
        <p>인증 정보는 안전하게 관리되며, 거래 안전 확인에만 사용됩니다.</p>
      </div>
      <div className="verification-card">
        <div className="verification-status">
          <span>
            <Smartphone size={28} />
          </span>
          <div>
            <strong>휴대폰 인증</strong>
            <p>본인 명의 휴대폰 번호 확인</p>
          </div>
          <em className={phoneVerified ? 'is-done' : ''}>{phoneVerified ? '인증 완료' : '인증 필요'}</em>
        </div>

        <label className="verification-field">
          <span>휴대폰 번호</span>
          <input
            value={phone}
            inputMode="numeric"
            placeholder="01012345678"
            disabled={status === 'sending' || status === 'verifying'}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 11))}
          />
        </label>

        <button className="verification-button" type="button" disabled={status === 'sending' || !phone} onClick={() => void requestCode()}>
          {status === 'sending' ? '발송 중' : '인증번호 받기'}
        </button>

        {(status === 'sent' || status === 'verifying' || requestedPhone) && !phoneVerified && (
          <>
            <label className="verification-field">
              <span>인증번호</span>
              <input
                value={code}
                inputMode="numeric"
                placeholder="6자리"
                disabled={status === 'verifying'}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </label>
            <button className="verification-button primary" type="button" disabled={status === 'verifying' || code.length !== 6} onClick={() => void verifyCode()}>
              {status === 'verifying' ? '확인 중' : '인증 완료'}
            </button>
          </>
        )}

        {message && <p className={`inline-status ${status === 'error' ? 'is-error' : ''}`}>{message}</p>}
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

function UnderlineTabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (tab: string) => void }) {
  return (
    <div className="my-underline-tabs">
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

function InitialAvatar({ name, size }: { name: string; size: 'sm' | 'md' | 'lg' }) {
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
