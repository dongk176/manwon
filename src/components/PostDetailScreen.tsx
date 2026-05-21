'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Clock3, Globe2, Heart, MapPin, MoreHorizontal, Navigation, ShieldCheck, UsersRound, X } from 'lucide-react'
import { BrandButton, CategoryImageFrame, MoreMenu, RatingStars, ReportConfirmSheet } from '@/components/ui/Common'
import { categoryDetailOptions, formatPrice, getCategoryLabel, getUser, postCategories, type PostStatus, type RequestMode, type RequestPost } from '@/data/mockData'
import { LocationPermissionSheet, NeighborhoodSelectSheet } from '@/components/location/LocationSheets'
import {
  addFavorite,
  createBlock,
  createReport,
  fetchAuthSession,
  fetchTaskPost,
  getDisplayImageUrl,
  mapApiPostToRequestPost,
  removeFavorite,
  reopenTaskPost,
  startConversationFromPost,
  updateTaskPost,
  type ApiTaskPost,
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

interface PostDetailScreenProps {
  postId: string
  fallbackPost?: RequestPost
}

type PriceOption = '5000' | '10000' | '15000' | '20000' | 'custom'
type DeadlineOption = 'now' | 'today' | 'tomorrow' | 'custom'
type AvailableTimeOption = 'now' | 'today' | 'weekday' | 'weekend' | 'custom'
type GenderVisibility = 'private' | 'male' | 'female'
type DetailEditSheet = 'category' | 'categoryCustom' | 'categoryDetail' | 'categoryDetailCustom' | 'mode' | 'availableTime' | 'availableTimeCustom' | null

interface DetailEditDraft {
  title: string
  categoryId: string
  customCategory: string
  categoryDetail: string
  mode: RequestMode
  addressText: string
  region1Depth: string
  region2Depth: string
  region3Depth: string
  regionCode: string | null
  latitude: number | null
  longitude: number | null
  locationSource: 'gps' | 'manual' | null
  priceOption: PriceOption
  customPrice: string
  deadlineOption: DeadlineOption
  customDeadlineText: string
  availableTimeOption: AvailableTimeOption
  customAvailableTime: string
  genderVisibility: GenderVisibility
  serviceIntro: string
  serviceScope: string[]
  careerSummary: string
  portfolioTitle: string
  portfolioUrl: string
  responseTime: string
  description: string
}

const requestPriceOptions = [
  { value: '5000', label: '5,000원' },
  { value: '10000', label: '10,000원' },
  { value: '15000', label: '15,000원' },
  { value: 'custom', label: '직접 입력' },
] as const

const deadlineOptions = [
  { value: 'now', label: '지금 바로' },
  { value: 'today', label: '오늘 안에' },
  { value: 'tomorrow', label: '내일까지' },
  { value: 'custom', label: '직접 선택' },
] as const

const availableTimeOptions = [
  { value: 'now', label: '지금 가능' },
  { value: 'today', label: '오늘 가능' },
  { value: 'weekday', label: '평일 가능' },
  { value: 'weekend', label: '주말 가능' },
  { value: 'custom', label: '직접 입력' },
] as const

const genderVisibilityOptions = [
  { value: 'private', label: '공개 안 함' },
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
] as const

const responseTimeOptions = ['바로 답장 가능', '1시간 내 답장', '오늘 안에 답장', '일정 확인 후 답장'] as const
const customCategoryMaxLength = 9
const availableTimeMaxLength = 80
const requiredFieldMessage = '필수 항목이에요.'
const offerMinPrice = 1000
const offerMaxPrice = 10000

const modeOptions: Array<{
  value: RequestMode
  label: string
  requestDescription: string
  offerDescription: string
  icon: typeof MapPin
}> = [
  { value: 'nearby', label: '내 주변', requestDescription: '직접 만나서 진행해요', offerDescription: '직접 만나서 도와드려요', icon: MapPin },
  { value: 'online', label: '온라인', requestDescription: '채팅이나 파일로 진행해요', offerDescription: '채팅이나 파일로 도와드려요', icon: Globe2 },
  { value: 'both', label: '둘 다 가능', requestDescription: '상황에 따라 선택할 수 있어요', offerDescription: '상황에 따라 진행 가능해요', icon: UsersRound },
]

export function PostDetailScreen({ postId, fallbackPost }: PostDetailScreenProps) {
  const router = useRouter()
  const [post, setPost] = useState<ApiTaskPost | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'fallback' | 'error'>('loading')
  const [showMore, setShowMore] = useState(false)
  const [floatingActionsVisible, setFloatingActionsVisible] = useState(true)
  const [favorite, setFavorite] = useState(false)
  const [actionState, setActionState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [showReportSheet, setShowReportSheet] = useState(false)
  const [reportSheetError, setReportSheetError] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editDraft, setEditDraft] = useState<DetailEditDraft | null>(null)
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [editSheet, setEditSheet] = useState<DetailEditSheet>(null)
  const [permissionState, setPermissionState] = useState<LocationPermissionState>('unknown')
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [showLocationPrompt, setShowLocationPrompt] = useState(false)
  const [showNeighborhoodSheet, setShowNeighborhoodSheet] = useState(false)
  const [showReopenNotice, setShowReopenNotice] = useState(false)
  const detailScrollYRef = useRef(0)
  const detailScrollFrameRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!isUuid(postId)) {
      queueMicrotask(() => {
        if (cancelled) return
        setPost(null)
        setLoadState(fallbackPost ? 'fallback' : 'error')
      })
      return () => {
        cancelled = true
      }
    }

    fetchTaskPost(postId)
      .then((data) => {
        if (cancelled) return
        setPost(data)
        setLoadState('ready')
      })
      .catch(() => {
        if (cancelled) return
        setLoadState(fallbackPost ? 'fallback' : 'error')
      })

    return () => {
      cancelled = true
    }
  }, [fallbackPost, postId])

  useEffect(() => {
    let cancelled = false

    fetchAuthSession()
      .then((session) => {
        if (!cancelled) setCurrentUserId(session.authenticated ? session.userId ?? null : null)
      })
      .catch(() => {
        if (!cancelled) setCurrentUserId(null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    getLocationPermissionState().then(setPermissionState).catch(() => setPermissionState('unknown'))
  }, [])

  const displayPost = useMemo(() => (post ? mapApiPostToRequestPost(post) : fallbackPost), [fallbackPost, post])
  const requester = getUser(displayPost?.requesterId ?? 'minji')
  const creatorName = post?.creatorNickname ?? displayPost?.requesterName ?? requester.name
  const creatorRating = Number(post?.creatorRatingAvg ?? displayPost?.requesterRating ?? requester.rating)
  const creatorCompleted = Number(post?.creatorCompletedCount ?? displayPost?.requesterCompletedCount ?? requester.completedCount)
  const detailImageUrls = getDetailImageUrls(post, displayPost)
  const canUsePost = Boolean(displayPost)
  const isOwner = Boolean(post && currentUserId && post.creatorId === currentUserId)
  const postStatus = getRawPostStatus(post, displayPost)
  const showOwnerReopenActions = Boolean(isOwner && postStatus === 'cancelled' && !editMode)
  const primaryActionDisabled = !canUsePost || actionState === 'saving' || (!isOwner && postStatus !== 'open')
  const primaryActionLabel = getPrimaryActionLabel({
    saving: actionState === 'saving',
    isOwner,
    editMode,
    postType: displayPost?.postType,
    postStatus,
  })
  const ctaClassName = [
    'fixed-bottom-button detail-cta-bar',
    editMode || (isOwner && !showOwnerReopenActions) ? 'is-single' : '',
    showOwnerReopenActions ? 'is-owner-actions' : '',
  ].filter(Boolean).join(' ')
  const floatingActionsClassName = [
    'post-detail-floating-actions',
    floatingActionsVisible ? '' : 'is-hidden-by-scroll',
  ].filter(Boolean).join(' ')

  useEffect(() => {
    if (!displayPost) return

    const appContent = document.querySelector<HTMLElement>('.app-content')
    const getScrollTop = () => Math.max(
      window.scrollY,
      document.documentElement.scrollTop,
      document.body.scrollTop,
      appContent?.scrollTop ?? 0,
    )

    detailScrollYRef.current = getScrollTop()

    const handleScroll = () => {
      if (detailScrollFrameRef.current !== null) return
      detailScrollFrameRef.current = window.requestAnimationFrame(() => {
        const currentY = getScrollTop()
        const deltaY = currentY - detailScrollYRef.current

        if (currentY < 24) {
          setFloatingActionsVisible(true)
        } else if (deltaY > 6) {
          setFloatingActionsVisible(false)
        } else if (deltaY < -6) {
          setFloatingActionsVisible(true)
        }

        detailScrollYRef.current = currentY
        detailScrollFrameRef.current = null
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    appContent?.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      appContent?.removeEventListener('scroll', handleScroll)
      if (detailScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(detailScrollFrameRef.current)
        detailScrollFrameRef.current = null
      }
    }
  }, [displayPost])

  useEffect(() => {
    if (!post || !currentUserId || !isOwner) return
    if (post.status !== 'cancelled' || post.latestDealStatus !== 'cancelled') return
    if (!post.latestDealId || !post.latestDealCancelledBy || post.latestDealCancelledBy === currentUserId) return

    let cancelled = false
    const storageKey = getReopenNoticeStorageKey(post.id, post.latestDealId)
    try {
      if (window.localStorage.getItem(storageKey)) return
      window.localStorage.setItem(storageKey, 'shown')
    } catch {
      // The notice is still useful if localStorage is unavailable.
    }
    queueMicrotask(() => {
      if (!cancelled) setShowReopenNotice(true)
    })
    return () => {
      cancelled = true
    }
  }, [currentUserId, isOwner, post])

  async function handleStartChat() {
    if (!displayPost) return
    setActionState('saving')
    setMessage('')
    try {
      const conversation = await startConversationFromPost(displayPost.id, '안녕하세요. 이 부탁 도와드릴 수 있어요.')
      setActionState('done')
      setMessage('채팅방으로 이동합니다.')
      router.push(`/chat/${encodeURIComponent(conversation.id)}`)
    } catch (error) {
      setActionState('error')
      setMessage(error instanceof Error ? error.message : '채팅을 시작하지 못했습니다.')
    }
  }

  async function handleFavorite() {
    if (!displayPost) return
    setActionState('saving')
    setMessage('')
    try {
      if (favorite) {
        await removeFavorite(displayPost.id)
        setFavorite(false)
      } else {
        await addFavorite(displayPost.id)
        setFavorite(true)
      }
      setActionState('done')
    } catch (error) {
      setActionState('error')
      setMessage(error instanceof Error ? error.message : '찜 상태를 바꾸지 못했습니다.')
    }
  }

  async function handleReopenPost() {
    if (!post) return
    setActionState('saving')
    setMessage('')
    try {
      const updated = await reopenTaskPost(post.id)
      setPost((current) => mergeUpdatedPost(current, updated))
      setShowReopenNotice(false)
      setActionState('done')
      setMessage('다시 모집을 시작했어요.')
    } catch (error) {
      setActionState('error')
      setMessage(error instanceof Error ? error.message : '다시 모집을 시작하지 못했습니다.')
    }
  }

  async function handleReport(input: { reason: string; description: string }) {
    if (!displayPost) return
    setActionState('saving')
    setReportSheetError('')
    try {
      const details = [
        input.description.trim(),
        `상세 화면에서 신고됨: [${displayPost.category}] ${displayPost.title}`,
      ].filter(Boolean).join('\n\n')
      await createReport({
        targetUserId: post?.creatorId,
        postId: isUuid(displayPost.id) ? displayPost.id : undefined,
        reason: input.reason,
        description: details,
      })
      setShowMore(false)
      setShowReportSheet(false)
      setActionState('done')
      setMessage('신고가 접수되었습니다.')
    } catch (error) {
      setActionState('error')
      setReportSheetError(error instanceof Error ? error.message : '신고에 실패했습니다.')
    }
  }

  async function handleBlock() {
    if (!post?.creatorId) return
    setActionState('saving')
    try {
      await createBlock(post.creatorId)
      setShowMore(false)
      setActionState('done')
      setMessage('사용자를 차단했습니다. 홈 목록에서 더 이상 보이지 않습니다.')
    } catch (error) {
      setActionState('error')
      setMessage(error instanceof Error ? error.message : '차단에 실패했습니다.')
    }
  }

  function applyEditRegion(region: LocationRegion) {
    setEditDraft((current) => {
      if (!current) return current
      return {
        ...current,
        addressText: region.addressText,
        region1Depth: region.region1Depth,
        region2Depth: region.region2Depth,
        region3Depth: region.region3Depth,
        regionCode: region.regionCode,
        latitude: region.latitude,
        longitude: region.longitude,
        locationSource: region.locationSource,
      }
    })
    storeLocationRegion(toNeighborhoodRegion(region))
    setLocationError('')
  }

  async function requestCurrentLocationForEdit() {
    setLocationBusy(true)
    setLocationError('')
    try {
      const current = await requestBrowserLocation()
      const isAddressSearch = post?.postType === 'request'
      const region = await reverseGeocode(current.latitude, current.longitude, 'gps', isAddressSearch ? 'address' : 'region')
      if (isAddressSearch) {
        setPermissionState('granted')
        setLocationError('')
        return region
      }
      applyEditRegion(region)
      setPermissionState('granted')
      setShowLocationPrompt(false)
      setShowNeighborhoodSheet(false)
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

  function handleBack() {
    if (editMode) {
      setFloatingActionsVisible(true)
      setEditMode(false)
      setEditDraft(null)
      setEditErrors({})
      setEditSheet(null)
      setMessage('')
      return
    }
    router.back()
  }

  function startEditMode() {
    if (!post || !displayPost) return
    setEditDraft(createEditDraft(post, displayPost))
    setEditErrors({})
    setMessage('')
    setFloatingActionsVisible(true)
    setEditMode(true)
  }

  async function saveEditMode() {
    if (!post || !editDraft) return
    const nextErrors = validateEditDraft(editDraft, post.postType)
    setEditErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setActionState('saving')
    setMessage('')
    try {
      const price = getPriceValue(editDraft.priceOption, editDraft.customPrice)
      const isRequest = post.postType === 'request'
      const nextMode = editDraft.mode
      const isOffline = nextMode === 'nearby' || nextMode === 'both'
      const portfolioLinks = getPortfolioLinks(editDraft.portfolioTitle, editDraft.portfolioUrl)
      const updated = await updateTaskPost(post.id, {
        title: editDraft.title.trim(),
        category: getSelectedCategoryLabel(editDraft.categoryId, editDraft.customCategory) || getCategoryLabel(editDraft.categoryId),
        categoryDetail: nullableText(editDraft.categoryDetail),
        description: editDraft.description.trim(),
        mode: nextMode,
        price,
        deadlineAt: isRequest ? getDeadlineIso(editDraft.deadlineOption) : null,
        deadlineText: isRequest ? getRequestDeadlineText(editDraft.deadlineOption, editDraft.customDeadlineText) : null,
        availableTimeText: isRequest ? null : getAvailableTimeText(editDraft.availableTimeOption, editDraft.customAvailableTime),
        genderVisibility: isRequest ? post.genderVisibility : editDraft.genderVisibility,
        serviceIntro: isRequest ? null : nullableText(editDraft.serviceIntro),
        serviceScope: [],
        experienceSummary: isRequest ? null : nullableText(editDraft.careerSummary),
        careerSummary: isRequest ? null : nullableText(editDraft.careerSummary),
        portfolioUrl: isRequest ? null : portfolioLinks[0]?.url ?? null,
        portfolioLinks: isRequest ? [] : portfolioLinks,
        responseTimeText: isRequest ? null : nullableText(editDraft.responseTime),
        responseTime: isRequest ? null : nullableText(editDraft.responseTime),
        addressText: isOffline ? nullableText(editDraft.addressText) : null,
        region1Depth: isOffline ? nullableText(editDraft.region1Depth) : null,
        region2Depth: isOffline ? nullableText(editDraft.region2Depth) : null,
        region3Depth: isOffline ? nullableText(editDraft.region3Depth) : null,
        regionCode: isOffline ? editDraft.regionCode : null,
        locationSource: isOffline ? editDraft.locationSource : null,
        latitude: isOffline ? editDraft.latitude : null,
        longitude: isOffline ? editDraft.longitude : null,
      })
      setPost((current) => mergeUpdatedPost(current, updated))
      setEditMode(false)
      setEditDraft(null)
      setEditSheet(null)
      setActionState('done')
      setMessage('수정 내용이 저장되었습니다.')
    } catch (error) {
      setActionState('error')
      setMessage(error instanceof Error ? error.message : '게시글을 수정하지 못했습니다.')
    }
  }

  function handlePrimaryAction() {
    if (isOwner) {
      if (editMode) void saveEditMode()
      else if (postStatus === 'cancelled') void handleReopenPost()
      else startEditMode()
      return
    }
    if (postStatus !== 'open') return
    void handleStartChat()
  }

  return (
    <section className="screen post-detail-screen">
      {loadState === 'loading' && <p className="inline-status">게시글을 불러오는 중입니다.</p>}
      {loadState === 'error' && <p className="inline-status is-error">게시글을 불러오지 못했습니다.</p>}
      {loadState === 'fallback' && <p className="inline-status">개발용 데이터를 기준으로 상세를 표시합니다.</p>}

      {displayPost && (
        <>
          <div className="post-detail-visual">
            <div className={floatingActionsClassName}>
              <button type="button" className="post-detail-floating-icon" onClick={handleBack} aria-label="뒤로가기">
                <ChevronLeft size={24} />
              </button>
              {!editMode && !isOwner && (
                <div className="post-detail-floating-more">
                  <button
                    type="button"
                    className="post-detail-floating-icon"
                    onClick={() => setShowMore((value) => !value)}
                    aria-label="더보기"
                    aria-expanded={showMore}
                  >
                    <MoreHorizontal size={24} />
                  </button>
                  {showMore && (
                    <MoreMenu
                      onReport={() => {
                        setShowMore(false)
                        setReportSheetError('')
                        setShowReportSheet(true)
                      }}
                      onBlock={handleBlock}
                    />
                  )}
                </div>
              )}
            </div>
            <PostDetailImageCarousel
              key={`${displayPost.id}-${detailImageUrls.join('|')}`}
              categoryId={displayPost.categoryId}
              imageUrls={detailImageUrls}
              title={displayPost.title}
            />
          </div>

          {editMode && editDraft && post ? (
            <PostDetailEditForm
              draft={editDraft}
              postType={post.postType}
              errors={editErrors}
              sheet={editSheet}
              permissionState={permissionState}
              locationBusy={locationBusy}
              locationError={locationError}
              onChange={setEditDraft}
              onSheetChange={setEditSheet}
              onOpenLocationPrompt={() => setShowLocationPrompt(true)}
              onOpenNeighborhoodSheet={() => setShowNeighborhoodSheet(true)}
            />
          ) : (
            <>
              <article className="post-detail-main-card">
                <div className="post-detail-title-row">
                  <span className="preview-category">{displayPost.categoryDetail ?? displayPost.category}</span>
                </div>
                <h2>{displayPost.title}</h2>
                <strong className="detail-price">{formatPrice(displayPost.price)}</strong>
              </article>

              <section className="post-detail-info-grid" aria-label="게시글 정보">
                {getDetailInfoRows(post, displayPost).map((row) => (
                  <Info key={row.label} icon={row.icon} label={row.label} value={row.value} />
                ))}
              </section>

              {post && <ExtraPostSections post={post} />}

              <section className="detail-section-card">
                <h3>상세 설명</h3>
                <p>{displayPost.description || '상세 설명이 아직 없습니다.'}</p>
              </section>

              <section className="detail-section-card requester-card">
                <h3>작성자 정보</h3>
                <div>
                  <span className="avatar avatar-md avatar-green">
                    <span>{creatorName.slice(0, 1)}</span>
                  </span>
                  <span>
                    <strong>{creatorName}</strong>
                    <em>
                      <RatingStars rating={creatorRating || 0} />
                    </em>
                    <small>거래 완료 {creatorCompleted}회</small>
                  </span>
                  <ShieldCheck size={20} />
                </div>
              </section>

              {!isOwner && (
                <p className="detail-platform-note">만원부탁소는 거래를 연결하는 플랫폼입니다. 실제 거래의 내용과 이행 책임은 이용자 당사자에게 있습니다.</p>
              )}
            </>
          )}

          {message && <p className={`inline-status ${actionState === 'error' ? 'is-error' : ''}`}>{message}</p>}

          <div className={ctaClassName}>
            {!editMode && !isOwner && (
              <button type="button" className={`favorite-button detail-save-button ${favorite ? 'is-active' : ''}`} onClick={handleFavorite} aria-label="저장">
                <Heart size={20} fill={favorite ? 'currentColor' : 'none'} />
              </button>
            )}
            {showOwnerReopenActions && (
              <BrandButton variant="outline" size="lg" onClick={startEditMode} disabled={actionState === 'saving'}>
                수정하기
              </BrandButton>
            )}
            <BrandButton full={!showOwnerReopenActions} size="lg" onClick={handlePrimaryAction} disabled={primaryActionDisabled}>
              {primaryActionLabel}
            </BrandButton>
          </div>
          {showReopenNotice && (
            <ReopenNoticeDialog
              busy={actionState === 'saving'}
              onClose={() => setShowReopenNotice(false)}
              onReopen={() => void handleReopenPost()}
            />
          )}
          {showReportSheet && (
            <ReportConfirmSheet
              targetLabel={displayPost.title}
              busy={actionState === 'saving'}
              error={reportSheetError}
              onClose={() => {
                if (actionState === 'saving') return
                setShowReportSheet(false)
                setReportSheetError('')
              }}
              onSubmit={(input) => void handleReport(input)}
            />
          )}
          {showLocationPrompt && (
            <LocationPermissionSheet
              context={post?.postType === 'offer' ? 'offer' : 'request'}
              permissionState={permissionState}
              busy={locationBusy}
              error={locationError}
              onAllow={() => void requestCurrentLocationForEdit()}
              onManual={() => {
                setShowLocationPrompt(false)
                setShowNeighborhoodSheet(true)
              }}
              onClose={() => setShowLocationPrompt(false)}
            />
          )}
          {showNeighborhoodSheet && (
            <NeighborhoodSelectSheet
              searchMode={post?.postType === 'request' ? 'address' : 'region'}
              permissionState={permissionState}
              busy={locationBusy}
              error={locationError}
              onUseCurrent={requestCurrentLocationForEdit}
              onSelect={(region) => {
                applyEditRegion(region)
                setShowNeighborhoodSheet(false)
              }}
              onClose={() => setShowNeighborhoodSheet(false)}
            />
          )}
        </>
      )}
    </section>
  )
}

function ReopenNoticeDialog({
  busy,
  onClose,
  onReopen,
}: {
  busy: boolean
  onClose: () => void
  onReopen: () => void
}) {
  return (
    <div className="modal-overlay" role="presentation">
      <div className="confirm-dialog reopen-notice-dialog" role="dialog" aria-modal="true" aria-labelledby="reopen-notice-title">
        <h2 id="reopen-notice-title">거래가 취소됐어요</h2>
        <p>상대방이 거래를 취소했습니다. 같은 내용으로 다시 모집하면 다른 사용자가 새로 지원할 수 있어요.</p>
        <div>
          <button type="button" onClick={onClose} disabled={busy}>
            나중에
          </button>
          <button type="button" onClick={onReopen} disabled={busy}>
            {busy ? '처리 중' : '다시 모집하기'}
          </button>
        </div>
      </div>
    </div>
  )
}

function getRawPostStatus(post: ApiTaskPost | null, displayPost: RequestPost | undefined): PostStatus {
  if (post?.status) return post.status
  if (displayPost?.postStatus) return displayPost.postStatus
  if (displayPost?.status === '거래완료') return 'completed'
  if (displayPost?.status === '취소됨') return 'cancelled'
  if (displayPost?.status === '진행중' || displayPost?.status === '완료요청' || displayPost?.status === '수락대기') return 'in_progress'
  return 'open'
}

function getPrimaryActionLabel({
  saving,
  isOwner,
  editMode,
  postType,
  postStatus,
}: {
  saving: boolean
  isOwner: boolean
  editMode: boolean
  postType?: 'request' | 'offer'
  postStatus: PostStatus
}) {
  if (saving) return '처리 중'
  if (isOwner) {
    if (editMode) return '저장하기'
    if (postStatus === 'cancelled') return '다시 모집하기'
    return '수정하기'
  }
  if (postStatus === 'pending' || postStatus === 'in_progress') return '이미 진행중입니다'
  if (postStatus === 'completed') return '거래 완료됨'
  if (postStatus === 'cancelled' || postStatus === 'hidden') return '취소된 부탁입니다'
  return postType === 'offer' ? '문의하기' : '제가 할게요'
}

function getReopenNoticeStorageKey(postId: string, dealId: string) {
  return `manwon_reopen_notice:${postId}:${dealId}`
}

function getDetailImageUrls(post: ApiTaskPost | null, displayPost: RequestPost | undefined) {
  const apiImageUrls = post?.images
    ?.slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((image) => getDisplayImageUrl(image))
    .filter((url): url is string => Boolean(url))

  if (apiImageUrls?.length) return apiImageUrls
  return displayPost?.imageUrl ? [displayPost.imageUrl] : []
}

function PostDetailImageCarousel({
  categoryId,
  imageUrls,
  title,
}: {
  categoryId: string
  imageUrls: string[]
  title: string
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const hasMultipleImages = imageUrls.length > 1

  function moveImage(direction: -1 | 1) {
    if (!hasMultipleImages) return
    const nextIndex = Math.min(Math.max(activeIndex + direction, 0), imageUrls.length - 1)
    setActiveIndex(nextIndex)
    scrollerRef.current?.scrollTo({
      left: nextIndex * scrollerRef.current.clientWidth,
      behavior: 'smooth',
    })
  }

  function handleScroll() {
    const scroller = scrollerRef.current
    if (!scroller || !hasMultipleImages) return
    const nextIndex = Math.round(scroller.scrollLeft / scroller.clientWidth)
    setActiveIndex(Math.min(Math.max(nextIndex, 0), imageUrls.length - 1))
  }

  if (imageUrls.length === 0) {
    return <CategoryImageFrame categoryId={categoryId} label={title} size="lg" />
  }

  return (
    <div className="post-detail-carousel">
      <div className="post-detail-carousel-track" ref={scrollerRef} onScroll={handleScroll}>
        {imageUrls.map((imageUrl, index) => (
          <div className="post-detail-carousel-slide" key={`${imageUrl}-${index}`}>
            <Image
              className="post-detail-carousel-image"
              src={imageUrl}
              alt=""
              aria-hidden="true"
              fill
              priority={index === 0}
              sizes="(max-width: 430px) 100vw, 430px"
              unoptimized
            />
          </div>
        ))}
      </div>
      {hasMultipleImages && (
        <>
          <button
            className="post-detail-carousel-button is-prev"
            type="button"
            disabled={activeIndex === 0}
            onClick={() => moveImage(-1)}
            aria-label="이전 사진"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            className="post-detail-carousel-button is-next"
            type="button"
            disabled={activeIndex === imageUrls.length - 1}
            onClick={() => moveImage(1)}
            aria-label="다음 사진"
          >
            <ChevronRight size={22} />
          </button>
          <span className="post-detail-carousel-count">
            {activeIndex + 1}/{imageUrls.length}
          </span>
        </>
      )}
    </div>
  )
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="post-detail-info">
      {icon}
      <small>{label}</small>
      <strong className={isFastDeadlineText(value) ? 'hot-deadline-text' : undefined}>{value}</strong>
    </span>
  )
}

function ExtraPostSections({ post }: { post: ApiTaskPost }) {
  const isOffer = post.postType === 'offer'
  const portfolioLinks = normalizePortfolioLinks(post)
  const careerSummary = post.careerSummary || post.experienceSummary || ''
  const responseTime = post.responseTime || post.responseTimeText || ''

  return (
    <>
      {isOffer && post.serviceIntro && (
        <section className="detail-section-card">
          <h3>서비스 소개</h3>
          <p>{post.serviceIntro}</p>
        </section>
      )}
      {isOffer && (careerSummary || portfolioLinks.length > 0 || responseTime || post.genderVisibility !== 'private') && (
        <section className="detail-section-card">
          <h3>신뢰 정보</h3>
          <div className="detail-extra-list">
            {careerSummary && <DetailExtra label="경력" value={careerSummary} />}
            {portfolioLinks.map((link) => (
              <DetailExtra key={`${link.title}-${link.url}`} label={link.title || '포트폴리오'} value={link.url} href={link.url} />
            ))}
            {post.genderVisibility !== 'private' && <DetailExtra label="성별" value={genderVisibilityText(post.genderVisibility)} />}
            {responseTime && <DetailExtra label="응답 가능 시간" value={responseTime} />}
          </div>
        </section>
      )}
    </>
  )
}

function DetailExtra({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <span className="detail-extra-row">
      <small>{label}</small>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">{value}</a>
      ) : (
        <strong>{value}</strong>
      )}
    </span>
  )
}

function PostDetailEditForm({
  draft,
  postType,
  errors,
  sheet,
  permissionState,
  locationBusy,
  locationError,
  onChange,
  onSheetChange,
  onOpenLocationPrompt,
  onOpenNeighborhoodSheet,
}: {
  draft: DetailEditDraft
  postType: 'request' | 'offer'
  errors: Record<string, string>
  sheet: DetailEditSheet
  permissionState: LocationPermissionState
  locationBusy: boolean
  locationError: string
  onChange: (draft: DetailEditDraft) => void
  onSheetChange: (sheet: DetailEditSheet) => void
  onOpenLocationPrompt: () => void
  onOpenNeighborhoodSheet: () => void
}) {
  const isRequest = postType === 'request'
  const categoryLabel = getSelectedCategoryLabel(draft.categoryId, draft.customCategory)
  const categoryDetails = categoryDetailOptions[draft.categoryId] ?? []
  const isOffline = draft.mode === 'nearby' || draft.mode === 'both'

  function update(next: Partial<DetailEditDraft>) {
    onChange({ ...draft, ...next })
  }

  function handleOfferPriceChange(value: string) {
    const digits = value.replace(/[^0-9]/g, '')
    if (!digits) {
      update({ priceOption: 'custom', customPrice: '' })
      return
    }
    const amount = Number(digits)
    update({
      priceOption: 'custom',
      customPrice: formatNumberInput(amount > offerMaxPrice ? offerMaxPrice : amount),
    })
  }

  return (
    <div className="post-detail-edit-form">
      <section className="step-card detail-edit-card">
        <div className="step-card-title">
          <h3>기본 정보</h3>
        </div>
        <DetailTextInput value={draft.title} onChange={(title) => update({ title })} placeholder="제목을 입력해주세요" maxLength={80} error={errors.title} />
        <DetailSelectionRow
          label="카테고리"
          value={categoryLabel || (draft.categoryId === 'etc' ? '기타 카테고리 입력' : '카테고리 선택')}
          placeholder={!categoryLabel}
          error={errors.categoryId}
          onClick={() => onSheetChange('category')}
        />
        {categoryDetails.length > 0 && (
          <DetailSelectionRow
            label="세부 카테고리"
            value={draft.categoryDetail || '세부 카테고리 선택'}
            placeholder={!draft.categoryDetail}
            error={errors.categoryDetail}
            onClick={() => onSheetChange('categoryDetail')}
          />
        )}
        <DetailSelectionRow
          label="진행 방식"
          value={modeLabel(draft.mode)}
          icon={modeIcon(draft.mode)}
          onClick={() => onSheetChange('mode')}
        />
        {isOffline && (
          <>
            <DetailSelectionRow
              label={isRequest ? '주소' : '활동 지역'}
              value={draft.addressText || (isRequest ? '주소를 검색해주세요' : '동네를 선택해주세요')}
              icon={<MapPin size={20} />}
              placeholder={!draft.addressText}
              error={errors.location}
              onClick={onOpenNeighborhoodSheet}
            />
            <button className="location-use-button" type="button" onClick={onOpenLocationPrompt} disabled={locationBusy || permissionState === 'unavailable'}>
              <Navigation size={16} />
              {locationBusy ? '위치 확인 중' : '현재 위치 사용'}
            </button>
            {locationError && <p className="field-error">{locationError}</p>}
          </>
        )}
      </section>

      {!isRequest && (
        <section className="step-card detail-edit-card">
          <div className="step-card-title">
            <h3>서비스 소개</h3>
          </div>
          <DetailTextInput value={draft.serviceIntro} onChange={(serviceIntro) => update({ serviceIntro })} placeholder="한 줄로 간단히 소개해주세요" maxLength={80} />
        </section>
      )}

      <section className="step-card detail-edit-card">
        <div className="step-card-title">
          <h3>조건</h3>
        </div>
        {isRequest ? (
          <>
            <DetailOptionGrid value={draft.priceOption} onChange={(priceOption) => update({ priceOption })} options={requestPriceOptions} columns={2} />
            {draft.priceOption === 'custom' && (
              <DetailTextInput
                value={draft.customPrice}
                onChange={(customPrice) => update({ customPrice })}
                placeholder="금액을 입력해주세요"
                inputMode="numeric"
                suffix="원"
                error={errors.customPrice}
              />
            )}
          </>
        ) : (
          <DetailTextInput
            value={draft.customPrice}
            onChange={handleOfferPriceChange}
            placeholder="10,000원 이하"
            inputMode="numeric"
            suffix="원"
            error={errors.customPrice}
          />
        )}
        {isRequest ? (
          <>
            <DetailOptionGrid value={draft.deadlineOption} onChange={(deadlineOption) => update({ deadlineOption })} options={deadlineOptions} columns={2} />
            {draft.deadlineOption === 'custom' && (
              <DetailTextInput
                value={draft.customDeadlineText}
                onChange={(customDeadlineText) => update({ customDeadlineText })}
                placeholder="예: 오늘 19:00까지"
                maxLength={80}
                error={errors.customDeadlineText}
              />
            )}
          </>
        ) : (
          <>
            <DetailSelectionRow
              label="가능 시간"
              value={getAvailableTimeText(draft.availableTimeOption, draft.customAvailableTime) || '가능 시간 선택'}
              icon={<Clock3 size={20} />}
              placeholder={!draft.availableTimeOption}
              error={errors.availableTimeOption}
              onClick={() => onSheetChange('availableTime')}
            />
          </>
        )}
      </section>

      <section className="step-card detail-edit-card">
        <div className="step-card-title">
          <h3>상세 설명</h3>
        </div>
        <DetailTextArea
          value={draft.description}
          onChange={(description) => update({ description })}
          placeholder="상세 설명을 입력해주세요"
          maxLength={1200}
          error={errors.description}
        />
      </section>

      {!isRequest && (
        <section className="step-card detail-edit-card">
          <div className="step-card-title">
            <h3>신뢰 정보</h3>
            <span>선택</span>
          </div>
          <DetailTextInput value={draft.careerSummary} onChange={(careerSummary) => update({ careerSummary })} placeholder="예: 디자인 2년차" maxLength={160} />
          <div className="stacked-fields">
            <DetailTextInput value={draft.portfolioTitle} onChange={(portfolioTitle) => update({ portfolioTitle })} placeholder="링크 제목" />
            <DetailTextInput value={draft.portfolioUrl} onChange={(portfolioUrl) => update({ portfolioUrl })} placeholder="https://..." error={errors.portfolioUrl} />
          </div>
          <DetailOptionGrid value={draft.genderVisibility} onChange={(genderVisibility) => update({ genderVisibility })} options={genderVisibilityOptions} columns={3} />
          <DetailOptionGrid
            value={draft.responseTime}
            onChange={(responseTime) => update({ responseTime })}
            options={responseTimeOptions.map((label) => ({ value: label, label }))}
            columns={2}
          />
        </section>
      )}

      {sheet === 'category' && (
        <DetailBottomSheet title="카테고리를 선택해주세요" onClose={() => onSheetChange(null)}>
          <div className="category-sheet-grid">
            {postCategories.map((item) => (
              <button
                key={item.id}
                className={draft.categoryId === item.id ? 'is-selected' : ''}
                type="button"
                onClick={() => {
                  update({ categoryId: item.id, customCategory: '', categoryDetail: '', serviceScope: [] })
                  onSheetChange(item.id === 'etc' ? 'categoryCustom' : (categoryDetailOptions[item.id] ?? []).length > 0 ? 'categoryDetail' : null)
                }}
              >
                <Image src={item.iconSrc} width={38} height={38} alt="" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </DetailBottomSheet>
      )}
      {sheet === 'categoryCustom' && (
        <DetailCustomTextSheet
          title="기타 카테고리 입력"
          value={draft.customCategory}
          placeholder="예: 행사"
          onClose={() => onSheetChange(null)}
          onSave={(customCategory) => {
            update({ customCategory })
            onSheetChange((categoryDetailOptions[draft.categoryId] ?? []).length > 0 ? 'categoryDetail' : null)
          }}
        />
      )}
      {sheet === 'categoryDetail' && (
        <DetailBottomSheet title="세부 카테고리를 선택해주세요" onClose={() => onSheetChange(null)}>
          <div className="mode-sheet-list compact">
            {categoryDetails.map((item) => (
              <button
                key={item}
                className={draft.categoryDetail === item ? 'is-selected' : ''}
                type="button"
                onClick={() => {
                  if (item === '기타') {
                    update({ categoryDetail: '' })
                    onSheetChange('categoryDetailCustom')
                    return
                  }
                  update({ categoryDetail: item })
                  onSheetChange(null)
                }}
              >
                <span>
                  <CheckCircle2 size={22} />
                </span>
                <strong>{item}</strong>
                <i>{draft.categoryDetail === item && <Check size={16} />}</i>
              </button>
            ))}
          </div>
        </DetailBottomSheet>
      )}
      {sheet === 'categoryDetailCustom' && (
        <DetailCustomTextSheet
          title="기타 세부 카테고리 입력"
          value={isCustomCategoryDetail(draft.categoryId, draft.categoryDetail) ? draft.categoryDetail : ''}
          placeholder="예: 동행"
          onClose={() => onSheetChange(null)}
          onSave={(categoryDetail) => {
            update({ categoryDetail })
            onSheetChange(null)
          }}
        />
      )}
      {sheet === 'mode' && (
        <DetailBottomSheet title="진행 방식을 선택해주세요" onClose={() => onSheetChange(null)}>
          <div className="mode-sheet-list">
            {modeOptions.map((option) => {
              const Icon = option.icon
              const selected = draft.mode === option.value
              return (
                <button
                  className={selected ? 'is-selected' : ''}
                  key={option.value}
                  type="button"
                  onClick={() => {
                    update({ mode: option.value })
                    onSheetChange(null)
                  }}
                >
                  <span>
                    <Icon size={22} />
                  </span>
                  <strong>{option.label}</strong>
                  <em>{isRequest ? option.requestDescription : option.offerDescription}</em>
                  <i>{selected && <Check size={16} />}</i>
                </button>
              )
            })}
          </div>
        </DetailBottomSheet>
      )}
      {sheet === 'availableTime' && (
        <DetailBottomSheet title="가능한 시간을 선택해주세요" onClose={() => onSheetChange(null)}>
          <div className="mode-sheet-list compact">
            {availableTimeOptions.map((option) => (
              <button
                className={draft.availableTimeOption === option.value ? 'is-selected' : ''}
                key={option.value}
                type="button"
                onClick={() => {
                  if (option.value === 'custom') {
                    onSheetChange('availableTimeCustom')
                    return
                  }
                  update({ availableTimeOption: option.value, customAvailableTime: '' })
                  onSheetChange(null)
                }}
              >
                <span>
                  <Clock3 size={22} />
                </span>
                <strong>{option.label}</strong>
                <i>{draft.availableTimeOption === option.value && <Check size={16} />}</i>
              </button>
            ))}
          </div>
        </DetailBottomSheet>
      )}
      {sheet === 'availableTimeCustom' && (
        <DetailCustomTextSheet
          title="가능한 시간 입력"
          value={draft.availableTimeOption === 'custom' ? draft.customAvailableTime : ''}
          placeholder="예: 언제든지 가능"
          maxLength={availableTimeMaxLength}
          helperText="80자 이내로 입력해주세요."
          onClose={() => onSheetChange(null)}
          onSave={(customAvailableTime) => {
            update({ availableTimeOption: 'custom', customAvailableTime })
            onSheetChange(null)
          }}
        />
      )}
    </div>
  )
}

function DetailTextInput({
  value,
  onChange,
  placeholder,
  maxLength,
  inputMode,
  suffix,
  error,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  maxLength?: number
  inputMode?: 'numeric'
  suffix?: string
  error?: string
}) {
  const visibleError = error === requiredFieldMessage && value.trim() ? undefined : error
  return (
    <label className={`step-input-wrap ${visibleError ? 'has-error' : ''}`}>
      <span className="step-input-box">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          inputMode={inputMode}
        />
        {suffix && <em>{suffix}</em>}
      </span>
      <span className="input-meta-row">
        {visibleError ? <small>{visibleError}</small> : <small />}
        {maxLength && <small>{value.length}/{maxLength}</small>}
      </span>
    </label>
  )
}

function DetailTextArea({
  value,
  onChange,
  placeholder,
  maxLength,
  error,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  maxLength?: number
  error?: string
}) {
  const visibleError = error === requiredFieldMessage && value.trim() ? undefined : error
  return (
    <label className={`step-textarea-wrap ${visibleError ? 'has-error' : ''}`}>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} />
      <span className="input-meta-row">
        {visibleError ? <small>{visibleError}</small> : <small />}
        {maxLength && <small>{value.length}/{maxLength}</small>}
      </span>
    </label>
  )
}

function DetailSelectionRow({
  label,
  value,
  icon,
  placeholder,
  error,
  onClick,
}: {
  label: string
  value: string
  icon?: ReactNode
  placeholder?: boolean
  error?: string
  onClick: () => void
}) {
  const visibleError = error === requiredFieldMessage && !placeholder ? undefined : error
  return (
    <div className="selection-field">
      <button className={`selection-row ${placeholder ? 'is-placeholder' : ''} ${visibleError ? 'has-error' : ''}`} type="button" onClick={onClick}>
        <strong>{label}</strong>
        <span className="selection-icon">{icon}</span>
        <span>{value}</span>
        <ChevronRight size={18} />
      </button>
      {visibleError && <p className="field-error">{visibleError}</p>}
    </div>
  )
}

function DetailOptionGrid<T extends string>({
  value,
  onChange,
  options,
  columns = 2,
}: {
  value: string
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
  columns?: 2 | 3
}) {
  return (
    <div className={`option-grid columns-${columns}`}>
      {options.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? 'is-selected' : ''}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function DetailBottomSheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <div className="registration-bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="detail-edit-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="registration-bottom-sheet-header">
          <div className="drag-handle" />
          <button className="sheet-x" type="button" onClick={onClose} aria-label="닫기">
            <X size={22} />
          </button>
          <h2 id="detail-edit-sheet-title">{title}</h2>
        </div>
        <div className="registration-bottom-sheet-content">{children}</div>
      </div>
    </div>
  )
}

function DetailCustomTextSheet({
  title,
  value,
  placeholder,
  maxLength = customCategoryMaxLength,
  helperText = '10자 미만으로 입력해주세요.',
  onSave,
  onClose,
}: {
  title: string
  value: string
  placeholder: string
  maxLength?: number
  helperText?: string
  onSave: (value: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(value)
  const trimmed = draft.trim()
  return (
    <DetailBottomSheet title={title} onClose={onClose}>
      <div className="custom-category-input">
        <DetailTextInput value={draft} onChange={setDraft} placeholder={placeholder} maxLength={maxLength} error={!trimmed ? requiredFieldMessage : undefined} />
        <p>{helperText}</p>
        <button className="address-modal-confirm" type="button" disabled={!trimmed} onClick={() => onSave(trimmed)}>
          확인
        </button>
      </div>
    </DetailBottomSheet>
  )
}

function genderVisibilityText(value?: GenderVisibility) {
  if (value === 'male') return '남성'
  if (value === 'female') return '여성'
  return '공개 안 함'
}

function getDetailInfoRows(post: ApiTaskPost | null, displayPost: RequestPost) {
  const rows: Array<{ icon: ReactNode; label: string; value: string }> = [
    { icon: <MapPin size={18} />, label: displayPost.postType === 'offer' ? '가능한 방식' : '진행 방식', value: modeLabel(displayPost.mode) },
  ]
  const isOffline = displayPost.mode === 'nearby' || displayPost.mode === 'both'
  const location = post?.addressText || displayPost.location
  if (isOffline && location) rows.push({ icon: <MapPin size={18} />, label: displayPost.postType === 'offer' ? '활동 지역' : '위치', value: location })
  rows.push({ icon: <Clock size={18} />, label: displayPost.postType === 'offer' ? '가능 시간' : '마감 시간', value: displayPost.deadline })
  return rows
}

function createEditDraft(post: ApiTaskPost, displayPost: RequestPost): DetailEditDraft {
  const priceOption = priceToOption(post.price, post.postType)
  const deadlineOption = deadlineTextToOption(post.deadlineText ?? null)
  const availableTimeOption = availableTimeTextToOption(post.availableTimeText ?? null)
  const portfolioLinks = normalizePortfolioLinks(post)
  const firstPortfolio = portfolioLinks[0]
  const categoryId = categoryIdFromLabel(post.category)

  return {
    title: post.title,
    categoryId,
    customCategory: categoryId === 'etc' && post.category !== getCategoryLabel('etc') ? post.category : '',
    categoryDetail: post.categoryDetail ?? '',
    mode: post.mode,
    addressText: post.addressText ?? '',
    region1Depth: post.region1depth ?? '',
    region2Depth: post.region2depth ?? '',
    region3Depth: post.region3depth ?? '',
    regionCode: post.regionCode ?? null,
    latitude: numberOrNull(post.latitude),
    longitude: numberOrNull(post.longitude),
    locationSource: post.locationSource ?? null,
    priceOption,
    customPrice: post.postType === 'offer' || priceOption === 'custom' ? formatNumberInput(post.price) : '',
    deadlineOption,
    customDeadlineText: deadlineOption === 'custom' ? post.deadlineText ?? displayPost.deadline : '',
    availableTimeOption,
    customAvailableTime: availableTimeOption === 'custom' ? post.availableTimeText ?? displayPost.deadline : '',
    genderVisibility: post.genderVisibility,
    serviceIntro: post.serviceIntro ?? '',
    serviceScope: Array.isArray(post.serviceScope) ? post.serviceScope : [],
    careerSummary: post.careerSummary ?? post.experienceSummary ?? '',
    portfolioTitle: firstPortfolio?.title ?? '',
    portfolioUrl: firstPortfolio?.url ?? post.portfolioUrl ?? '',
    responseTime: post.responseTime ?? post.responseTimeText ?? '',
    description: post.description,
  }
}

function validateEditDraft(draft: DetailEditDraft, postType: 'request' | 'offer') {
  const errors: Record<string, string> = {}
  if (!draft.title.trim()) errors.title = requiredFieldMessage
  if (draft.categoryId === 'etc') {
    const categoryError = getCustomTextError(draft.customCategory, '카테고리')
    if (categoryError) errors.categoryId = categoryError
  }
  if ((categoryDetailOptions[draft.categoryId] ?? []).length > 0) {
    if (!draft.categoryDetail) errors.categoryDetail = requiredFieldMessage
    else if (draft.categoryDetail === '기타') errors.categoryDetail = requiredFieldMessage
    else if (isCustomCategoryDetail(draft.categoryId, draft.categoryDetail)) {
      const detailError = getCustomTextError(draft.categoryDetail, '세부 카테고리')
      if (detailError) errors.categoryDetail = detailError
    }
  }
  if (!draft.description.trim()) errors.description = requiredFieldMessage
  const price = getPriceValue(draft.priceOption, draft.customPrice)
  if (price <= 0) errors.customPrice = '금액을 입력해주세요.'
  else if (postType === 'offer' && price < offerMinPrice) errors.customPrice = '최소 1,000원'
  else if (postType === 'offer' && price > offerMaxPrice) errors.customPrice = '최대 1만원'
  if ((draft.mode === 'nearby' || draft.mode === 'both') && !draft.addressText.trim()) {
    errors.location = requiredFieldMessage
  }
  if (postType === 'request' && draft.deadlineOption === 'custom' && !draft.customDeadlineText.trim()) {
    errors.customDeadlineText = requiredFieldMessage
  }
  if (postType === 'offer') {
    if (!draft.availableTimeOption) errors.availableTimeOption = requiredFieldMessage
    if (draft.availableTimeOption === 'custom' && !draft.customAvailableTime.trim()) {
      errors.availableTimeOption = requiredFieldMessage
      errors.customAvailableTime = requiredFieldMessage
    } else if (draft.availableTimeOption === 'custom' && draft.customAvailableTime.trim().length > availableTimeMaxLength) {
      errors.availableTimeOption = '가능 시간은 80자 이내로 입력해주세요.'
      errors.customAvailableTime = '가능 시간은 80자 이내로 입력해주세요.'
    }
    if (draft.portfolioUrl.trim() && !isValidUrl(draft.portfolioUrl.trim())) {
      errors.portfolioUrl = '올바른 링크를 입력해주세요.'
    }
  }
  return errors
}

function mergeUpdatedPost(current: ApiTaskPost | null, updated: ApiTaskPost): ApiTaskPost {
  if (!current) return updated
  return {
    ...current,
    ...updated,
    images: current.images,
    creatorNickname: current.creatorNickname,
    creatorAvatarUrl: current.creatorAvatarUrl,
    creatorRatingAvg: current.creatorRatingAvg,
    creatorCompletedCount: current.creatorCompletedCount,
  }
}

function categoryIdFromLabel(label: string) {
  return postCategories.find((category) => category.label === label)?.id ?? 'etc'
}

function getSelectedCategoryLabel(categoryId: string, customCategory: string) {
  if (!categoryId) return ''
  if (categoryId === 'etc') return customCategory.trim()
  return getCategoryLabel(categoryId)
}

function isCustomCategoryDetail(categoryId: string, value: string) {
  const trimmed = value.trim()
  return Boolean(trimmed && !(categoryDetailOptions[categoryId] ?? []).includes(trimmed))
}

function getCustomTextError(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) return requiredFieldMessage
  if (trimmed.length >= 10) return `${label}는 10자 미만으로 입력해주세요.`
  return ''
}

function priceToOption(price: number, postType: 'request' | 'offer'): PriceOption {
  if (postType === 'offer') return 'custom'
  return requestPriceOptions.some((option) => option.value !== 'custom' && Number(option.value) === price)
    ? (String(price) as PriceOption)
    : 'custom'
}

function deadlineTextToOption(value: string | null): DeadlineOption {
  const option = deadlineOptions.find((item) => item.label === value)
  return option?.value ?? 'custom'
}

function availableTimeTextToOption(value: string | null): AvailableTimeOption {
  const option = availableTimeOptions.find((item) => item.label === value)
  return option?.value ?? 'custom'
}

function modeLabel(mode: RequestMode) {
  return modeOptions.find((option) => option.value === mode)?.label ?? '내 주변'
}

function modeIcon(mode: RequestMode) {
  const Icon = modeOptions.find((option) => option.value === mode)?.icon ?? MapPin
  return <Icon size={20} />
}

function getPriceValue(option: PriceOption, customPrice: string) {
  if (option === 'custom') return Number(customPrice.replace(/[^0-9]/g, ''))
  return Number(option)
}

function formatNumberInput(value: number) {
  if (!Number.isFinite(value) || value <= 0) return ''
  return String(Math.floor(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function getDeadlineIso(option: DeadlineOption) {
  if (option === 'custom') return null
  const date = new Date()
  if (option === 'now') date.setHours(date.getHours() + 2)
  if (option === 'today') date.setHours(18, 0, 0, 0)
  if (option === 'tomorrow') {
    date.setDate(date.getDate() + 1)
    date.setHours(18, 0, 0, 0)
  }
  return date.toISOString()
}

function getRequestDeadlineText(option: DeadlineOption, customText: string) {
  if (option === 'custom') return customText.trim()
  return deadlineOptions.find((item) => item.value === option)?.label ?? ''
}

function getAvailableTimeText(option: AvailableTimeOption, customText: string) {
  if (option === 'custom') return customText.trim()
  return availableTimeOptions.find((item) => item.value === option)?.label ?? ''
}

function isFastDeadlineText(value: string) {
  return value.trim() === '가능한 빠르게'
}

function normalizePortfolioLinks(post: ApiTaskPost) {
  const links = Array.isArray(post.portfolioLinks) ? post.portfolioLinks : []
  if (links.length > 0) return links.filter((link) => link.url)
  return post.portfolioUrl ? [{ title: '포트폴리오', url: post.portfolioUrl }] : []
}

function getPortfolioLinks(title: string, url: string) {
  const trimmedUrl = url.trim()
  if (!trimmedUrl) return []
  return [{ title: title.trim() || '포트폴리오', url: trimmedUrl }]
}

function nullableText(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function numberOrNull(value: number | string | null) {
  if (value == null) return null
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
