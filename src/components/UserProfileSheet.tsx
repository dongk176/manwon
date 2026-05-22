'use client'

import { ShieldCheck, Star, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Illustration'
import type { UserProfile } from '@/data/mockData'

export function UserProfileSheet({ user, onClose }: { user: UserProfile; onClose: () => void }) {
  const genderLabel = profileGenderLabel(user.gender)
  const intro = user.intro?.trim() || '아직 소개가 없습니다.'
  const careerSummary = user.careerSummary?.trim() ?? ''
  const careerDescription = user.careerDescription?.trim() ?? ''
  const portfolioLinks = normalizeProfileLinks(user.portfolioLinks)
  const workSampleImages = normalizeProfileImages(user.workSampleImages)
  const hasVerification = Boolean(user.phoneVerified || user.identityVerified || user.verified)
  const hasProfileDetails = Boolean(careerSummary || careerDescription || portfolioLinks.length > 0 || workSampleImages.length > 0 || user.responseTime || hasVerification)

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
                    <a key={`${image.imageUrl}-${index}`} href={image.imageUrl} target="_blank" rel="noreferrer" aria-label={`사진 ${index + 1} 크게 보기`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- Runtime profile sample URLs may be external; thumbnails need object-fit cropping. */}
                      <img src={image.imageUrl} alt="" aria-hidden="true" />
                    </a>
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
    </div>
  )
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
