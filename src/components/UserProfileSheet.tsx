'use client'

import { type TouchEvent as ReactTouchEvent, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ShieldCheck, Star, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Illustration'
import type { UserProfile } from '@/data/mockData'

export function UserProfileSheet({ user, onClose }: { user: UserProfile; onClose: () => void }) {
  const [photoViewerIndex, setPhotoViewerIndex] = useState<number | null>(null)
  const genderLabel = profileGenderLabel(user.gender)
  const intro = user.intro?.trim() || '아직 소개가 없습니다.'
  const careerSummary = user.careerSummary?.trim() ?? ''
  const careerDescription = user.careerDescription?.trim() ?? ''
  const portfolioLinks = normalizeProfileLinks(user.portfolioLinks)
  const workSampleImages = normalizeProfileImages(user.workSampleImages)
  const hasVerification = Boolean(user.phoneVerified || user.identityVerified || user.verified)
  const hasProfileDetails = Boolean(careerSummary || careerDescription || portfolioLinks.length > 0 || workSampleImages.length > 0 || user.responseTime || hasVerification)

  useEffect(() => {
    if (photoViewerIndex === null) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPhotoViewerIndex(null)
      } else if (event.key === 'ArrowLeft') {
        setPhotoViewerIndex((current) => previousPhotoIndex(current, workSampleImages.length))
      } else if (event.key === 'ArrowRight') {
        setPhotoViewerIndex((current) => nextPhotoIndex(current, workSampleImages.length))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [photoViewerIndex, workSampleImages.length])

  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <div className="profile-sheet" role="dialog" aria-modal="true" aria-labelledby="user-profile-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="drag-handle" />
        <button className="sheet-x" type="button" onClick={onClose} aria-label="닫기">
          <X size={18} />
        </button>
        <div className="profile-sheet-head">
          <Avatar user={user} size="lg" online />
          <div>
            <div className="profile-sheet-name-row">
              <h2 id="user-profile-sheet-title">{user.name}</h2>
              {genderLabel && <span className="profile-gender-badge">{genderLabel}</span>}
            </div>
            <p>{intro}</p>
          </div>
        </div>
        <div className="profile-sheet-stats">
          <span>
            <Star size={16} fill="currentColor" />
            {formatRating(user.rating)}
            <small>후기 {typeof user.reviewCount === 'number' ? user.reviewCount : 0}개</small>
          </span>
          <span>
            <ShieldCheck size={16} />
            거래 완료 {user.completedCount}회
          </span>
        </div>
        {hasProfileDetails && (
          <div className="profile-sheet-details">
            {careerSummary && (
              <section className="profile-sheet-detail">
                <strong>경력 한 줄</strong>
                <p>{careerSummary}</p>
              </section>
            )}
            {careerDescription && (
              <section className="profile-sheet-detail">
                <strong>상세 소개</strong>
                <p>{careerDescription}</p>
              </section>
            )}
            {portfolioLinks.length > 0 && (
              <section className="profile-sheet-detail">
                <strong>링크</strong>
                <div className="profile-sheet-links">
                  {portfolioLinks.map((link, index) => (
                    <a key={`${link.url}-${index}`} href={link.url} target="_blank" rel="noreferrer">
                      <span>{link.title || getLinkDisplayName(link.url)}:</span>
                      <em>{link.url}</em>
                    </a>
                  ))}
                </div>
              </section>
            )}
            {workSampleImages.length > 0 && (
              <section className="profile-sheet-detail">
                <strong>사진</strong>
                <div className="profile-sheet-photo-grid">
                  {workSampleImages.map((image, index) => (
                    <button key={`${image.imageUrl}-${index}`} type="button" onClick={() => setPhotoViewerIndex(index)} aria-label={`사진 ${index + 1} 크게 보기`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- Runtime profile sample URLs may be external; thumbnails need object-fit cropping. */}
                      <img src={image.imageUrl} alt="" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>
            )}
            {user.responseTime && (
              <section className="profile-sheet-note">
                <strong>응답</strong>
                <span>{user.responseTime}</span>
              </section>
            )}
            {hasVerification && (
              <div className="profile-sheet-badges" aria-label="인증 정보">
                {user.phoneVerified && <span>휴대폰 인증</span>}
                {user.identityVerified && <span>본인 인증</span>}
                {!user.phoneVerified && !user.identityVerified && user.verified && <span>인증 완료</span>}
              </div>
            )}
          </div>
        )}
      </div>
      {photoViewerIndex !== null && (
        <ProfilePhotoViewer
          images={workSampleImages}
          index={photoViewerIndex}
          onClose={() => setPhotoViewerIndex(null)}
          onIndexChange={setPhotoViewerIndex}
        />
      )}
    </div>
  )
}

function ProfilePhotoViewer({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: Array<{ imageUrl: string; storageKey?: string; sortOrder?: number }>
  index: number
  onClose: () => void
  onIndexChange: (index: number) => void
}) {
  const touchStartXRef = useRef<number | null>(null)
  const currentIndex = Math.min(Math.max(index, 0), Math.max(images.length - 1, 0))
  const currentImage = images[currentIndex]
  const hasMultipleImages = images.length > 1

  if (!currentImage) return null

  function showPreviousPhoto() {
    onIndexChange(previousPhotoIndex(currentIndex, images.length))
  }

  function showNextPhoto() {
    onIndexChange(nextPhotoIndex(currentIndex, images.length))
  }

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    touchStartXRef.current = event.touches[0]?.clientX ?? null
  }

  function handleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    if (!hasMultipleImages || touchStartXRef.current === null) return
    const endX = event.changedTouches[0]?.clientX
    if (typeof endX !== 'number') return

    const deltaX = endX - touchStartXRef.current
    touchStartXRef.current = null
    if (Math.abs(deltaX) < 42) return
    if (deltaX > 0) {
      showPreviousPhoto()
    } else {
      showNextPhoto()
    }
  }

  return (
    <div
      className="profile-photo-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="프로필 사진 크게 보기"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
    >
      <div className="profile-photo-viewer-toolbar" onClick={(event) => event.stopPropagation()}>
        <span>{images.length > 1 ? `${currentIndex + 1} / ${images.length}` : '사진'}</span>
        <button type="button" onClick={onClose} aria-label="사진 닫기">
          <X size={22} />
        </button>
      </div>
      <div className="profile-photo-viewer-stage" onClick={(event) => event.stopPropagation()} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <button
          className="profile-photo-viewer-nav"
          type="button"
          onClick={showPreviousPhoto}
          disabled={!hasMultipleImages}
          aria-label="이전 사진"
        >
          <ChevronLeft size={28} />
        </button>
        <div className="profile-photo-viewer-image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element -- Runtime profile sample URLs may be external; full-size viewer needs native image sizing. */}
          <img src={currentImage.imageUrl} alt={`프로필 사진 ${currentIndex + 1}`} />
        </div>
        <button
          className="profile-photo-viewer-nav"
          type="button"
          onClick={showNextPhoto}
          disabled={!hasMultipleImages}
          aria-label="다음 사진"
        >
          <ChevronRight size={28} />
        </button>
      </div>
      {hasMultipleImages && (
        <div className="profile-photo-viewer-dots" onClick={(event) => event.stopPropagation()} aria-label="사진 선택">
          {images.map((image, nextIndex) => (
            <button
              key={`${image.imageUrl}-${nextIndex}`}
              className={nextIndex === currentIndex ? 'is-active' : ''}
              type="button"
              onClick={() => onIndexChange(nextIndex)}
              aria-label={`${nextIndex + 1}번째 사진 보기`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function previousPhotoIndex(current: number | null, length: number) {
  if (length <= 0) return 0
  const index = current ?? 0
  return (index - 1 + length) % length
}

function nextPhotoIndex(current: number | null, length: number) {
  if (length <= 0) return 0
  const index = current ?? 0
  return (index + 1) % length
}

function normalizeProfileLinks(value: unknown): Array<{ title: string; url: string }> {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const url = typeof item.url === 'string' ? item.url.trim() : ''
    if (!isHttpUrl(url)) return []
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    return [{ title, url }]
  })
}

function normalizeProfileImages(value: unknown): Array<{ imageUrl: string; storageKey?: string; sortOrder?: number }> {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const imageUrl = typeof item.imageUrl === 'string' ? item.imageUrl.trim() : ''
    if (!imageUrl || (!isHttpUrl(imageUrl) && !imageUrl.startsWith('/'))) return []
    const storageKey = typeof item.storageKey === 'string' ? item.storageKey : undefined
    const sortOrder = typeof item.sortOrder === 'number' ? item.sortOrder : undefined
    return [{ imageUrl, storageKey, sortOrder }]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function getLinkDisplayName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function profileGenderLabel(value?: UserProfile['gender']) {
  if (value === 'male') return '남성'
  if (value === 'female') return '여성'
  return null
}

function formatRating(value: number) {
  return Number.isFinite(value) && value > 0 ? value.toFixed(1) : '신규'
}
