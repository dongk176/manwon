'use client'

import { useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { confirmPhoneVerification, requestPhoneVerification } from '@/lib/manwonApi'

function normalizeDigits(value: string, maxLength: number) {
  return value.replace(/\D/g, '').slice(0, maxLength)
}

function formatPhone(value: string) {
  const digits = normalizeDigits(value, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

export function PhoneVerificationOverlay({
  onClose,
  onVerified,
}: {
  onClose: () => void
  onVerified?: (profile: Record<string, unknown>) => void
}) {
  const [phone, setPhone] = useState('')
  const [requestedPhone, setRequestedPhone] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canRequest = phone.length >= 10 && !busy
  const canConfirm = requestedPhone.length >= 10 && code.length === 6 && !busy

  async function requestCode() {
    if (!canRequest) return
    setBusy(true)
    setError('')
    try {
      const result = await requestPhoneVerification(phone)
      setRequestedPhone(result.phone)
      setCode('')
    } catch (error) {
      setError(error instanceof Error ? error.message : '인증번호를 요청하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmCode() {
    if (!canConfirm) return
    setBusy(true)
    setError('')
    try {
      const profile = await confirmPhoneVerification(requestedPhone, code)
      onVerified?.(profile)
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : '휴대폰 인증을 완료하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="phone-verification-overlay" role="presentation" onClick={busy ? undefined : onClose}>
      <section className="phone-verification-card" role="dialog" aria-modal="true" aria-labelledby="phone-verification-title" onClick={(event) => event.stopPropagation()}>
        <button className="phone-verification-close" type="button" onClick={onClose} aria-label="닫기" disabled={busy}>
          <X size={21} />
        </button>
        <span className="phone-verification-icon">
          <CheckCircle2 size={25} />
        </span>
        <h2 id="phone-verification-title">해당 서비스는 휴대폰 인증 후 이용하실 수 있습니다.</h2>
        <p>작성 중인 내용은 유지됩니다. 인증을 마치면 바로 이어서 이용할 수 있어요.</p>
        <label>
          <span>휴대폰 번호</span>
          <div className="phone-verification-row">
            <input
              value={formatPhone(phone)}
              onChange={(event) => setPhone(normalizeDigits(event.target.value, 11))}
              placeholder="010-0000-0000"
              inputMode="numeric"
              disabled={busy}
            />
            <button type="button" onClick={requestCode} disabled={!canRequest}>
              {requestedPhone ? '재요청' : '인증번호'}
            </button>
          </div>
        </label>
        <label>
          <span>인증번호</span>
          <input
            value={code}
            onChange={(event) => setCode(normalizeDigits(event.target.value, 6))}
            placeholder="6자리"
            inputMode="numeric"
            disabled={busy || !requestedPhone}
          />
        </label>
        {error && <p className="phone-verification-error">{error}</p>}
        <button className="phone-verification-submit" type="button" onClick={confirmCode} disabled={!canConfirm}>
          {busy ? '확인 중' : '인증 완료'}
        </button>
      </section>
    </div>
  )
}
