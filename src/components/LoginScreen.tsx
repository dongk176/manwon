'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, ChevronRight, X } from 'lucide-react'
import { BrandButton } from '@/components/ui/Common'
import { documentMeta, legalPages } from '@/lib/legalDocuments'
import {
  checkLoginCredential,
  confirmLoginIdRecovery,
  checkSignupLoginId,
  completeSignup,
  requestLoginIdRecovery,
  requestPasswordRecovery,
  resetPasswordWithRecovery,
  requestSignupOtp,
  verifySignupOtp,
  type SignupOnboardingPayload,
} from '@/lib/manwonApi'

type SignupStep = 'credentials' | 'profile'
type SignupGender = 'male' | 'female' | ''
type RecoverySheetMode = 'findId' | 'resetPassword'

const agreementItems = [
  {
    key: 'terms',
    title: '서비스 이용약관 및 유해 콘텐츠 무관용 동의',
    description: '부적절한 콘텐츠와 악성 이용자를 허용하지 않는 약관이에요.',
    required: true,
    slug: 'service',
  },
  {
    key: 'privacy',
    title: '개인정보 수집·이용 및 본인 확인 동의',
    description: '회원 식별, 휴대폰 인증, 거래 안전을 위해 필요해요.',
    required: true,
    slug: 'privacy',
  },
  {
    key: 'marketing',
    title: '마케팅 정보 수신 동의',
    description: '혜택과 이벤트 소식을 받을 수 있어요.',
    required: false,
    slug: 'marketing',
  },
] as const

type AgreementKey = (typeof agreementItems)[number]['key']
type AgreementSlug = (typeof agreementItems)[number]['slug']
type Agreements = Record<AgreementKey, boolean>

const initialAgreements: Agreements = {
  terms: false,
  privacy: false,
  marketing: false,
}

const LOGIN_ID_MIN_LENGTH = 4
const LOGIN_ID_MAX_LENGTH = 30
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 72
const unsupportedLoginIdPattern = /[^a-zA-Z0-9_]/
const unsupportedLoginIdGlobalPattern = /[^a-zA-Z0-9_]/g
const signupGenderOptions: Array<{ value: Exclude<SignupGender, ''>; label: string }> = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
]

function isProfileOnboardingCompleted(profile: Record<string, unknown> | null | undefined) {
  return profile?.profileOnboardingCompleted === true
}

function normalizeLoginIdInput(value: string) {
  return value.replace(unsupportedLoginIdGlobalPattern, '').slice(0, LOGIN_ID_MAX_LENGTH)
}

function normalizeDigitsInput(value: string, maxLength: number) {
  return value.replace(/\D/g, '').slice(0, maxLength)
}

function formatBirthDate(value: string) {
  if (value.length <= 4) return value
  if (value.length <= 6) return `${value.slice(0, 4)}/${value.slice(4)}`
  return `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6, 8)}`
}

function formatPhoneNumber(value: string) {
  if (value.length <= 3) return value
  if (value.length <= 7) return `${value.slice(0, 3)}-${value.slice(3)}`
  if (value.length <= 10) return `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`
  return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`
}

export function LoginScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loginId, setLoginId] = useState('')
  const [loginIdInputHint, setLoginIdInputHint] = useState('')
  const [password, setPassword] = useState('')
  const [recoverySheet, setRecoverySheet] = useState<RecoverySheetMode | null>(null)
  const [status, setStatus] = useState<'idle' | 'checking' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const loginIdHint = loginIdInputHint || (loginId.length > 0 && loginId.length < LOGIN_ID_MIN_LENGTH ? `${LOGIN_ID_MIN_LENGTH}자 이상` : '')
  const passwordHint = password.length > 0 && password.length < PASSWORD_MIN_LENGTH ? `${PASSWORD_MIN_LENGTH}자 이상` : ''
  const canSubmitCredentials = loginId.length >= LOGIN_ID_MIN_LENGTH && password.length >= PASSWORD_MIN_LENGTH && !loginIdInputHint

  function completeLogin(profile: Record<string, unknown>) {
    router.replace(isProfileOnboardingCompleted(profile) ? searchParams.get('next') || '/' : '/profile-onboarding')
    router.refresh()
  }

  function closeLogin() {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.replace('/')
  }

  async function loginWithCredentials() {
    if (!canSubmitCredentials || status === 'checking') return
    setStatus('checking')
    setMessage('')
    try {
      const result = await checkLoginCredential({ loginId, password })
      if (result.mode === 'signed_in') {
        completeLogin(result.profile)
        return
      }
      setStatus('error')
      setMessage(result.resume ? '가입이 완료되지 않은 계정이에요. 가입하기로 인증을 마쳐주세요.' : '가입된 계정이 없어요. 가입하기를 눌러주세요.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '아이디 또는 비밀번호를 확인해주세요.')
    } finally {
      setStatus((current) => (current === 'checking' ? 'idle' : current))
    }
  }

  function goSignup() {
    const next = searchParams.get('next')
    router.push(next ? `/signup?next=${encodeURIComponent(next)}` : '/signup')
  }

  function updateLoginId(value: string) {
    setLoginId(normalizeLoginIdInput(value))
    setLoginIdInputHint(unsupportedLoginIdPattern.test(value) ? '영문/숫자만' : '')
  }

  return (
    <section className="screen login-screen auth-entry-screen">
      <div className="auth-entry">
        <button className="auth-close-button" type="button" aria-label="닫기" onClick={closeLogin}>
          <X size={24} />
        </button>

        <div className="auth-brand" aria-label="뭐든해줌">
          뭐든해줌
        </div>

        <div className="auth-form-panel">
          <label className={`auth-field ${loginIdHint ? 'has-hint' : ''}`}>
            <span className="sr-only">아이디</span>
            <input
              value={loginId}
              autoComplete="username"
              placeholder="아이디"
              disabled={status === 'checking'}
              aria-invalid={Boolean(loginIdHint)}
              onChange={(event) => updateLoginId(event.target.value)}
            />
            {loginIdHint && <span className="auth-field-hint">{loginIdHint}</span>}
          </label>

          <label className={`auth-field ${passwordHint ? 'has-hint' : ''}`}>
            <span className="sr-only">비밀번호</span>
            <input
              value={password}
              autoComplete="current-password"
              type="password"
              placeholder="비밀번호"
              disabled={status === 'checking'}
              aria-invalid={Boolean(passwordHint)}
              onChange={(event) => setPassword(event.target.value.slice(0, PASSWORD_MAX_LENGTH))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void loginWithCredentials()
              }}
            />
            {passwordHint && <span className="auth-field-hint">{passwordHint}</span>}
          </label>

          <div className="auth-button-stack">
            <button className="auth-main-button" type="button" disabled={!canSubmitCredentials || status === 'checking'} onClick={() => void loginWithCredentials()}>
              {status === 'checking' ? '확인 중' : '로그인하기'}
            </button>
            <button className="auth-sub-button" type="button" disabled={status === 'checking'} onClick={goSignup}>
              가입하기
            </button>
          </div>

          {message && <p className={`inline-status ${status === 'error' ? 'is-error' : ''}`}>{message}</p>}
        </div>

        <div className="auth-help-links" aria-label="계정 찾기">
          <button type="button" onClick={() => setRecoverySheet('findId')}>
            아이디 찾기
          </button>
          <i />
          <button type="button" onClick={() => setRecoverySheet('resetPassword')}>
            비밀번호 찾기
          </button>
        </div>
      </div>
      {recoverySheet && (
        <AccountRecoverySheet
          mode={recoverySheet}
          initialLoginId={loginId}
          onClose={() => setRecoverySheet(null)}
          onSelectLoginId={(recoveredLoginId) => {
            updateLoginId(recoveredLoginId)
            setPassword('')
            setStatus('idle')
            setMessage('아이디를 찾았어요. 비밀번호를 입력한 뒤 로그인해주세요.')
            setRecoverySheet(null)
          }}
          onPasswordReset={(recoveredLoginId) => {
            updateLoginId(recoveredLoginId)
            setPassword('')
            setStatus('idle')
            setMessage('새 비밀번호가 저장되었습니다. 다시 로그인해주세요.')
            setRecoverySheet(null)
          }}
        />
      )}
    </section>
  )
}

export function SignupScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<SignupStep>('credentials')
  const [showAgreements, setShowAgreements] = useState(false)
  const [loginId, setLoginId] = useState('')
  const [loginIdInputHint, setLoginIdInputHint] = useState('')
  const [loginIdCheckHint, setLoginIdCheckHint] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [gender, setGender] = useState<SignupGender>('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [requestedPhone, setRequestedPhone] = useState('')
  const [codeVerified, setCodeVerified] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [agreements, setAgreements] = useState<Agreements>(initialAgreements)
  const [status, setStatus] = useState<'idle' | 'checking' | 'sending' | 'sent' | 'verifying' | 'verified' | 'completing' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const loginIdHint = loginIdInputHint || loginIdCheckHint || (loginId.length > 0 && loginId.length < LOGIN_ID_MIN_LENGTH ? `${LOGIN_ID_MIN_LENGTH}자 이상` : '')
  const passwordHint = password.length > 0 && password.length < PASSWORD_MIN_LENGTH ? `${PASSWORD_MIN_LENGTH}자 이상` : ''
  const canSubmitCredentials = loginId.length >= LOGIN_ID_MIN_LENGTH && password.length >= PASSWORD_MIN_LENGTH && !loginIdInputHint && !loginIdCheckHint
  const requiredAgreed = agreements.terms && agreements.privacy
  const allAgreed = agreementItems.every((item) => agreements[item.key])
  const canRequestCode = name.trim().length >= 2 && Boolean(gender) && birthDate.length === 8 && phone.length >= 10 && requiredAgreed
  const canSendCode = canRequestCode && status !== 'sending' && status !== 'verifying' && status !== 'completing' && (!requestedPhone || resendCooldown === 0)

  const signupPayload = useMemo<SignupOnboardingPayload>(
    () => ({
      loginId,
      password,
      name,
      gender: gender || 'male',
      birthDate,
      phone,
      agreements,
    }),
    [agreements, birthDate, gender, loginId, name, password, phone],
  )

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = window.setInterval(() => {
      setResendCooldown((current) => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [resendCooldown])

  function closeSignup() {
    const next = searchParams.get('next')
    router.replace(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  }

  async function proceedFromCredentials() {
    if (!canSubmitCredentials || status === 'checking') return
    setStatus('checking')
    setMessage('')
    try {
      const result = await checkSignupLoginId(loginId)
      if (!result.available) {
        setStatus('idle')
        setLoginIdCheckHint('이미 사용중')
        return
      }
      setStatus('idle')
      setShowAgreements(true)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '아이디 또는 비밀번호를 확인해주세요.')
    }
  }

  function updateSignupLoginId(value: string) {
    setLoginId(normalizeLoginIdInput(value))
    setLoginIdInputHint(unsupportedLoginIdPattern.test(value) ? '영문/숫자만' : '')
    setLoginIdCheckHint('')
  }

  function toggleAgreement(key: AgreementKey) {
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
      marketing: nextValue,
    })
  }

  function acceptAgreements() {
    if (!requiredAgreed) {
      setMessage('필수 약관에 동의해주세요.')
      return
    }
    setShowAgreements(false)
    setMessage('')
    setStep('profile')
  }

  async function requestCode() {
    if (!canSendCode) return
    setStatus('sending')
    setMessage('')
    try {
      const result = await requestSignupOtp(signupPayload)
      setRequestedPhone(result.phone)
      setCode('')
      setCodeVerified(false)
      setResendCooldown(30)
      setStatus('sent')
      setMessage(`인증번호를 보냈습니다. ${Math.ceil(result.ttlSeconds / 60)}분 안에 입력해주세요.`)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '인증번호를 보내지 못했습니다.')
    }
  }

  async function confirmCode() {
    if (code.length !== 6 || status === 'verifying') return
    setStatus('verifying')
    setMessage('')
    try {
      await verifySignupOtp({ ...signupPayload, code })
      setCodeVerified(true)
      setStatus('verified')
      setMessage('인증번호가 확인되었습니다. 회원가입을 완료해주세요.')
    } catch (error) {
      setStatus('error')
      setCodeVerified(false)
      setMessage(error instanceof Error ? error.message : '인증번호를 확인하지 못했습니다.')
    }
  }

  async function completeSignupFlow() {
    if (!codeVerified || status === 'completing') return
    setStatus('completing')
    setMessage('')
    try {
      await completeSignup(signupPayload)
      setStatus('done')
      router.replace('/profile-onboarding')
      router.refresh()
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '회원가입을 완료하지 못했습니다.')
    }
  }

  function updateSignupPhone(value: string) {
    setPhone(normalizeDigitsInput(value, 11))
    setRequestedPhone('')
    setCode('')
    setCodeVerified(false)
    setResendCooldown(0)
  }

  function updateSignupCode(value: string) {
    setCode(normalizeDigitsInput(value, 6))
    setCodeVerified(false)
    if (status === 'verified') setStatus('sent')
  }

  return (
    <section className="screen signup-screen auth-entry-screen">
      {step === 'credentials' ? (
        <div className="auth-entry">
          <button className="auth-close-button" type="button" aria-label="닫기" onClick={closeSignup}>
            <X size={24} />
          </button>

          <div className="auth-brand auth-brand-message" aria-label="환영합니다. 아이디와 비밀번호를 설정해주세요.">
            환영합니다!
            <br />
            아이디와 비밀번호를 설정해주세요.
          </div>

          <div className="auth-form-panel">
            <label className={`auth-field ${loginIdHint ? 'has-hint' : ''}`}>
              <span className="sr-only">아이디</span>
              <input
                value={loginId}
                autoComplete="username"
                placeholder="아이디"
                disabled={status === 'checking'}
                aria-invalid={Boolean(loginIdHint)}
                onChange={(event) => updateSignupLoginId(event.target.value)}
              />
              {loginIdHint && <span className="auth-field-hint">{loginIdHint}</span>}
            </label>

            <label className={`auth-field ${passwordHint ? 'has-hint' : ''}`}>
              <span className="sr-only">비밀번호</span>
              <input
                value={password}
                autoComplete="current-password"
                type="password"
                placeholder="비밀번호"
                disabled={status === 'checking'}
                aria-invalid={Boolean(passwordHint)}
                onChange={(event) => setPassword(event.target.value.slice(0, PASSWORD_MAX_LENGTH))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void proceedFromCredentials()
                }}
              />
              {passwordHint && <span className="auth-field-hint">{passwordHint}</span>}
            </label>

            <div className="auth-button-stack">
              <button className="auth-main-button" type="button" disabled={!canSubmitCredentials || status === 'checking'} onClick={() => void proceedFromCredentials()}>
                {status === 'checking' ? '확인 중' : '다음'}
              </button>
            </div>

            {message && <p className={`inline-status ${status === 'error' ? 'is-error' : ''}`}>{message}</p>}
          </div>
        </div>
      ) : (
        <div className="auth-entry">
          <button className="auth-close-button" type="button" aria-label="이전" onClick={() => setStep('credentials')}>
            <ArrowLeft size={24} />
          </button>

          <div className="auth-brand auth-brand-message" aria-label="가입 마무리를 위해 정보를 입력해주세요.">
            가입 마무리를 위해
            <br />
            정보를 입력해주세요.
          </div>

          <div className="auth-form-panel signup-profile-form">
            <label className="auth-field">
              <span className="sr-only">이름</span>
              <input value={name} autoComplete="name" placeholder="이름" disabled={status === 'sending' || status === 'verifying' || status === 'completing'} onChange={(event) => setName(event.target.value.slice(0, 30))} />
            </label>

            <div className="auth-gender-field" role="radiogroup" aria-label="성별">
              {signupGenderOptions.map((option) => (
                <button
                  className={gender === option.value ? 'is-active' : ''}
                  type="button"
                  key={option.value}
                  role="radio"
                  aria-checked={gender === option.value}
                  disabled={status === 'sending' || status === 'verifying' || status === 'completing'}
                  onClick={() => setGender(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="auth-field">
              <span className="sr-only">생년월일</span>
              <input
                value={formatBirthDate(birthDate)}
                inputMode="numeric"
                placeholder="생년월일 YYYY/MM/DD"
                disabled={status === 'sending' || status === 'verifying' || status === 'completing'}
                onChange={(event) => setBirthDate(normalizeDigitsInput(event.target.value, 8))}
              />
            </label>

            <label className="auth-field">
              <span className="sr-only">휴대폰 번호</span>
              <input
                value={formatPhoneNumber(phone)}
                inputMode="numeric"
                autoComplete="tel"
                placeholder="휴대폰 번호"
                disabled={status === 'sending' || status === 'verifying' || status === 'completing'}
                onChange={(event) => updateSignupPhone(event.target.value)}
              />
            </label>

            {!codeVerified && (
              <div className="auth-button-stack">
                <button className="auth-main-button" type="button" disabled={!canSendCode} onClick={() => void requestCode()}>
                  {status === 'sending' ? '전송 중' : requestedPhone && resendCooldown > 0 ? `재전송 ${resendCooldown}초` : requestedPhone ? '인증번호 재전송' : '인증번호 전송'}
                </button>
              </div>
            )}

            {(status === 'sent' || status === 'verifying' || status === 'verified' || status === 'completing' || requestedPhone) && status !== 'done' && (
              <>
                <label className="auth-field">
                  <span className="sr-only">인증번호</span>
                  <input value={code} inputMode="numeric" placeholder="인증번호 6자리" disabled={status === 'verifying' || status === 'completing'} onChange={(event) => updateSignupCode(event.target.value)} />
                </label>
                <button className="auth-sub-button" type="button" disabled={status === 'verifying' || status === 'completing' || code.length !== 6 || codeVerified} onClick={() => void confirmCode()}>
                  {status === 'verifying' ? '확인 중' : codeVerified ? '인증번호 확인 완료' : '인증번호 확인'}
                </button>
                <button className="auth-main-button" type="button" disabled={!codeVerified || status === 'completing'} onClick={() => void completeSignupFlow()}>
                  {status === 'completing' ? '완료 중' : '회원가입 완료'}
                </button>
              </>
            )}

            {message && <p className={`inline-status ${status === 'error' ? 'is-error' : ''}`}>{message}</p>}
          </div>
        </div>
      )}

      {showAgreements && (
        <AgreementSheet
          agreements={agreements}
          allAgreed={allAgreed}
          requiredAgreed={requiredAgreed}
          onAccept={acceptAgreements}
          onClose={() => setShowAgreements(false)}
          onToggle={toggleAgreement}
          onToggleAll={toggleAllAgreements}
        />
      )}
    </section>
  )
}

function AgreementSheet({
  agreements,
  allAgreed,
  requiredAgreed,
  onAccept,
  onClose,
  onToggle,
  onToggleAll,
}: {
  agreements: Agreements
  allAgreed: boolean
  requiredAgreed: boolean
  onAccept: () => void
  onClose: () => void
  onToggle: (key: AgreementKey) => void
  onToggleAll: () => void
}) {
  const [activeLegalSlug, setActiveLegalSlug] = useState<AgreementSlug | null>(null)
  const activeLegalPage = activeLegalSlug ? legalPages[activeLegalSlug] : null

  if (activeLegalPage) {
    return (
      <div className="sheet-overlay" role="presentation" onClick={() => setActiveLegalSlug(null)}>
        <div className="agreement-sheet is-legal-detail" role="dialog" aria-modal="true" aria-labelledby="agreement-legal-title" onClick={(event) => event.stopPropagation()}>
          <header className="agreement-detail-topbar">
            <button className="agreement-detail-back" type="button" onClick={() => setActiveLegalSlug(null)} aria-label="동의 목록으로 돌아가기">
              <ArrowLeft size={22} />
            </button>
            <h2 id="agreement-legal-title">{activeLegalPage.title}</h2>
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

          <div className="agreement-cta">
            <BrandButton full size="lg" onClick={() => setActiveLegalSlug(null)}>
              확인
            </BrandButton>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <div className="agreement-sheet" role="dialog" aria-modal="true" aria-labelledby="agreement-title" onClick={(event) => event.stopPropagation()}>
        <div className="drag-handle" />
        <h2 id="agreement-title">
          회원가입을 위한
          <br />
          꼭 필요한 동의가 있어요
        </h2>

        <button className={`agreement-all ${allAgreed ? 'is-active' : ''}`} type="button" onClick={onToggleAll}>
          <span>
            <Check size={18} />
          </span>
          전체 동의하기
        </button>

        <div className="agreement-list">
          {agreementItems.map((item) => (
            <div className={`agreement-row ${agreements[item.key] ? 'is-active' : ''}`} key={item.key}>
              <button className="agreement-row-toggle" type="button" onClick={() => onToggle(item.key)}>
                <span className="agreement-check">
                  <Check size={16} />
                </span>
                <strong>
                  <em className={item.required ? 'is-required' : 'is-optional'}>[{item.required ? '필수' : '선택'}]</em>
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
        <p className="agreement-note">선택 동의에 동의하지 않아도 서비스 이용이 가능합니다.</p>

        <div className="agreement-cta">
          <BrandButton full size="lg" disabled={!requiredAgreed} onClick={onAccept}>
            동의하고 진행하기
          </BrandButton>
        </div>
      </div>
    </div>
  )
}

function AccountRecoverySheet({
  mode,
  initialLoginId,
  onClose,
  onSelectLoginId,
  onPasswordReset,
}: {
  mode: RecoverySheetMode
  initialLoginId: string
  onClose: () => void
  onSelectLoginId: (loginId: string) => void
  onPasswordReset: (loginId: string) => void
}) {
  const isPasswordMode = mode === 'resetPassword'
  const [loginId, setLoginId] = useState(initialLoginId)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [requestedPhone, setRequestedPhone] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [recoveredLoginId, setRecoveredLoginId] = useState('')

  const loginIdHint = isPasswordMode && loginId.length > 0 && loginId.length < LOGIN_ID_MIN_LENGTH ? `${LOGIN_ID_MIN_LENGTH}자 이상` : ''
  const nextPasswordHint = nextPassword.length > 0 && nextPassword.length < PASSWORD_MIN_LENGTH ? `${PASSWORD_MIN_LENGTH}자 이상` : ''
  const confirmPasswordHint = confirmPassword.length > 0 && confirmPassword !== nextPassword ? '비밀번호가 달라요' : ''
  const busy = status === 'sending' || status === 'verifying'
  const canRequest = isPasswordMode
    ? loginId.length >= LOGIN_ID_MIN_LENGTH && phone.length >= 10 && !busy && (!requestedPhone || cooldown === 0)
    : phone.length >= 10 && !busy && (!requestedPhone || cooldown === 0)
  const canConfirm = isPasswordMode
    ? loginId.length >= LOGIN_ID_MIN_LENGTH
      && phone.length >= 10
      && code.length === 6
      && nextPassword.length >= PASSWORD_MIN_LENGTH
      && nextPassword === confirmPassword
      && !busy
    : phone.length >= 10 && code.length === 6 && !busy

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  function resetVerificationState() {
    setRequestedPhone('')
    setCode('')
    setCooldown(0)
    setRecoveredLoginId('')
    setStatus('idle')
    setMessage('')
  }

  async function handleRequestCode() {
    if (!canRequest) return
    setStatus('sending')
    setMessage('')
    try {
      const result = isPasswordMode
        ? await requestPasswordRecovery(loginId, phone)
        : await requestLoginIdRecovery(phone)
      setRequestedPhone(result.phone)
      setCode('')
      setRecoveredLoginId('')
      setCooldown(30)
      setStatus('sent')
      setMessage(`인증번호를 보냈습니다. ${Math.ceil(result.ttlSeconds / 60)}분 안에 입력해주세요.`)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '인증번호를 보내지 못했습니다.')
    }
  }

  async function handleConfirm() {
    if (!canConfirm) return
    if (isPasswordMode && nextPassword !== confirmPassword) {
      setStatus('error')
      setMessage('새 비밀번호를 다시 확인해주세요.')
      return
    }

    setStatus('verifying')
    setMessage('')
    try {
      if (isPasswordMode) {
        await resetPasswordWithRecovery({
          loginId,
          phone,
          code,
          password: nextPassword,
        })
        onPasswordReset(loginId)
        return
      }

      const result = await confirmLoginIdRecovery(phone, code)
      setRecoveredLoginId(result.loginId)
      setStatus('done')
      setMessage('가입된 아이디를 찾았어요.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '인증번호를 확인하지 못했습니다.')
    }
  }

  return (
    <div className="sheet-overlay is-centered" role="presentation" onClick={busy ? undefined : onClose}>
      <section className="auth-recovery-sheet" role="dialog" aria-modal="true" aria-labelledby="auth-recovery-title" onClick={(event) => event.stopPropagation()}>
        <button className="sheet-x" type="button" onClick={onClose} disabled={busy} aria-label="닫기">
          <X size={20} />
        </button>
        <h2 id="auth-recovery-title">{isPasswordMode ? '비밀번호 재설정' : '아이디 찾기'}</h2>
        <p>{isPasswordMode ? '아이디와 휴대폰 번호를 확인한 뒤 새 비밀번호를 설정해주세요.' : '가입에 사용한 휴대폰 번호로 아이디를 확인할 수 있어요.'}</p>

        <div className="auth-recovery-form">
          {isPasswordMode && (
            <label className={`auth-field ${loginIdHint ? 'has-hint' : ''}`}>
              <span className="sr-only">아이디</span>
              <input
                value={loginId}
                autoComplete="username"
                placeholder="아이디"
                disabled={busy}
                onChange={(event) => {
                  setLoginId(normalizeLoginIdInput(event.target.value))
                  resetVerificationState()
                }}
              />
              {loginIdHint && <span className="auth-field-hint">{loginIdHint}</span>}
            </label>
          )}

          <label className="auth-field">
            <span className="sr-only">휴대폰 번호</span>
            <input
              value={formatPhoneNumber(phone)}
              inputMode="numeric"
              autoComplete="tel"
              placeholder="휴대폰 번호"
              disabled={busy}
              onChange={(event) => {
                setPhone(normalizeDigitsInput(event.target.value, 11))
                resetVerificationState()
              }}
            />
          </label>

          <button className="auth-main-button" type="button" disabled={!canRequest} onClick={() => void handleRequestCode()}>
            {status === 'sending' ? '전송 중' : requestedPhone && cooldown > 0 ? `재전송 ${cooldown}초` : requestedPhone ? '인증번호 재전송' : '인증번호 전송'}
          </button>

          {(requestedPhone || code.length > 0 || status === 'done') && (
            <label className="auth-field">
              <span className="sr-only">인증번호</span>
              <input
                value={code}
                inputMode="numeric"
                placeholder="인증번호 6자리"
                disabled={busy || Boolean(recoveredLoginId)}
                onChange={(event) => setCode(normalizeDigitsInput(event.target.value, 6))}
              />
            </label>
          )}

          {isPasswordMode && (
            <>
              <label className={`auth-field ${nextPasswordHint ? 'has-hint' : ''}`}>
                <span className="sr-only">새 비밀번호</span>
                <input
                  value={nextPassword}
                  type="password"
                  autoComplete="new-password"
                  placeholder="새 비밀번호"
                  disabled={busy}
                  onChange={(event) => setNextPassword(event.target.value.slice(0, PASSWORD_MAX_LENGTH))}
                />
                {nextPasswordHint && <span className="auth-field-hint">{nextPasswordHint}</span>}
              </label>

              <label className={`auth-field ${confirmPasswordHint ? 'has-hint' : ''}`}>
                <span className="sr-only">새 비밀번호 확인</span>
                <input
                  value={confirmPassword}
                  type="password"
                  autoComplete="new-password"
                  placeholder="새 비밀번호 확인"
                  disabled={busy}
                  onChange={(event) => setConfirmPassword(event.target.value.slice(0, PASSWORD_MAX_LENGTH))}
                />
                {confirmPasswordHint && <span className="auth-field-hint">{confirmPasswordHint}</span>}
              </label>
            </>
          )}

          {message && <p className={`inline-status ${status === 'error' ? 'is-error' : ''}`}>{message}</p>}

          {recoveredLoginId ? (
            <div className="auth-recovery-result">
              <span>가입된 아이디</span>
              <strong>{recoveredLoginId}</strong>
              <button className="auth-main-button" type="button" onClick={() => onSelectLoginId(recoveredLoginId)}>
                이 아이디로 로그인
              </button>
            </div>
          ) : (
            <button className="auth-sub-button" type="button" disabled={!canConfirm} onClick={() => void handleConfirm()}>
              {status === 'verifying' ? '확인 중' : isPasswordMode ? '새 비밀번호 저장' : '아이디 확인'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
