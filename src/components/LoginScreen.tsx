'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, ChevronRight, X } from 'lucide-react'
import { BrandButton } from '@/components/ui/Common'
import {
  checkLoginCredential,
  checkSignupLoginId,
  confirmSignupOtp,
  requestSignupOtp,
  type SignupOnboardingPayload,
} from '@/lib/manwonApi'

type SignupStep = 'credentials' | 'profile'

const agreementItems = [
  {
    key: 'terms',
    title: '서비스 이용약관 동의',
    description: '만원부탁소 이용을 위한 기본 약관이에요.',
    required: true,
    href: '/terms/service',
  },
  {
    key: 'privacy',
    title: '개인정보 수집·이용 및 본인 확인 동의',
    description: '회원 식별, 휴대폰 인증, 거래 안전을 위해 필요해요.',
    required: true,
    href: '/terms/privacy',
  },
  {
    key: 'marketing',
    title: '마케팅 정보 수신 동의',
    description: '혜택과 이벤트 소식을 받을 수 있어요.',
    required: false,
    href: '/terms/marketing',
  },
] as const

type AgreementKey = (typeof agreementItems)[number]['key']
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
  const [status, setStatus] = useState<'idle' | 'checking' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const loginIdHint = loginIdInputHint || (loginId.length > 0 && loginId.length < LOGIN_ID_MIN_LENGTH ? `${LOGIN_ID_MIN_LENGTH}자 이상` : '')
  const passwordHint = password.length > 0 && password.length < PASSWORD_MIN_LENGTH ? `${PASSWORD_MIN_LENGTH}자 이상` : ''
  const canSubmitCredentials = loginId.length >= LOGIN_ID_MIN_LENGTH && password.length >= PASSWORD_MIN_LENGTH && !loginIdInputHint

  function completeLogin() {
    router.replace(searchParams.get('next') || '/')
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
        completeLogin()
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

        <div className="auth-brand" aria-label="만원부탁소">
          만원부탁소
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
          <button type="button" aria-disabled="true">
            아이디 찾기
          </button>
          <i />
          <button type="button" aria-disabled="true">
            비밀번호 찾기
          </button>
        </div>
        <footer className="auth-business-footer">
          <details>
            <summary>사업자 정보</summary>
            <dl>
              <div>
                <dt>상호</dt>
                <dd>아티룸</dd>
              </div>
              <div>
                <dt>대표</dt>
                <dd>김동민</dd>
              </div>
              <div>
                <dt>사업자등록번호</dt>
                <dd>638-04-03590</dd>
              </div>
              <div>
                <dt>통신판매업 신고번호</dt>
                <dd>2025-서울마포-2971</dd>
              </div>
              <div>
                <dt>주소</dt>
                <dd>서울특별시 마포구 성산로8길 40</dd>
              </div>
              <div>
                <dt>문의</dt>
                <dd>
                  <a href="mailto:artiroom176@gmail.com">artiroom176@gmail.com</a>
                </dd>
              </div>
            </dl>
          </details>
        </footer>
      </div>
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
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [requestedPhone, setRequestedPhone] = useState('')
  const [agreements, setAgreements] = useState<Agreements>(initialAgreements)
  const [status, setStatus] = useState<'idle' | 'checking' | 'sending' | 'sent' | 'verifying' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const loginIdHint = loginIdInputHint || loginIdCheckHint || (loginId.length > 0 && loginId.length < LOGIN_ID_MIN_LENGTH ? `${LOGIN_ID_MIN_LENGTH}자 이상` : '')
  const passwordHint = password.length > 0 && password.length < PASSWORD_MIN_LENGTH ? `${PASSWORD_MIN_LENGTH}자 이상` : ''
  const canSubmitCredentials = loginId.length >= LOGIN_ID_MIN_LENGTH && password.length >= PASSWORD_MIN_LENGTH && !loginIdInputHint && !loginIdCheckHint
  const requiredAgreed = agreements.terms && agreements.privacy
  const allAgreed = agreementItems.every((item) => agreements[item.key])
  const canRequestCode = name.trim().length >= 2 && birthDate.length === 8 && phone.length >= 10 && requiredAgreed

  const signupPayload = useMemo<SignupOnboardingPayload>(
    () => ({
      loginId,
      password,
      name,
      birthDate,
      phone,
      agreements,
    }),
    [agreements, birthDate, loginId, name, password, phone],
  )

  function completeLogin() {
    router.replace(searchParams.get('next') || '/')
    router.refresh()
  }

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
    if (!canRequestCode) return
    setStatus('sending')
    setMessage('')
    try {
      const result = await requestSignupOtp(signupPayload)
      setRequestedPhone(result.phone)
      setStatus('sent')
      setMessage(`인증번호를 보냈습니다. ${Math.ceil(result.ttlSeconds / 60)}분 안에 입력해주세요.`)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '인증번호를 보내지 못했습니다.')
    }
  }

  async function confirmCode() {
    setStatus('verifying')
    setMessage('')
    try {
      await confirmSignupOtp({ ...signupPayload, code })
      setStatus('done')
      completeLogin()
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '회원가입을 완료하지 못했습니다.')
    }
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
              <input value={name} autoComplete="name" placeholder="이름" disabled={status === 'sending' || status === 'verifying'} onChange={(event) => setName(event.target.value.slice(0, 30))} />
            </label>

            <label className="auth-field">
              <span className="sr-only">생년월일</span>
              <input
                value={formatBirthDate(birthDate)}
                inputMode="numeric"
                placeholder="생년월일 YYYY/MM/DD"
                disabled={status === 'sending' || status === 'verifying'}
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
                disabled={status === 'sending' || status === 'verifying'}
                onChange={(event) => setPhone(normalizeDigitsInput(event.target.value, 11))}
              />
            </label>

            <div className="auth-button-stack">
              <button className="auth-main-button" type="button" disabled={!canRequestCode || status === 'sending'} onClick={() => void requestCode()}>
                {status === 'sending' ? '전송 중' : requestedPhone ? '인증번호 재전송' : '인증번호 전송'}
              </button>
            </div>

            {(status === 'sent' || status === 'verifying' || requestedPhone) && status !== 'done' && (
              <>
                <label className="auth-field">
                  <span className="sr-only">인증번호</span>
                  <input value={code} inputMode="numeric" placeholder="인증번호 6자리" disabled={status === 'verifying'} onChange={(event) => setCode(normalizeDigitsInput(event.target.value, 6))} />
                </label>
                <button className="auth-main-button" type="button" disabled={status === 'verifying' || code.length !== 6} onClick={() => void confirmCode()}>
                  {status === 'verifying' ? '확인 중' : '회원가입 완료'}
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
              <Link className="agreement-detail-link" href={item.href} target="_blank" rel="noopener noreferrer" aria-label={`${item.title} 보기`}>
                <ChevronRight size={19} />
              </Link>
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
