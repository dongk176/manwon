'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronRight } from 'lucide-react'
import { BrandButton } from '@/components/ui/Common'
import { acceptRequiredLegalAgreements, fetchAuthSession } from '@/lib/manwonApi'
import { documentMeta, legalPages } from '@/lib/legalDocuments'

const requiredAgreementItems = [
  {
    key: 'terms',
    title: '서비스 이용약관 동의',
    description: '중개 서비스, 거래 안전, 유해 콘텐츠 기준을 확인해요.',
    slug: 'service',
  },
  {
    key: 'privacy',
    title: '개인정보 처리방침 및 수집·이용 동의',
    description: '회원 식별, 휴대폰 인증, 알림 처리 기준을 확인해요.',
    slug: 'privacy',
  },
] as const

type RequiredAgreementKey = (typeof requiredAgreementItems)[number]['key']
type RequiredAgreementSlug = (typeof requiredAgreementItems)[number]['slug']
type RequiredAgreements = Record<RequiredAgreementKey, boolean>

const initialRequiredAgreements: RequiredAgreements = {
  terms: false,
  privacy: false,
}

function normalizeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.startsWith('/login') || value.startsWith('/signup') || value.startsWith('/terms-consent')) return '/'
  return value
}

function isProfileOnboardingCompleted(profile: Record<string, unknown> | null | undefined) {
  return profile?.profileOnboardingCompleted === true
}

function hasRequiredLegalAgreements(profile: Record<string, unknown> | null | undefined) {
  return Boolean(profile?.termsAgreedAt && profile?.privacyAgreedAt)
}

export function TermsConsentScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = useMemo(() => normalizeNextPath(searchParams.get('next')), [searchParams])
  const [agreements, setAgreements] = useState<RequiredAgreements>(initialRequiredAgreements)
  const [activeLegalSlug, setActiveLegalSlug] = useState<RequiredAgreementSlug | null>(null)
  const [status, setStatus] = useState<'checking' | 'idle' | 'saving' | 'error'>('checking')
  const [message, setMessage] = useState('')

  const requiredAgreed = agreements.terms && agreements.privacy
  const allAgreed = requiredAgreementItems.every((item) => agreements[item.key])
  const activeLegalPage = activeLegalSlug ? legalPages[activeLegalSlug] : null

  useEffect(() => {
    let cancelled = false

    void fetchAuthSession()
      .then((session) => {
        if (cancelled) return

        if (!session.authenticated) {
          router.replace(`/login?next=${encodeURIComponent('/terms-consent')}`)
          return
        }

        if (hasRequiredLegalAgreements(session.profile)) {
          router.replace(isProfileOnboardingCompleted(session.profile) ? nextPath : '/profile-onboarding')
          return
        }

        setStatus('idle')
      })
      .catch(() => {
        if (cancelled) return
        router.replace(`/login?next=${encodeURIComponent('/terms-consent')}`)
      })

    return () => {
      cancelled = true
    }
  }, [nextPath, router])

  function toggleAgreement(key: RequiredAgreementKey) {
    setAgreements((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  function toggleAllAgreements() {
    const nextValue = !allAgreed
    setAgreements({
      terms: nextValue,
      privacy: nextValue,
    })
  }

  async function submitAgreements() {
    if (!requiredAgreed || status === 'saving') return
    setStatus('saving')
    setMessage('')

    try {
      const profile = await acceptRequiredLegalAgreements(agreements)
      router.replace(isProfileOnboardingCompleted(profile) ? nextPath : '/profile-onboarding')
      router.refresh()
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '약관 동의를 저장하지 못했습니다.')
    }
  }

  if (activeLegalPage) {
    return (
      <section className="screen terms-consent-screen terms-consent-detail-screen">
        <article className="legal-screen terms-consent-legal-detail">
          <header className="legal-topbar">
            <button className="legal-back-link" type="button" onClick={() => setActiveLegalSlug(null)} aria-label="동의 화면으로 돌아가기">
              ‹
            </button>
            <h1>{activeLegalPage.title}</h1>
          </header>

          <div className="legal-title-block">
            <span className={activeLegalPage.badge === '필수' ? 'is-required' : 'is-optional'}>[{activeLegalPage.badge}]</span>
            <h2>{activeLegalPage.title}</h2>
            <p>{activeLegalPage.summary}</p>
            <div className="legal-meta-list">
              {documentMeta.map((item) => (
                <small key={item}>{item}</small>
              ))}
            </div>
          </div>

          <div className="legal-content">
            {activeLegalPage.sections.map((section) => (
              <section key={section.heading}>
                <h3>{section.heading}</h3>
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>
            ))}
          </div>
        </article>
      </section>
    )
  }

  if (status === 'checking') {
    return <section className="screen terms-consent-screen" />
  }

  return (
    <section className="screen terms-consent-screen">
      <div className="terms-consent-panel">
        <div className="terms-consent-copy">
          <span>필수 약관 확인</span>
          <h1>
            서비스 이용 전에
            <br />
            동의가 필요해요
          </h1>
          <p>카카오 또는 Apple 계정으로 가입한 경우에도 서비스 이용약관과 개인정보 처리방침 동의가 필요합니다.</p>
        </div>

        <button className={`agreement-all ${allAgreed ? 'is-active' : ''}`} type="button" onClick={toggleAllAgreements}>
          <span>
            <Check size={18} />
          </span>
          전체 동의하기
        </button>

        <div className="agreement-list">
          {requiredAgreementItems.map((item) => (
            <div className={`agreement-row ${agreements[item.key] ? 'is-active' : ''}`} key={item.key}>
              <button className="agreement-row-toggle" type="button" onClick={() => toggleAgreement(item.key)}>
                <span className="agreement-check">
                  <Check size={16} />
                </span>
                <strong>
                  <em>[필수]</em>
                  {item.title}
                </strong>
                <small>{item.description}</small>
              </button>
              <button className="agreement-detail-link" type="button" onClick={() => setActiveLegalSlug(item.slug)} aria-label={`${item.title} 보기`}>
                <ChevronRight size={19} />
              </button>
            </div>
          ))}
        </div>

        {message && <p className="inline-status is-error">{message}</p>}

        <div className="terms-consent-actions">
          <BrandButton full size="lg" disabled={!requiredAgreed || status === 'saving'} onClick={() => void submitAgreements()}>
            {status === 'saving' ? '저장 중' : '동의하고 계속'}
          </BrandButton>
        </div>
      </div>
    </section>
  )
}
