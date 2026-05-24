'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe2,
  Link as LinkIcon,
  MapPin,
  UsersRound,
  X,
} from 'lucide-react'
import { AppHeader } from '@/components/ui/Common'
import { NeighborhoodSelectSheet } from '@/components/location/LocationSheets'
import { requestIOSPushPermission } from '@/components/NativeIOSBridge'
import { PhoneVerificationOverlay } from '@/components/PhoneVerificationOverlay'
import {
  categoryDetailOptions,
  customCategoryDetailMaxLength,
  customCategoryDetailOption,
  getCategoryLabel,
  postCategories,
  type Category,
  type RequestMode,
} from '@/data/mockData'
import {
  createTaskPost,
  fetchActivityProfiles,
  fetchMyPage,
  isPhoneVerificationRequired,
  saveMyLocationPreference,
  type ActivityProfile,
} from '@/lib/manwonApi'
import { ImageUploader, getImagePreviewUrl, toPersistedImages, useImagePreviewCleanup, type ImageRecord } from '@/components/ImageUploader'
import {
  getLocationPermissionState,
  requestBrowserLocation,
  reverseGeocode,
  storeLocationRegion,
  toNeighborhoodRegion,
  type LocationPermissionState,
  type LocationRegion,
} from '@/lib/location'

export type RegisterKind = 'request' | 'offer'
type RequestStep = 1 | 2 | 3 | 4
type OfferStep = 1 | 2 | 3 | 4
type PriceOption = '5000' | '10000' | '15000' | '20000' | 'custom'
type DeadlineOption = 'asap' | 'custom'
type AvailableTimeOption = 'now' | 'today' | 'weekday' | 'weekend' | 'custom'
type GenderVisibility = 'private' | 'male' | 'female'
type SheetKind =
  | 'category'
  | 'categoryCustom'
  | 'categoryDetail'
  | 'categoryDetailCustom'
  | 'requestMode'
  | 'requestDeadline'
  | 'offerMode'
  | 'availableTime'
  | 'availableTimeCustom'
  | null

type PortfolioLink = {
  title: string
  url: string
}

type StepErrors = Record<string, string>

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

const deadlineOptions = [
  { value: 'asap', label: '가능한 빠르게' },
  { value: 'custom', label: '직접 선택' },
] as const

const requestMinPrice = 1000
const requestMaxPrice = 10000
const customCategoryMaxLength = 9
const availableTimeMaxLength = 8
const requiredFieldMessage = '필수 항목이에요.'
const calendarWeekdays = ['일', '월', '화', '수', '목', '금', '토']

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

export function RegisterScreens({
  onFlowActiveChange,
}: {
  onRegistered?: (postId: string) => void
  onFlowActiveChange?: (active: boolean) => void
}) {
  const router = useRouter()

  useEffect(() => {
    onFlowActiveChange?.(false)
  }, [onFlowActiveChange])

  useEffect(() => () => onFlowActiveChange?.(false), [onFlowActiveChange])

  return <RegistrationTypeScreen onSelect={(kind) => router.push(`/register/${kind}`)} />
}

export function RegistrationTypeScreen({ onSelect }: { onSelect: (kind: RegisterKind) => void }) {
  return (
    <section className="screen register-screen">
      <AppHeader title="등록" subtitle="어떤 글을 올릴까요?" />
      <div className="register-type-stack">
        <button className="register-type-card" type="button" onClick={() => onSelect('request')}>
          <div>
            <strong>해주세요</strong>
            <span>누군가에게 부탁하고 싶어요</span>
          </div>
          <span className="register-type-visual">
            <Image src="/registration/1.png" width={118} height={118} alt="" aria-hidden="true" />
          </span>
          <ChevronRight size={23} />
        </button>
        <button className="register-type-card" type="button" onClick={() => onSelect('offer')}>
          <div>
            <strong>해줄게요</strong>
            <span>내가 가능한 일을 올리고 싶어요</span>
          </div>
          <span className="register-type-visual">
            <Image src="/registration/2.png" width={118} height={118} alt="" aria-hidden="true" />
          </span>
          <ChevronRight size={23} />
        </button>
      </div>
    </section>
  )
}

export function RequestRegistrationFlow({ onExit, onRegistered }: { onExit: () => void; onRegistered?: (postId: string) => void }) {
  const [step, setStep] = useState<RequestStep>(1)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [errors, setErrors] = useState<StepErrors>({})
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [permissionState, setPermissionState] = useState<LocationPermissionState>('unknown')
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [showNeighborhoodSheet, setShowNeighborhoodSheet] = useState(false)
  const [showPhoneVerification, setShowPhoneVerification] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [profileLoadState, setProfileLoadState] = useState<'loading' | 'ready' | 'error'>('loading')

  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [categoryDetail, setCategoryDetail] = useState('')
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<ImageRecord[]>([])
  const [mode, setMode] = useState<RequestMode | null>(null)
  const [locationRegion, setLocationRegion] = useState<LocationRegion | null>(null)
  const priceOption: PriceOption = 'custom'
  const [customPrice, setCustomPrice] = useState(formatNumberInput(requestMaxPrice))
  const [priceNotice, setPriceNotice] = useState('')
  const [deadlineOption, setDeadlineOption] = useState<DeadlineOption>('asap')
  const [customDeadlineText, setCustomDeadlineText] = useState('')

  const isOffline = mode === 'nearby' || mode === 'both'
  const selectedCategory = getCategory(categoryId)
  const selectedCategoryLabel = getSelectedCategoryLabel(categoryId, customCategory)
  const selectedCategoryDetails = getCategoryDetailOptions(categoryId)
  const price = getPriceValue(priceOption, customPrice)
  const deadlineText = getRequestDeadlineText(deadlineOption, customDeadlineText)
  const isDirty = hasRequestInput({ title, categoryId, customCategory, categoryDetail, description, images, mode, customPrice, customDeadlineText })

  useImagePreviewCleanup(images)

  useEffect(() => {
    getLocationPermissionState().then(setPermissionState).catch(() => setPermissionState('unknown'))
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchActivityProfiles()
      .then((profiles) => {
        if (cancelled) return
        setSelectedProfileId((current) => current || getDefaultActivityProfileId(profiles))
        setProfileLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setProfileLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  function handleBack() {
    if (step > 1) {
      setStep((current) => (current - 1) as RequestStep)
      return
    }
    if (isDirty) setShowLeaveConfirm(true)
    else onExit()
  }

  function goNext() {
    const nextErrors = validateRequestStep(step, {
      title,
      categoryId,
      customCategory,
      categoryDetail,
      description,
      mode,
      locationRegion,
      priceOption,
      customPrice,
      deadlineOption,
      customDeadlineText,
      selectedProfileId,
    })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setStep((current) => (current + 1) as RequestStep)
  }

  async function submitPost() {
    if (!selectedProfileId) {
      setErrors({ submit: getProfileUnavailableMessage(profileLoadState) })
      return
    }

    const validation = validateRequestAll({
      title,
      categoryId,
      customCategory,
      categoryDetail,
      description,
      mode,
      locationRegion,
      priceOption,
      customPrice,
      deadlineOption,
      customDeadlineText,
      selectedProfileId,
    })
    if (validation.step) {
      setErrors(validation.errors)
      setStep(validation.step)
      return
    }

    setSaveState('saving')
    setErrors({})
    try {
      const createdPost = await createTaskPost({
        profileId: selectedProfileId,
        postType: 'request',
        title: title.trim(),
        category: getSelectedCategoryLabel(categoryId, customCategory) || getCategoryLabel(categoryId),
        categoryDetail: nullableText(categoryDetail),
        description: description.trim(),
        mode: mode ?? 'nearby',
        price,
        deadlineAt: getDeadlineIso(deadlineOption, customDeadlineText),
        deadlineText,
        capacityType: 'unlimited',
        capacityLimit: null,
        genderVisibility: 'private',
        addressText: isOffline ? locationRegion?.addressText ?? null : null,
        region1Depth: isOffline ? locationRegion?.region1Depth ?? null : null,
        region2Depth: isOffline ? locationRegion?.region2Depth ?? null : null,
        region3Depth: isOffline ? locationRegion?.region3Depth ?? null : null,
        regionCode: isOffline ? locationRegion?.regionCode ?? null : null,
        locationSource: isOffline ? locationRegion?.locationSource ?? null : null,
        latitude: isOffline ? locationRegion?.latitude ?? null : null,
        longitude: isOffline ? locationRegion?.longitude ?? null : null,
        images: toPersistedImages(images),
      })
      requestIOSPushPermission('post_created')
      if (onRegistered) window.setTimeout(() => onRegistered(createdPost.id), 350)
    } catch (error) {
      if (isPhoneVerificationRequired(error)) {
        setSaveState('idle')
        setShowPhoneVerification(true)
        return
      }
      setSaveState('error')
      setErrors({ submit: error instanceof Error ? error.message : '등록에 실패했습니다.' })
    }
  }

  async function applyLocationRegion(region: LocationRegion, nextPermissionState: LocationPermissionState) {
    setLocationRegion(region)
    storeLocationRegion(toNeighborhoodRegion(region))
    setPermissionState(nextPermissionState)
    setLocationError('')
    await saveMyLocationPreference({
      latitude: region.latitude,
      longitude: region.longitude,
      region1Depth: region.region1Depth,
      region2Depth: region.region2Depth,
      region3Depth: region.region3Depth,
      permissionStatus: nextPermissionState,
    }).catch(() => undefined)
  }

  async function requestCurrentLocationFromUser() {
    setLocationBusy(true)
    setLocationError('')
    try {
      const current = await requestBrowserLocation()
      const region = await reverseGeocode(current.latitude, current.longitude, 'gps', 'address')
      setPermissionState('granted')
      setLocationError('')
      await saveMyLocationPreference({
        latitude: region.latitude,
        longitude: region.longitude,
        region1Depth: region.region1Depth,
        region2Depth: region.region2Depth,
        region3Depth: region.region3Depth,
        permissionStatus: 'granted',
      }).catch(() => undefined)
      return region
    } catch (error) {
      const nextPermission = await getLocationPermissionState()
      setPermissionState(nextPermission)
      setLocationError(error instanceof Error ? error.message : '현재 위치를 가져오지 못했습니다.')
      await saveMyLocationPreference({ permissionStatus: nextPermission }).catch(() => undefined)
      return undefined
    } finally {
      setLocationBusy(false)
    }
  }

  function handleRequestPriceChange(value: string) {
    const digits = value.replace(/[^0-9]/g, '')
    setErrors((current) => {
      if (!current.customPrice) return current
      const next = { ...current }
      delete next.customPrice
      return next
    })
    if (!digits) {
      setCustomPrice('')
      setPriceNotice('')
      return
    }
    const amount = Number(digits)
    if (amount > requestMaxPrice) {
      setCustomPrice(formatNumberInput(requestMaxPrice))
      setPriceNotice('최대 1만원')
      return
    }
    setCustomPrice(formatNumberInput(amount))
    setPriceNotice(amount < requestMinPrice ? '최소 1,000원' : '')
  }

  return (
    <section className="registration-flow-screen">
      <StepHeader title="해주세요 등록" progress={`${Math.min(step, 3)}/3`} onBack={handleBack} />
      <div className="step-content">
        {step === 1 && (
          <>
            <StepPageTitle title="어떤 부탁이 필요한가요?" />
            <InlineTextField label="제목" value={title} onChange={setTitle} placeholder="제목을 짧게 적어주세요" maxLength={30} error={errors.title} />
            <SelectionRow
              label="카테고리"
              value={selectedCategoryLabel || (categoryId === 'etc' ? '기타 카테고리를 입력해주세요' : '카테고리를 선택해주세요')}
              icon={selectedCategory ? <CategoryIcon category={selectedCategory} /> : null}
              placeholder={!selectedCategoryLabel}
              error={errors.categoryId}
              onClick={() => setSheet('category')}
            />
            {selectedCategoryDetails.length > 0 && (
              <SelectionRow
                label="세부 카테고리"
                value={categoryDetail || '세부 카테고리를 선택해주세요'}
                placeholder={!categoryDetail}
                error={errors.categoryDetail}
                onClick={() => setSheet('categoryDetail')}
              />
            )}
            <StepCard title="상세 설명">
              <TextAreaInput
                value={description}
                onChange={setDescription}
                placeholder="부탁 내용을 자세히 적어주세요"
                maxLength={500}
                compact
                error={errors.description}
              />
            </StepCard>
            <ImageUploader title="사진 첨부" optional images={images} onChange={setImages} />
          </>
        )}

        {step === 2 && (
          <>
            <StepPageTitle title="어디서 진행할까요?" />
            <SelectionRow
              label="진행 방식"
              value={mode ? getModeLabel(mode) : '진행 방식을 선택해주세요'}
              icon={mode ? getModeIcon(mode) : null}
              placeholder={!mode}
              error={errors.mode}
              onClick={() => setSheet('requestMode')}
            />
            {mode === 'online' ? (
              <InlineNotice icon={<Globe2 size={18} />} title="온라인으로 진행되는 부탁이에요" description="채팅이나 파일 공유로 진행할 수 있어요." />
            ) : (
              <SelectionRow
                label="주소"
                hideLabel
                value={locationRegion ? locationRegion.addressText : '주소를 검색해주세요'}
                icon={<MapPin size={18} />}
                placeholder={!locationRegion}
                error={errors.locationRegion}
                onClick={() => setShowNeighborhoodSheet(true)}
              />
            )}
          </>
        )}

        {step === 3 && (
          <>
            <StepPageTitle title="얼마에, 언제까지 부탁할까요?" />
            <InlineTextField
              label="금액"
              value={customPrice}
              onChange={handleRequestPriceChange}
              placeholder="10,000원 이하"
              inputMode="numeric"
              suffix="원"
              error={errors.customPrice}
              errorInside
              inlineMessage={customPrice ? errors.customPrice || priceNotice : priceNotice}
            />
            <SelectionRow
              label="마감 시간"
              value={deadlineText || '마감 시간을 선택해주세요'}
              icon={<Clock3 size={18} />}
              error={errors.customDeadlineText}
              onClick={() => setSheet('requestDeadline')}
            />
          </>
        )}

        {step === 4 && (
          <>
            <StepPageTitle title="내용을 확인하고 등록할까요?" />
            <PreviewCard
              rows={[
                { label: '제목', value: title, onEdit: () => setStep(1) },
                {
                  label: '카테고리',
                  value: selectedCategoryLabel || '-',
                  icon: selectedCategory ? <CategoryIcon category={selectedCategory} /> : null,
                  onEdit: () => setStep(1),
                },
                { label: '세부 카테고리', value: categoryDetail || '-', onEdit: () => setStep(1) },
                { label: '진행 방식', value: mode ? getModeLabel(mode) : '-', icon: mode ? getModeIcon(mode) : null, onEdit: () => setStep(2) },
                {
                  label: '위치',
                  value: isOffline && locationRegion ? locationRegion.addressText : '온라인',
                  onEdit: () => setStep(2),
                },
                { label: '금액', value: formatWon(price), accent: true, onEdit: () => setStep(3) },
                { label: '마감 시간', value: deadlineText, icon: <Clock3 size={18} />, onEdit: () => setStep(3) },
              ]}
              description={description}
              images={images}
            />
          </>
        )}
      </div>

      <StepFooter
        secondaryLabel={step === 1 ? undefined : step === 4 ? '수정하기' : '이전'}
        primaryLabel={step === 4 ? (saveState === 'saving' ? '등록 중' : '부탁 등록하기') : '다음'}
        onSecondary={step === 4 ? () => setStep(1) : () => setStep((current) => (current - 1) as RequestStep)}
        onPrimary={step === 4 ? () => void submitPost() : goNext}
        primaryDisabled={saveState === 'saving'}
      />

      {errors.submit && <ToastMessage message={errors.submit} />}
      {sheet === 'category' && (
        <CategoryBottomSheet
          selectedId={categoryId}
          onClose={() => setSheet(null)}
          onSelect={(nextCategoryId) => {
            setCategoryId(nextCategoryId)
            setCustomCategory('')
            setCategoryDetail('')
            setSheet(nextCategoryId === 'etc' ? 'categoryCustom' : getCategoryDetailOptions(nextCategoryId).length > 0 ? 'categoryDetail' : null)
          }}
        />
      )}
      {sheet === 'categoryCustom' && (
        <CustomTextBottomSheet
          title="기타 카테고리 입력"
          value={customCategory}
          placeholder="예: 행사"
          onClose={() => setSheet(null)}
          onSave={(nextValue) => {
            setCustomCategory(nextValue)
            setSheet(getCategoryDetailOptions(categoryId).length > 0 ? 'categoryDetail' : null)
          }}
        />
      )}
      {sheet === 'categoryDetail' && (
        <CategoryDetailBottomSheet
          categoryId={categoryId}
          selectedValue={categoryDetail}
          onClose={() => setSheet(null)}
          onSelect={(nextCategoryDetail) => {
            if (nextCategoryDetail === customCategoryDetailOption) {
              setCategoryDetail('')
              setSheet('categoryDetailCustom')
              return
            }
            setCategoryDetail(nextCategoryDetail)
            setSheet(null)
          }}
        />
      )}
      {sheet === 'categoryDetailCustom' && (
        <CustomTextBottomSheet
          title="세부 카테고리 직접 입력"
          value={isCustomCategoryDetail(categoryId, categoryDetail) ? categoryDetail : ''}
          placeholder="예: 동행"
          maxLength={customCategoryDetailMaxLength}
          helperText={`${customCategoryDetailMaxLength}자 이내로 입력해주세요.`}
          onClose={() => setSheet(null)}
          onSave={(nextValue) => {
            setCategoryDetail(nextValue)
            setSheet(null)
          }}
        />
      )}
      {sheet === 'requestMode' && (
        <ModeBottomSheet
          title="진행 방식을 선택해주세요"
          variant="request"
          selectedMode={mode}
          onClose={() => setSheet(null)}
          onSelect={(nextMode) => {
            setMode(nextMode)
            setSheet(null)
            if (nextMode !== 'online' && !locationRegion) setShowNeighborhoodSheet(true)
          }}
        />
      )}
      {sheet === 'requestDeadline' && (
        <RequestDeadlineOverlay
          title="마감 시간을 선택해주세요"
          selectedOption={deadlineOption}
          selectedDate={customDeadlineText}
          onClose={() => setSheet(null)}
          onSelectAsap={() => {
            setDeadlineOption('asap')
            setCustomDeadlineText('')
            setSheet(null)
          }}
          onSelectDate={(nextDate) => {
            setDeadlineOption('custom')
            setCustomDeadlineText(nextDate)
            setSheet(null)
          }}
        />
      )}
      {showNeighborhoodSheet && (
        <NeighborhoodSelectSheet
          searchMode="address"
          promptContext="request"
          permissionState={permissionState}
          busy={locationBusy}
          error={locationError}
          onUseCurrent={requestCurrentLocationFromUser}
          onSelect={(region) => {
            void applyLocationRegion(region, permissionState === 'granted' ? 'granted' : 'prompt')
            setShowNeighborhoodSheet(false)
          }}
          onClose={() => setShowNeighborhoodSheet(false)}
        />
      )}
      {showPhoneVerification && (
        <PhoneVerificationOverlay
          onClose={() => setShowPhoneVerification(false)}
          onVerified={() => void submitPost()}
        />
      )}
      {showLeaveConfirm && <ConfirmLeaveDialog onCancel={() => setShowLeaveConfirm(false)} onConfirm={onExit} />}
    </section>
  )
}

export function OfferRegistrationFlow({ onExit, onRegistered }: { onExit: () => void; onRegistered?: (postId: string) => void }) {
  const [step, setStep] = useState<OfferStep>(1)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [errors, setErrors] = useState<StepErrors>({})
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [permissionState, setPermissionState] = useState<LocationPermissionState>('unknown')
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [showNeighborhoodSheet, setShowNeighborhoodSheet] = useState(false)
  const [showPhoneVerification, setShowPhoneVerification] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [profileLoadState, setProfileLoadState] = useState<'loading' | 'ready' | 'error'>('loading')

  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [categoryDetail, setCategoryDetail] = useState('')
  const [mode, setMode] = useState<RequestMode | null>(null)
  const [activityRegion, setActivityRegion] = useState<LocationRegion | null>(null)
  const [availableTimeOption, setAvailableTimeOption] = useState<AvailableTimeOption | null>(null)
  const [customAvailableTime, setCustomAvailableTime] = useState('')
  const priceOption: PriceOption = 'custom'
  const [customPrice, setCustomPrice] = useState(formatNumberInput(requestMaxPrice))
  const [priceNotice, setPriceNotice] = useState('')
  const [description, setDescription] = useState('')
  const [careerSummary, setCareerSummary] = useState('')
  const [showPortfolioForm, setShowPortfolioForm] = useState(false)
  const [portfolioTitle, setPortfolioTitle] = useState('')
  const [portfolioUrl, setPortfolioUrl] = useState('')
  const [postImages, setPostImages] = useState<ImageRecord[]>([])
  const [sampleImages, setSampleImages] = useState<ImageRecord[]>([])
  const [genderVisibility, setGenderVisibility] = useState<GenderVisibility>('private')
  const [responseTime, setResponseTime] = useState('')

  const selectedCategory = getCategory(categoryId)
  const selectedCategoryLabel = getSelectedCategoryLabel(categoryId, customCategory)
  const selectedCategoryDetails = getCategoryDetailOptions(categoryId)
  const isOffline = mode === 'nearby' || mode === 'both'
  const price = getPriceValue(priceOption, customPrice)
  const availableTimeText = getAvailableTimeText(availableTimeOption, customAvailableTime)
  const portfolioLinks = getPortfolioLinks(portfolioTitle, portfolioUrl)
  const isDirty = hasOfferInput({ title, categoryId, customCategory, categoryDetail, mode, customAvailableTime, customPrice, description, careerSummary, portfolioUrl, postImages, sampleImages, responseTime })

  useImagePreviewCleanup(postImages)
  useImagePreviewCleanup(sampleImages)

  useEffect(() => {
    getLocationPermissionState().then(setPermissionState).catch(() => setPermissionState('unknown'))
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchActivityProfiles()
      .then((profiles) => {
        if (cancelled) return
        setSelectedProfileId((current) => current || getDefaultActivityProfileId(profiles))
        setProfileLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setProfileLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    fetchMyPage()
      .then((profile) => {
        if (cancelled) return
        const trustCareer = stringFromProfile(profile, 'trustCareerSummary') || stringFromProfile(profile, 'trustExperienceSummary')
        const trustResponseTime = stringFromProfile(profile, 'trustResponseTime') || stringFromProfile(profile, 'trustResponseTimeText')
        const trustGender = stringFromProfile(profile, 'trustGenderVisibility')
        const trustLinks = portfolioLinksFromProfile(profile)
        const trustImages = trustImagesFromProfile(profile)

        if (trustCareer) setCareerSummary(trustCareer)
        if (trustResponseTime) setResponseTime(trustResponseTime)
        if (trustGender === 'male' || trustGender === 'female' || trustGender === 'private') setGenderVisibility(trustGender)
        if (trustLinks.length > 0) {
          setShowPortfolioForm(true)
          setPortfolioTitle(trustLinks[0]?.title ?? '포트폴리오')
          setPortfolioUrl(trustLinks[0]?.url ?? '')
        }
        if (trustImages.length > 0) setSampleImages(trustImages)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  function handleBack() {
    if (step > 1) {
      setStep((current) => (current - 1) as OfferStep)
      return
    }
    if (isDirty) setShowLeaveConfirm(true)
    else onExit()
  }

  function goNext() {
    const nextErrors = validateOfferStep(step, {
      title,
      categoryId,
      customCategory,
      categoryDetail,
      mode,
      activityRegion,
      availableTimeOption,
      customAvailableTime,
      priceOption,
      customPrice,
      description,
      portfolioUrl,
      selectedProfileId,
    })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setStep((current) => (current + 1) as OfferStep)
  }

  async function submitPost() {
    if (!selectedProfileId) {
      setErrors({ submit: getProfileUnavailableMessage(profileLoadState) })
      return
    }

    const validation = validateOfferAll({
      title,
      categoryId,
      customCategory,
      categoryDetail,
      mode,
      activityRegion,
      availableTimeOption,
      customAvailableTime,
      priceOption,
      customPrice,
      description,
      portfolioUrl,
      selectedProfileId,
    })
    if (validation.step) {
      setErrors(validation.errors)
      setStep(validation.step)
      return
    }

    setSaveState('saving')
    setErrors({})
    try {
      const createdPost = await createTaskPost({
        profileId: selectedProfileId,
        postType: 'offer',
        title: title.trim(),
        category: getSelectedCategoryLabel(categoryId, customCategory) || getCategoryLabel(categoryId),
        categoryDetail: nullableText(categoryDetail),
        description: description.trim(),
        mode: mode ?? 'online',
        price,
        availableTimeText,
        serviceScope: [],
        experienceSummary: nullableText(careerSummary),
        careerSummary: nullableText(careerSummary),
        portfolioUrl: portfolioLinks[0]?.url ?? null,
        portfolioLinks,
        responseTimeText: nullableText(responseTime),
        responseTime: nullableText(responseTime),
        capacityType: 'unlimited',
        capacityLimit: null,
        genderVisibility,
        addressText: isOffline ? activityRegion?.addressText ?? null : null,
        region1Depth: isOffline ? activityRegion?.region1Depth ?? null : null,
        region2Depth: isOffline ? activityRegion?.region2Depth ?? null : null,
        region3Depth: isOffline ? activityRegion?.region3Depth ?? null : null,
        regionCode: isOffline ? activityRegion?.regionCode ?? null : null,
        locationSource: isOffline ? activityRegion?.locationSource ?? null : null,
        latitude: isOffline ? activityRegion?.latitude ?? null : null,
        longitude: isOffline ? activityRegion?.longitude ?? null : null,
        images: toPersistedImages(postImages),
        trustExampleImages: toPersistedImages(sampleImages),
        workSampleImages: toPersistedImages(sampleImages),
      })
      requestIOSPushPermission('post_created')
      if (onRegistered) window.setTimeout(() => onRegistered(createdPost.id), 350)
    } catch (error) {
      if (isPhoneVerificationRequired(error)) {
        setSaveState('idle')
        setShowPhoneVerification(true)
        return
      }
      setSaveState('error')
      setErrors({ submit: error instanceof Error ? error.message : '등록에 실패했습니다.' })
    }
  }

  async function applyActivityRegion(region: LocationRegion, nextPermissionState: LocationPermissionState) {
    setActivityRegion(region)
    storeLocationRegion(toNeighborhoodRegion(region))
    setPermissionState(nextPermissionState)
    setLocationError('')
    await saveMyLocationPreference({
      latitude: region.latitude,
      longitude: region.longitude,
      region1Depth: region.region1Depth,
      region2Depth: region.region2Depth,
      region3Depth: region.region3Depth,
      permissionStatus: nextPermissionState,
    }).catch(() => undefined)
  }

  async function requestCurrentLocationFromUser() {
    setLocationBusy(true)
    setLocationError('')
    try {
      const current = await requestBrowserLocation()
      const region = await reverseGeocode(current.latitude, current.longitude, 'gps', 'address')
      setPermissionState('granted')
      setLocationError('')
      await saveMyLocationPreference({
        latitude: region.latitude,
        longitude: region.longitude,
        region1Depth: region.region1Depth,
        region2Depth: region.region2Depth,
        region3Depth: region.region3Depth,
        permissionStatus: 'granted',
      }).catch(() => undefined)
      return region
    } catch (error) {
      const nextPermission = await getLocationPermissionState()
      setPermissionState(nextPermission)
      setLocationError(error instanceof Error ? error.message : '현재 위치를 가져오지 못했습니다.')
      await saveMyLocationPreference({ permissionStatus: nextPermission }).catch(() => undefined)
      return undefined
    } finally {
      setLocationBusy(false)
    }
  }

  function handleOfferCustomPriceChange(value: string) {
    const digits = value.replace(/[^0-9]/g, '')
    setErrors((current) => {
      if (!current.customPrice) return current
      const next = { ...current }
      delete next.customPrice
      return next
    })
    if (!digits) {
      setCustomPrice('')
      setPriceNotice('')
      return
    }
    const amount = Number(digits)
    if (amount > requestMaxPrice) {
      setCustomPrice(formatNumberInput(requestMaxPrice))
      setPriceNotice('최대 1만원')
      return
    }
    setCustomPrice(formatNumberInput(amount))
    setPriceNotice(amount < requestMinPrice ? '최소 1,000원' : '')
  }

  return (
    <section className="registration-flow-screen">
      <StepHeader title="해줄게요 등록" progress={`${Math.min(step, 3)}/3`} onBack={handleBack} />
      <div className="step-content">
        {step === 1 && (
          <>
            <StepPageTitle title="어떤 일을 해줄 수 있나요?" />
            <InlineTextField label="제목" value={title} onChange={setTitle} placeholder="제목을 짧게 적어주세요" maxLength={30} error={errors.title} />
            <SelectionRow
              label="카테고리"
              value={selectedCategoryLabel || (categoryId === 'etc' ? '기타 카테고리를 입력해주세요' : '카테고리를 선택해주세요')}
              icon={selectedCategory ? <CategoryIcon category={selectedCategory} /> : null}
              placeholder={!selectedCategoryLabel}
              error={errors.categoryId}
              onClick={() => setSheet('category')}
            />
            {selectedCategoryDetails.length > 0 && (
              <SelectionRow
                label="세부 카테고리"
                value={categoryDetail || '세부 카테고리를 선택해주세요'}
                placeholder={!categoryDetail}
                error={errors.categoryDetail}
                onClick={() => setSheet('categoryDetail')}
              />
            )}
            <InlineTextField
              label="금액"
              value={customPrice}
              onChange={handleOfferCustomPriceChange}
              placeholder="10,000원 이하"
              inputMode="numeric"
              suffix="원"
              error={errors.customPrice}
              errorInside
              inlineMessage={customPrice ? errors.customPrice || priceNotice : priceNotice}
            />
            <StepCard title="상세 설명">
              <TextAreaInput
                value={description}
                onChange={setDescription}
                placeholder="작업 방식과 제한 사항을 적어주세요"
                maxLength={500}
                compact
                error={errors.description}
              />
            </StepCard>
            <ImageUploader title="사진 첨부" optional images={postImages} onChange={setPostImages} />
          </>
        )}

        {step === 2 && (
          <>
            <StepPageTitle title="어떻게 진행할 수 있나요?" />
            <SelectionRow
              label="가능한 방식"
              value={mode ? getModeLabel(mode) : '가능한 방식을 선택해주세요'}
              icon={mode ? getModeIcon(mode) : null}
              placeholder={!mode}
              error={errors.mode}
              onClick={() => setSheet('offerMode')}
            />
            {isOffline && (
              <SelectionRow
                label="주소"
                hideLabel
                value={activityRegion ? activityRegion.addressText : '주소를 검색해주세요'}
                icon={<MapPin size={18} />}
                placeholder={!activityRegion}
                error={errors.activityRegion}
                onClick={() => setShowNeighborhoodSheet(true)}
              />
            )}
            {mode === 'online' && <InlineNotice icon={<Globe2 size={18} />} title="온라인으로 진행할 수 있어요" description="위치 정보는 노출하지 않습니다." />}
            <SelectionRow
              label="가능한 시간"
              value={availableTimeText || '가능한 시간을 선택해주세요'}
              icon={<CalendarClock size={18} />}
              placeholder={!availableTimeText}
              error={errors.availableTimeOption}
              onClick={() => setSheet('availableTime')}
            />
          </>
        )}

        {step === 3 && (
          <>
            <StepPageTitle title="신뢰 정보를 추가해보세요" subtitle="신뢰 정보를 추가하면 더 많은 요청을 받을 수 있어요." optional />
            <StepCard title="경력 한 줄">
              <TextInput value={careerSummary} onChange={setCareerSummary} placeholder="예: 디자인 2년차" maxLength={80} />
            </StepCard>
            <StepCard title="포트폴리오 링크" optional>
              {!showPortfolioForm && (
                <button className="dashed-action-button" type="button" onClick={() => setShowPortfolioForm(true)}>
                  <LinkIcon size={18} />
                  링크 추가
                </button>
              )}
              {showPortfolioForm && (
                <div className="stacked-fields">
                  <TextInput value={portfolioTitle} onChange={setPortfolioTitle} placeholder="링크 제목" />
                  <TextInput value={portfolioUrl} onChange={setPortfolioUrl} placeholder="https://..." error={errors.portfolioUrl} />
                </div>
              )}
            </StepCard>
            <ImageUploader title="작업 예시 이미지" optional maxCount={5} images={sampleImages} onChange={setSampleImages} />
            <StepCard title="성별 공개" optional>
              <OptionGrid value={genderVisibility} onChange={(value) => setGenderVisibility(value as GenderVisibility)} options={genderVisibilityOptions} columns={3} />
            </StepCard>
            <StepCard title="응답 가능 시간" optional>
              <OptionGrid value={responseTime} onChange={setResponseTime} options={responseTimeOptions.map((label) => ({ value: label, label }))} columns={2} />
            </StepCard>
          </>
        )}

        {step === 4 && (
          <>
            <StepPageTitle title="내용을 확인하고 등록할까요?" />
            <PreviewCard
              rows={[
                { label: '제목', value: title, onEdit: () => setStep(1) },
                {
                  label: '카테고리',
                  value: selectedCategoryLabel || '-',
                  icon: selectedCategory ? <CategoryIcon category={selectedCategory} /> : null,
                  onEdit: () => setStep(1),
                },
                { label: '세부 카테고리', value: categoryDetail || '-', onEdit: () => setStep(1) },
                { label: '가능한 방식', value: mode ? getModeLabel(mode) : '-', icon: mode ? getModeIcon(mode) : null, onEdit: () => setStep(2) },
                { label: '활동 지역', value: isOffline && activityRegion ? activityRegion.addressText : '온라인', icon: <MapPin size={18} />, onEdit: () => setStep(2) },
                { label: '가능한 시간', value: availableTimeText || '-', icon: <CalendarClock size={18} />, onEdit: () => setStep(2) },
                { label: '받을 금액', value: formatWon(price), accent: true, onEdit: () => setStep(1) },
                { label: '상세 설명', value: getFirstLine(description) || '-', onEdit: () => setStep(1) },
                { label: '경력', value: careerSummary || '미입력', onEdit: () => setStep(3) },
                { label: '포트폴리오 링크', value: portfolioLinks[0]?.url ?? '미입력', link: Boolean(portfolioLinks[0]?.url), onEdit: () => setStep(3) },
                { label: '성별 공개', value: getGenderVisibilityLabel(genderVisibility), onEdit: () => setStep(3) },
                { label: '응답 가능 시간', value: responseTime || '미입력', onEdit: () => setStep(3) },
              ]}
              description={description}
              images={postImages}
              imageSections={[
                { title: '사진', images: postImages },
                { title: '작업 예시', images: sampleImages },
              ]}
            />
          </>
        )}
      </div>

      <StepFooter
        secondaryLabel={step === 1 ? undefined : step === 3 ? '건너뛰기' : step === 4 ? '수정하기' : '이전'}
        primaryLabel={step === 4 ? (saveState === 'saving' ? '등록 중' : '해줄게요 등록하기') : '다음'}
        onSecondary={step === 3 ? () => setStep(4) : step === 4 ? () => setStep(1) : () => setStep((current) => (current - 1) as OfferStep)}
        onPrimary={step === 4 ? () => void submitPost() : goNext}
        primaryDisabled={saveState === 'saving'}
      />

      {errors.submit && <ToastMessage message={errors.submit} />}
      {sheet === 'category' && (
        <CategoryBottomSheet
          selectedId={categoryId}
          onClose={() => setSheet(null)}
          onSelect={(nextCategoryId) => {
            setCategoryId(nextCategoryId)
            setCustomCategory('')
            setCategoryDetail('')
            setSheet(nextCategoryId === 'etc' ? 'categoryCustom' : getCategoryDetailOptions(nextCategoryId).length > 0 ? 'categoryDetail' : null)
          }}
        />
      )}
      {sheet === 'categoryCustom' && (
        <CustomTextBottomSheet
          title="기타 카테고리 입력"
          value={customCategory}
          placeholder="예: 행사"
          onClose={() => setSheet(null)}
          onSave={(nextValue) => {
            setCustomCategory(nextValue)
            setSheet(getCategoryDetailOptions(categoryId).length > 0 ? 'categoryDetail' : null)
          }}
        />
      )}
      {sheet === 'categoryDetail' && (
        <CategoryDetailBottomSheet
          categoryId={categoryId}
          selectedValue={categoryDetail}
          onClose={() => setSheet(null)}
          onSelect={(nextCategoryDetail) => {
            if (nextCategoryDetail === customCategoryDetailOption) {
              setCategoryDetail('')
              setSheet('categoryDetailCustom')
              return
            }
            setCategoryDetail(nextCategoryDetail)
            setSheet(null)
          }}
        />
      )}
      {sheet === 'categoryDetailCustom' && (
        <CustomTextBottomSheet
          title="세부 카테고리 직접 입력"
          value={isCustomCategoryDetail(categoryId, categoryDetail) ? categoryDetail : ''}
          placeholder="예: 동행"
          maxLength={customCategoryDetailMaxLength}
          helperText={`${customCategoryDetailMaxLength}자 이내로 입력해주세요.`}
          onClose={() => setSheet(null)}
          onSave={(nextValue) => {
            setCategoryDetail(nextValue)
            setSheet(null)
          }}
        />
      )}
      {sheet === 'offerMode' && (
        <ModeBottomSheet
          title="가능한 방식을 선택해주세요"
          variant="offer"
          selectedMode={mode}
          onClose={() => setSheet(null)}
          onSelect={(nextMode) => {
            setMode(nextMode)
            setSheet(null)
            if (nextMode !== 'online' && !activityRegion) setShowNeighborhoodSheet(true)
          }}
        />
      )}
      {sheet === 'availableTime' && (
        <AvailableTimeBottomSheet
          selectedValue={availableTimeOption}
          onClose={() => setSheet(null)}
          onSelect={(nextValue) => {
            if (nextValue === 'custom') {
              setSheet('availableTimeCustom')
              return
            }
            setAvailableTimeOption(nextValue)
            setCustomAvailableTime('')
            setSheet(null)
          }}
        />
      )}
      {sheet === 'availableTimeCustom' && (
        <CustomTextOverlay
          title="가능한 시간 입력"
          value={availableTimeOption === 'custom' ? customAvailableTime : ''}
          placeholder="예: 언제든지 가능"
          maxLength={availableTimeMaxLength}
          helperText={`${availableTimeMaxLength}자 이내로 입력해주세요.`}
          onClose={() => setSheet(null)}
          onSave={(nextValue) => {
            setAvailableTimeOption('custom')
            setCustomAvailableTime(nextValue)
            setSheet(null)
          }}
        />
      )}
      {showNeighborhoodSheet && (
        <NeighborhoodSelectSheet
          searchMode="address"
          promptContext="offer"
          permissionState={permissionState}
          busy={locationBusy}
          error={locationError}
          onUseCurrent={requestCurrentLocationFromUser}
          onSelect={(region) => {
            void applyActivityRegion(region, permissionState === 'granted' ? 'granted' : 'prompt')
            setShowNeighborhoodSheet(false)
          }}
          onClose={() => setShowNeighborhoodSheet(false)}
        />
      )}
      {showPhoneVerification && (
        <PhoneVerificationOverlay
          onClose={() => setShowPhoneVerification(false)}
          onVerified={() => void submitPost()}
        />
      )}
      {showLeaveConfirm && <ConfirmLeaveDialog onCancel={() => setShowLeaveConfirm(false)} onConfirm={onExit} />}
    </section>
  )
}

function getDefaultActivityProfileId(profiles: ActivityProfile[]) {
  const activeProfiles = profiles.filter((profile) => profile.isActive !== false)
  return activeProfiles.find((profile) => profile.isDefault === true)?.id ?? activeProfiles[0]?.id ?? profiles[0]?.id ?? ''
}

function getProfileUnavailableMessage(loadState: 'loading' | 'ready' | 'error') {
  if (loadState === 'error') return '활동 프로필을 불러오지 못했습니다.'
  if (loadState === 'loading') return '활동 프로필을 확인하는 중입니다.'
  return '사용할 활동 프로필이 없습니다.'
}

function StepHeader({ title, progress, onBack }: { title: string; progress?: string; onBack: () => void }) {
  return (
    <header className="step-header">
      <button className="step-back-button" type="button" onClick={onBack} aria-label="뒤로가기">
        <ChevronRight size={27} />
      </button>
      <h1>{title}</h1>
      <span>{progress}</span>
    </header>
  )
}

function StepFooter({
  secondaryLabel,
  primaryLabel,
  onSecondary,
  onPrimary,
  primaryDisabled,
}: {
  secondaryLabel?: string
  primaryLabel: string
  onSecondary?: () => void
  onPrimary: () => void
  primaryDisabled?: boolean
}) {
  return (
    <div className={`step-footer ${secondaryLabel ? 'has-secondary' : ''}`}>
      {secondaryLabel && (
        <button className="step-footer-button is-secondary" type="button" onClick={onSecondary}>
          {secondaryLabel}
        </button>
      )}
      <button className="step-footer-button is-primary" type="button" onClick={onPrimary} disabled={primaryDisabled}>
        {primaryLabel}
      </button>
    </div>
  )
}

function StepPageTitle({ title, subtitle, optional = false }: { title: string; subtitle?: string; optional?: boolean }) {
  return (
    <div className="step-page-title">
      <h2>{title}</h2>
      {optional && <span>(선택)</span>}
      {subtitle && <p>{subtitle}</p>}
    </div>
  )
}

function StepCard({
  title,
  children,
  optional,
  optionalLabel,
}: {
  title: string
  children: ReactNode
  optional?: boolean
  optionalLabel?: string
}) {
  return (
    <section className="step-card">
      <div className="step-card-title">
        <h3>{title}</h3>
        {(optional || optionalLabel) && <span>{optionalLabel ?? '선택'}</span>}
      </div>
      {children}
    </section>
  )
}

function TextInput({
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

function InlineTextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  inputMode,
  suffix,
  error,
  errorInside = false,
  inlineMessage,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  maxLength?: number
  inputMode?: 'numeric'
  suffix?: string
  error?: string
  errorInside?: boolean
  inlineMessage?: string
}) {
  const visibleError = error === requiredFieldMessage && value.trim() ? undefined : error
  return (
    <div className={`step-inline-field-wrap ${visibleError && !errorInside ? 'has-error' : ''}`}>
      <label className={`step-inline-field ${visibleError ? 'has-error' : ''} ${errorInside ? 'has-inside-error' : ''} ${inlineMessage ? 'has-inline-message' : ''}`}>
        <strong>{label}</strong>
        <span className="step-inline-value">
          <span className="step-inline-input-row">
            <input
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={errorInside && visibleError ? visibleError : placeholder}
              maxLength={maxLength}
              inputMode={inputMode}
            />
            {suffix && <em>{suffix}</em>}
          </span>
          {inlineMessage && <small className="step-inline-field-inline-message">{inlineMessage}</small>}
        </span>
      </label>
      {visibleError && !errorInside && <p className="field-error">{visibleError}</p>}
    </div>
  )
}

function TextAreaInput({
  value,
  onChange,
  placeholder,
  maxLength,
  compact,
  error,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  maxLength?: number
  compact?: boolean
  error?: string
}) {
  const visibleError = error === requiredFieldMessage && value.trim() ? undefined : error
  return (
    <label className={`step-textarea-wrap ${compact ? 'is-compact' : ''} ${visibleError ? 'has-error' : ''}`}>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} />
      <span className="input-meta-row">
        {visibleError ? <small>{visibleError}</small> : <small />}
        {maxLength && <small>{value.length}/{maxLength}</small>}
      </span>
    </label>
  )
}

function SelectionRow({
  label,
  value,
  icon,
  placeholder,
  error,
  hideLabel = false,
  onClick,
}: {
  label: string
  value: string
  icon?: ReactNode | null
  placeholder?: boolean
  error?: string
  hideLabel?: boolean
  onClick: () => void
}) {
  const visibleError = error === requiredFieldMessage && !placeholder ? undefined : error
  return (
    <div className="selection-field">
      <button
        className={`selection-row ${hideLabel ? 'is-label-hidden' : ''} ${placeholder ? 'is-placeholder' : ''} ${visibleError ? 'has-error' : ''}`}
        type="button"
        onClick={onClick}
        aria-label={hideLabel ? `${label} ${value}` : undefined}
      >
        {!hideLabel && <strong>{label}</strong>}
        {icon && <span className="selection-icon">{icon}</span>}
          <span className={isFastDeadlineText(value) ? 'hot-deadline-text' : undefined}>{value}</span>
        <ChevronRight size={18} />
      </button>
      {visibleError && <p className="field-error">{visibleError}</p>}
    </div>
  )
}

function OptionGrid<T extends string>({
  value,
  onChange,
  options,
  columns = 2,
}: {
  value: T | string
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

function InlineNotice({ icon, title, description, compact = false }: { icon: ReactNode; title: string; description: string; compact?: boolean }) {
  return (
    <div className={`inline-notice ${compact ? 'is-compact' : ''}`}>
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

function CategoryBottomSheet({
  selectedId,
  onSelect,
  onClose,
}: {
  selectedId: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  return (
    <BottomSheet title="카테고리를 선택해주세요" onClose={onClose}>
      <div className="category-sheet-grid">
        {postCategories.map((category) => (
          <button
            key={category.id}
            className={selectedId === category.id ? 'is-selected' : ''}
            type="button"
            onClick={() => onSelect(category.id)}
          >
            <CategoryIcon category={category} />
            <span>{category.label}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}

function CategoryDetailBottomSheet({
  categoryId,
  selectedValue,
  onSelect,
  onClose,
}: {
  categoryId: string
  selectedValue: string
  onSelect: (value: string) => void
  onClose: () => void
}) {
  const options = getCategoryDetailOptions(categoryId)
  return (
    <BottomSheet title="세부 카테고리를 선택해주세요" onClose={onClose}>
      <div className="mode-sheet-list compact">
        {options.map((option) => {
          const selected = selectedValue === option || (option === customCategoryDetailOption && isCustomCategoryDetail(categoryId, selectedValue))
          return (
            <button className={selected ? 'is-selected' : ''} key={option} type="button" onClick={() => onSelect(option)}>
              <span>
                <CheckCircle2 size={22} />
              </span>
              <strong>{option}</strong>
              <i>{selected && <Check size={16} />}</i>
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}

function CustomTextBottomSheet({
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
    <BottomSheet title={title} onClose={onClose}>
      <div className="custom-category-input">
        <TextInput value={draft} onChange={setDraft} placeholder={placeholder} maxLength={maxLength} error={!trimmed ? requiredFieldMessage : undefined} />
        <p>{helperText}</p>
        <button className="address-modal-confirm" type="button" disabled={!trimmed} onClick={() => onSave(trimmed)}>
          확인
        </button>
      </div>
    </BottomSheet>
  )
}

function ModeBottomSheet({
  title,
  variant,
  selectedMode,
  onSelect,
  onClose,
}: {
  title: string
  variant: 'request' | 'offer'
  selectedMode: RequestMode | null
  onSelect: (mode: RequestMode) => void
  onClose: () => void
}) {
  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="mode-sheet-list">
        {modeOptions.map((option) => {
          const Icon = option.icon
          const selected = selectedMode === option.value
          return (
            <button className={selected ? 'is-selected' : ''} key={option.value} type="button" onClick={() => onSelect(option.value)}>
              <span>
                <Icon size={22} />
              </span>
              <strong>{option.label}</strong>
              <em>{variant === 'request' ? option.requestDescription : option.offerDescription}</em>
              <i>{selected && <Check size={16} />}</i>
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}

function AvailableTimeBottomSheet({
  selectedValue,
  onSelect,
  onClose,
}: {
  selectedValue: AvailableTimeOption | null
  onSelect: (value: AvailableTimeOption) => void
  onClose: () => void
}) {
  return (
    <CenterOverlay title="가능한 시간을 선택해주세요" onClose={onClose}>
      <div className="overlay-option-list">
        {availableTimeOptions.map((option) => (
          <button className={selectedValue === option.value ? 'is-selected' : ''} key={option.value} type="button" onClick={() => onSelect(option.value)}>
            <span>
              <Clock3 size={22} />
            </span>
            <strong>{option.label}</strong>
            <i>{selectedValue === option.value && <Check size={16} />}</i>
          </button>
        ))}
      </div>
    </CenterOverlay>
  )
}

function CustomTextOverlay({
  title,
  value,
  placeholder,
  maxLength,
  helperText,
  onSave,
  onClose,
}: {
  title: string
  value: string
  placeholder: string
  maxLength: number
  helperText: string
  onSave: (value: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(value)
  const trimmed = draft.trim()

  return (
    <CenterOverlay title={title} onClose={onClose}>
      <div className="custom-category-input">
        <TextInput value={draft} onChange={setDraft} placeholder={placeholder} maxLength={maxLength} error={!trimmed ? requiredFieldMessage : undefined} />
        <p>{helperText}</p>
        <button className="address-modal-confirm" type="button" disabled={!trimmed} onClick={() => onSave(trimmed)}>
          확인
        </button>
      </div>
    </CenterOverlay>
  )
}

function RequestDeadlineOverlay({
  title,
  selectedOption,
  selectedDate,
  onSelectAsap,
  onSelectDate,
  onClose,
}: {
  title: string
  selectedOption: DeadlineOption
  selectedDate: string
  onSelectAsap: () => void
  onSelectDate: (date: string) => void
  onClose: () => void
}) {
  const selectedDateValue = parseDateInput(selectedDate)
  const [showCalendar, setShowCalendar] = useState(false)
  const [viewDate, setViewDate] = useState(selectedDateValue ?? new Date())
  const monthLabel = `${viewDate.getFullYear()}년 ${viewDate.getMonth() + 1}월`
  const canGoPrev = getMonthKey(viewDate) > getMonthKey(new Date())
  const days = getCalendarDays(viewDate)

  return (
    <CenterOverlay title={title} onClose={onClose}>
      <div className={`deadline-option-row ${showCalendar ? 'is-collapsed' : ''}`} aria-hidden={showCalendar}>
        <button
          className={`deadline-fast-option ${selectedOption === 'asap' ? 'is-selected' : ''}`}
          type="button"
          onClick={onSelectAsap}
        >
          <span className="hot-deadline-text">가능한 빠르게</span>
        </button>
        <button className={showCalendar ? 'is-selected' : ''} type="button" onClick={() => setShowCalendar(true)}>
          직접 선택
        </button>
      </div>
      {showCalendar && (
        <div className="request-calendar is-visible">
          <div className="request-calendar-head">
            <button
              type="button"
              aria-label="이전 달"
              disabled={!canGoPrev}
              onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            >
              <ChevronLeft size={18} />
            </button>
            <strong>{monthLabel}</strong>
            <button
              type="button"
              aria-label="다음 달"
              onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="request-calendar-weekdays">
            {calendarWeekdays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="request-calendar-grid">
            {days.map((day) => {
              const selected = selectedDate === day.dateString
              return (
                <button
                  key={day.dateString}
                  className={`${day.inMonth ? '' : 'is-muted'} ${selected ? 'is-selected' : ''}`}
                  type="button"
                  disabled={day.disabled}
                  onClick={() => onSelectDate(day.dateString)}
                >
                  {day.date.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </CenterOverlay>
  )
}

function CenterOverlay({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="selection-overlay" role="presentation" onClick={onClose}>
      <div className="selection-overlay-card" role="dialog" aria-modal="true" aria-labelledby="selection-overlay-title" onClick={(event) => event.stopPropagation()}>
        <button className="sheet-x" type="button" onClick={onClose} aria-label="닫기">
          <X size={22} />
        </button>
        <h2 id="selection-overlay-title">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function BottomSheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <div className="registration-bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="registration-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="registration-bottom-sheet-header">
          <div className="drag-handle" />
          <button className="sheet-x" type="button" onClick={onClose} aria-label="닫기">
            <X size={22} />
          </button>
          <h2 id="registration-sheet-title">{title}</h2>
        </div>
        <div className="registration-bottom-sheet-content">{children}</div>
      </div>
    </div>
  )
}

function PreviewCard({
  rows,
  description,
  images,
  imageTitle = '사진',
  imageSections,
}: {
  rows: Array<{
    label: string
    value: string
    icon?: ReactNode | null
    accent?: boolean
    link?: boolean
    onEdit?: () => void
  }>
  description: string
  images: ImageRecord[]
  imageTitle?: string
  imageSections?: Array<{ title: string; images: ImageRecord[] }>
}) {
  const sections = imageSections ?? [{ title: imageTitle, images }]

  return (
    <div className="registration-preview">
      <div className="preview-row-list">
        {rows.map((row) => {
          const valueClassName = [
            row.accent ? 'is-accent' : '',
            row.link ? 'is-link' : '',
            isFastDeadlineText(row.value) ? 'hot-deadline-text' : '',
          ].filter(Boolean).join(' ')
          const content = (
            <>
              <strong>{row.label}</strong>
              <span className={valueClassName || undefined}>
                {row.icon}
                {row.value}
              </span>
            </>
          )

          return row.onEdit ? (
            <button className="preview-row" type="button" key={row.label} onClick={row.onEdit}>
              {content}
            </button>
          ) : (
            <div className="preview-row" key={row.label}>
              {content}
            </div>
          )
        })}
      </div>
      <section className="preview-section">
        <h3>상세 설명</h3>
        <p>{description}</p>
      </section>
      {sections.map((section) => (
        <section className="preview-section" key={section.title}>
          <h3>{section.title}</h3>
          {section.images.length > 0 ? (
            <div className="preview-image-list">
              {section.images.map((image, index) => (
                <span className="image-thumb" key={`${image.storageKey}-${index}`} style={{ backgroundImage: `url("${getImagePreviewUrl(image)}")` }} />
              ))}
            </div>
          ) : (
            <p className="empty-preview-text">첨부한 이미지가 없어요.</p>
          )}
        </section>
      ))}
    </div>
  )
}

function ConfirmLeaveDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-overlay" role="presentation">
      <div className="confirm-dialog" role="dialog" aria-modal="true">
        <h2>작성 중인 내용이 사라질 수 있어요</h2>
        <p>등록 플로우를 나가시겠어요?</p>
        <div>
          <button type="button" onClick={onCancel}>
            계속 작성
          </button>
          <button type="button" onClick={onConfirm}>
            나가기
          </button>
        </div>
      </div>
    </div>
  )
}

function ToastMessage({ message }: { message: string }) {
  return <p className="registration-toast">{message}</p>
}

function CategoryIcon({ category }: { category: Category }) {
  return <Image src={category.iconSrc} width={36} height={36} alt="" aria-hidden="true" />
}

function getCategory(categoryId: string) {
  return postCategories.find((category) => category.id === categoryId) ?? null
}

function getCategoryDetailOptions(categoryId: string) {
  return categoryDetailOptions[categoryId] ?? []
}

function getSelectedCategoryLabel(categoryId: string, customCategory: string) {
  if (!categoryId) return ''
  if (categoryId === 'etc') return customCategory.trim()
  return getCategoryLabel(categoryId)
}

function isCustomCategoryDetail(categoryId: string, value: string) {
  const trimmed = value.trim()
  return Boolean(trimmed && !getCategoryDetailOptions(categoryId).includes(trimmed))
}

function getCustomTextError(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) return requiredFieldMessage
  if (trimmed.length >= 10) return `${label}는 10자 미만으로 입력해주세요.`
  return ''
}

function getCustomCategoryDetailError(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return requiredFieldMessage
  if (trimmed.length > customCategoryDetailMaxLength) return `세부 카테고리는 ${customCategoryDetailMaxLength}자 이내로 입력해주세요.`
  return ''
}

function getModeLabel(mode: RequestMode) {
  return modeOptions.find((option) => option.value === mode)?.label ?? ''
}

function getModeIcon(mode: RequestMode) {
  const Icon = modeOptions.find((option) => option.value === mode)?.icon ?? MapPin
  return <Icon size={18} />
}

function getPriceValue(option: PriceOption, customPrice: string) {
  if (option === 'custom') return Number(customPrice.replace(/[^0-9]/g, ''))
  return Number(option)
}

function formatWon(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0원'
  return `${value.toLocaleString('ko-KR')}원`
}

function formatNumberInput(value: number) {
  if (!Number.isFinite(value) || value <= 0) return ''
  return String(Math.floor(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function getDeadlineIso(option: DeadlineOption, customDate: string) {
  if (option === 'asap') return null
  const date = parseDateInput(customDate)
  if (!date) return null
  date.setHours(23, 59, 59, 999)
  return date.toISOString()
}

function getRequestDeadlineText(option: DeadlineOption, customText: string) {
  if (option === 'asap') return '가능한 빠르게'
  if (option === 'custom') return customText ? `${formatCalendarDateLabel(customText)}까지` : ''
  return deadlineOptions.find((item) => item.value === option)?.label ?? ''
}

function getCalendarDays(viewDate: Date) {
  const todayString = formatDateInput(new Date())
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const start = new Date(firstDay)
  start.setDate(1 - firstDay.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const dateString = formatDateInput(date)
    return {
      date,
      dateString,
      inMonth: date.getMonth() === viewDate.getMonth(),
      disabled: dateString < todayString,
    }
  })
}

function getMonthKey(date: Date) {
  return date.getFullYear() * 12 + date.getMonth()
}

function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatCalendarDateLabel(value: string) {
  const date = parseDateInput(value)
  if (!date) return ''
  const today = formatDateInput(new Date())
  const tomorrowDate = new Date()
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const dateString = formatDateInput(date)
  if (dateString === today) return '오늘'
  if (dateString === formatDateInput(tomorrowDate)) return '내일'
  return `${date.getMonth() + 1}. ${date.getDate()}.`
}

function getAvailableTimeText(option: AvailableTimeOption | null, customText: string) {
  if (!option) return ''
  if (option === 'custom') return customText.trim()
  return availableTimeOptions.find((item) => item.value === option)?.label ?? ''
}

function isFastDeadlineText(value: string) {
  return value.trim() === '가능한 빠르게'
}

function getGenderVisibilityLabel(value: GenderVisibility) {
  return genderVisibilityOptions.find((item) => item.value === value)?.label ?? '공개 안 함'
}

function getFirstLine(value: string) {
  return value.trim().split('\n').find(Boolean) ?? ''
}

function nullableText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getPortfolioLinks(title: string, url: string): PortfolioLink[] {
  const trimmedUrl = url.trim()
  if (!trimmedUrl) return []
  return [{ title: title.trim() || '포트폴리오', url: trimmedUrl }]
}

function isValidUrl(value: string) {
  if (!value.trim()) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function hasRequestInput(input: {
  title: string
  categoryId: string
  customCategory: string
  categoryDetail: string
  description: string
  images: ImageRecord[]
  mode: RequestMode | null
  customPrice: string
  customDeadlineText: string
}) {
  return Boolean(
    input.title.trim() ||
      input.categoryId ||
      input.customCategory.trim() ||
      input.categoryDetail ||
      input.description.trim() ||
      input.images.length > 0 ||
      input.mode ||
      input.customPrice.trim() ||
      input.customDeadlineText.trim(),
  )
}

function hasOfferInput(input: {
  title: string
  categoryId: string
  customCategory: string
  categoryDetail: string
  mode: RequestMode | null
  customAvailableTime: string
  customPrice: string
  description: string
  careerSummary: string
  portfolioUrl: string
  postImages: ImageRecord[]
  sampleImages: ImageRecord[]
  responseTime: string
}) {
  return Boolean(
    input.title.trim() ||
      input.categoryId ||
      input.customCategory.trim() ||
      input.categoryDetail ||
      input.mode ||
      input.customAvailableTime.trim() ||
      input.customPrice.trim() ||
      input.description.trim() ||
      input.careerSummary.trim() ||
      input.portfolioUrl.trim() ||
      input.postImages.length > 0 ||
      input.sampleImages.length > 0 ||
      input.responseTime,
  )
}

function validateRequestStep(
  step: RequestStep,
  input: {
    title: string
    categoryId: string
    customCategory: string
    categoryDetail: string
    description: string
    mode: RequestMode | null
    locationRegion: LocationRegion | null
    priceOption: PriceOption
    customPrice: string
    deadlineOption: DeadlineOption
    customDeadlineText: string
    selectedProfileId: string
  },
) {
  const errors: StepErrors = {}
  if (step === 1) {
    if (!input.title.trim()) errors.title = requiredFieldMessage
    if (!input.categoryId) errors.categoryId = requiredFieldMessage
    else if (input.categoryId === 'etc') {
      const categoryError = getCustomTextError(input.customCategory, '카테고리')
      if (categoryError) errors.categoryId = categoryError
    }
    if (input.categoryId && getCategoryDetailOptions(input.categoryId).length > 0) {
      if (!input.categoryDetail) errors.categoryDetail = requiredFieldMessage
      else if (input.categoryDetail === customCategoryDetailOption) errors.categoryDetail = requiredFieldMessage
      else if (isCustomCategoryDetail(input.categoryId, input.categoryDetail)) {
        const detailError = getCustomCategoryDetailError(input.categoryDetail)
        if (detailError) errors.categoryDetail = detailError
      }
    }
    if (!input.description.trim()) errors.description = requiredFieldMessage
  }
  if (step === 2) {
    if (!input.mode) errors.mode = requiredFieldMessage
    if ((input.mode === 'nearby' || input.mode === 'both') && !input.locationRegion) errors.locationRegion = requiredFieldMessage
  }
  if (step === 3) {
    const price = getPriceValue(input.priceOption, input.customPrice)
    if (price <= 0) errors.customPrice = '금액을 입력해주세요.'
    else if (price < requestMinPrice) errors.customPrice = '최소 1,000원'
    else if (price > requestMaxPrice) errors.customPrice = '최대 1만원'
    if (input.deadlineOption === 'custom') {
      const selectedDate = parseDateInput(input.customDeadlineText)
      if (!selectedDate) errors.customDeadlineText = requiredFieldMessage
      else if (formatDateInput(selectedDate) < formatDateInput(new Date())) errors.customDeadlineText = '오늘 포함 미래 날짜만 선택할 수 있어요.'
    }
  }
  return errors
}

function validateRequestAll(input: Parameters<typeof validateRequestStep>[1]) {
  for (const step of [1, 2, 3] as RequestStep[]) {
    const errors = validateRequestStep(step, input)
    if (Object.keys(errors).length > 0) return { step, errors }
  }
  return { step: null, errors: {} }
}

function validateOfferStep(
  step: OfferStep,
  input: {
    title: string
    categoryId: string
    customCategory: string
    categoryDetail: string
    mode: RequestMode | null
    activityRegion: LocationRegion | null
    availableTimeOption: AvailableTimeOption | null
    customAvailableTime: string
    priceOption: PriceOption
    customPrice: string
    description: string
    portfolioUrl: string
    selectedProfileId: string
  },
) {
  const errors: StepErrors = {}
  if (step === 1) {
    if (!input.title.trim()) errors.title = requiredFieldMessage
    if (!input.categoryId) errors.categoryId = requiredFieldMessage
    else if (input.categoryId === 'etc') {
      const categoryError = getCustomTextError(input.customCategory, '카테고리')
      if (categoryError) errors.categoryId = categoryError
    }
    if (input.categoryId && getCategoryDetailOptions(input.categoryId).length > 0) {
      if (!input.categoryDetail) errors.categoryDetail = requiredFieldMessage
      else if (input.categoryDetail === customCategoryDetailOption) errors.categoryDetail = requiredFieldMessage
      else if (isCustomCategoryDetail(input.categoryId, input.categoryDetail)) {
        const detailError = getCustomCategoryDetailError(input.categoryDetail)
        if (detailError) errors.categoryDetail = detailError
      }
    }
    const price = getPriceValue(input.priceOption, input.customPrice)
    if (price <= 0) errors.customPrice = '금액을 입력해주세요.'
    else if (price < requestMinPrice) errors.customPrice = '최소 1,000원'
    else if (price > requestMaxPrice) errors.customPrice = '최대 1만원'
    if (!input.description.trim()) errors.description = requiredFieldMessage
  }
  if (step === 2) {
    if (!input.mode) errors.mode = requiredFieldMessage
    if ((input.mode === 'nearby' || input.mode === 'both') && !input.activityRegion) errors.activityRegion = requiredFieldMessage
    if (!input.availableTimeOption) errors.availableTimeOption = requiredFieldMessage
    if (input.availableTimeOption === 'custom' && !input.customAvailableTime.trim()) {
      errors.availableTimeOption = requiredFieldMessage
      errors.customAvailableTime = requiredFieldMessage
    } else if (input.availableTimeOption === 'custom' && input.customAvailableTime.trim().length > availableTimeMaxLength) {
      errors.availableTimeOption = `가능한 시간은 ${availableTimeMaxLength}자 이내로 입력해주세요.`
      errors.customAvailableTime = `가능한 시간은 ${availableTimeMaxLength}자 이내로 입력해주세요.`
    }
  }
  if (step === 3 && !isValidUrl(input.portfolioUrl)) {
    errors.portfolioUrl = 'http 또는 https 링크를 입력해주세요.'
  }
  return errors
}

function validateOfferAll(input: Parameters<typeof validateOfferStep>[1]) {
  for (const step of [1, 2, 3] as OfferStep[]) {
    const errors = validateOfferStep(step, input)
    if (Object.keys(errors).length > 0) return { step, errors }
  }
  return { step: null, errors: {} }
}

function stringFromProfile(profile: Record<string, unknown>, key: string) {
  const value = profile[key]
  return typeof value === 'string' ? value : ''
}

function portfolioLinksFromProfile(profile: Record<string, unknown>): PortfolioLink[] {
  const value = profile.trustPortfolioLinks
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const link = item as Record<string, unknown>
        if (typeof link.url !== 'string') return null
        return {
          title: typeof link.title === 'string' ? link.title : '포트폴리오',
          url: link.url,
        }
      })
      .filter((item): item is PortfolioLink => item !== null)
  }

  const fallbackUrl = stringFromProfile(profile, 'trustPortfolioUrl')
  return fallbackUrl ? [{ title: '포트폴리오', url: fallbackUrl }] : []
}

function trustImagesFromProfile(profile: Record<string, unknown>) {
  const value = Array.isArray(profile.trustWorkSampleImages) ? profile.trustWorkSampleImages : profile.trustExampleImages
  if (!Array.isArray(value)) return []

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const image = item as Record<string, unknown>
      if (typeof image.imageUrl !== 'string' || typeof image.storageKey !== 'string') return null

      return {
        imageUrl: image.imageUrl,
        storageKey: image.storageKey,
        sortOrder: typeof image.sortOrder === 'number' ? image.sortOrder : index,
      }
    })
    .filter((item): item is ImageRecord => item !== null)
}
