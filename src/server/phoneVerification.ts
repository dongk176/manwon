import crypto from 'crypto'
import { getSql } from '@/server/db'
import { getOtpEnv } from '@/server/env'
import { HttpError } from '@/server/http'
import { sendSms } from '@/server/sms'

const schema = 'manwon_happiness'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function hashValue(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function hashOtp(phone: string, code: string) {
  return hashValue(`${getOtpEnv().hashSecret}:${phone}:${code}`)
}

function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || request.headers.get('cf-connecting-ip')?.trim() || ''
}

export function normalizePhone(phone: string) {
  const digits = onlyDigits(phone)
  if (!/^01[016789]\d{7,8}$/.test(digits)) {
    throw new HttpError('휴대폰 번호를 확인해주세요.', 400)
  }

  return digits
}

async function assertPhoneAvailable(phone: string, excludeUserId?: string | null) {
  const sql = getSql()
  const [owner] = await sql`
    select id
    from ${sql(schema)}.users
    where phone = ${phone}
      and (${excludeUserId ?? null}::uuid is null or id <> ${excludeUserId ?? null})
      and withdrawn_at is null
    limit 1
  `
  if (owner) throw new HttpError('이미 다른 계정에서 인증한 번호입니다.', 409)
}

async function createPhoneOtp(
  owner: { userId?: string | null; signupDraftId?: string | null },
  phoneInput: string,
  request: Request,
) {
  const phone = normalizePhone(phoneInput)
  const sql = getSql()
  const otpEnv = getOtpEnv()
  const ip = getClientIp(request)
  const ipHash = ip ? hashValue(ip) : null

  const [lastOtp] = await sql`
    select created_at
    from ${sql(schema)}.phone_otps
    where phone = ${phone}
    order by created_at desc
    limit 1
  `

  if (lastOtp) {
    const elapsedSeconds = (Date.now() - new Date(lastOtp.createdAt).getTime()) / 1000
    if (elapsedSeconds < otpEnv.resendCooldownSeconds) {
      const retryAfter = Math.ceil(otpEnv.resendCooldownSeconds - elapsedSeconds)
      throw new HttpError(`인증번호는 ${retryAfter}초 후 다시 요청할 수 있습니다.`, 429)
    }
  }

  if (ipHash) {
    const [rate] = await sql`
      select count(*)::integer as count
      from ${sql(schema)}.phone_otps
      where ip_hash = ${ipHash}
        and created_at >= ${new Date(Date.now() - otpEnv.ipWindowSeconds * 1000)}
    `
    if (Number(rate?.count ?? 0) >= otpEnv.ipMaxPerWindow) {
      throw new HttpError('인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', 429)
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + otpEnv.ttlSeconds * 1000)
  const [created] = await sql`
    insert into ${sql(schema)}.phone_otps (
      user_id,
      signup_draft_id,
      phone,
      code_hash,
      ip_hash,
      expires_at
    )
    values (
      ${owner.userId ?? null},
      ${owner.signupDraftId ?? null},
      ${phone},
      ${hashOtp(phone, code)},
      ${ipHash},
      ${expiresAt}
    )
    returning id
  `

  const ttlMinutes = Math.max(1, Math.ceil(otpEnv.ttlSeconds / 60))
  await sendSms(phone, `[뭐든해줌] 인증번호 ${code} (${ttlMinutes}분 내 입력)`, {
    purpose: 'phone_otp',
    otpId: String(created.id),
  })

  return { phone, ttlSeconds: otpEnv.ttlSeconds }
}

export async function requestPhoneOtp(userId: string, phoneInput: string, request: Request) {
  const phone = normalizePhone(phoneInput)
  await assertPhoneAvailable(phone, userId)
  return createPhoneOtp({ userId }, phone, request)
}

export async function requestSignupPhoneOtp(signupDraftId: string, phoneInput: string, request: Request) {
  const phone = normalizePhone(phoneInput)
  await assertPhoneAvailable(phone)
  return createPhoneOtp({ signupDraftId }, phone, request)
}

export async function requestLoginOtp(phoneInput: string, request: Request) {
  const phone = normalizePhone(phoneInput)
  const sql = getSql()
  const [user] = await sql`
    select id
    from ${sql(schema)}.users
    where phone = ${phone}
      and phone_verified = true
      and withdrawn_at is null
    limit 1
  `

  if (!user?.id) throw new HttpError('가입된 계정을 찾을 수 없습니다.', 404)
  return createPhoneOtp({ userId: String(user.id) }, phone, request)
}

export async function confirmLoginOtp(phoneInput: string, codeInput: string) {
  const phone = normalizePhone(phoneInput)
  const sql = getSql()
  const [otp] = await sql`
    select user_id
    from ${sql(schema)}.phone_otps
    where phone = ${phone}
      and user_id is not null
      and verified_at is null
    order by created_at desc
    limit 1
  `

  if (!otp?.userId) throw new HttpError('인증번호를 먼저 요청해주세요.', 400)

  return confirmPhoneOtp(String(otp.userId), phone, codeInput)
}

async function verifyOtpByOwner(
  owner: { userId?: string | null; signupDraftId?: string | null },
  phoneInput: string,
  codeInput: string,
) {
  const phone = normalizePhone(phoneInput)
  const code = onlyDigits(codeInput)
  if (!/^\d{6}$/.test(code)) throw new HttpError('인증번호 6자리를 입력해주세요.', 400)

  const sql = getSql()
  const otpEnv = getOtpEnv()
  const signupDraftId = owner.signupDraftId ?? null

  const [otp] = owner.userId
    ? await sql`
        select *
        from ${sql(schema)}.phone_otps
        where user_id = ${owner.userId}
          and phone = ${phone}
          and verified_at is null
        order by created_at desc
        limit 1
      `
    : await sql`
        select *
        from ${sql(schema)}.phone_otps
        where signup_draft_id = ${signupDraftId}
          and phone = ${phone}
          and verified_at is null
        order by created_at desc
        limit 1
      `

  if (!otp) throw new HttpError('인증번호를 먼저 요청해주세요.', 400)
  if (new Date(otp.expiresAt).getTime() < Date.now()) throw new HttpError('인증번호가 만료되었습니다.', 400)
  if (Number(otp.attempts) >= otpEnv.maxAttempts) throw new HttpError('인증번호 입력 횟수를 초과했습니다.', 429)

  if (otp.codeHash !== hashOtp(phone, code)) {
    await sql`
      update ${sql(schema)}.phone_otps
      set attempts = attempts + 1
      where id = ${otp.id}
    `
    throw new HttpError('인증번호가 일치하지 않습니다.', 400)
  }

  await sql`
    update ${sql(schema)}.phone_otps
    set verified_at = now()
    where id = ${otp.id}
  `

  return { phone, verified: true }
}

export async function verifyPhoneOtpCode(userId: string, phoneInput: string, codeInput: string) {
  return verifyOtpByOwner({ userId }, phoneInput, codeInput)
}

export async function verifySignupPhoneOtp(signupDraftId: string, phoneInput: string, codeInput: string) {
  return verifyOtpByOwner({ signupDraftId }, phoneInput, codeInput)
}

export async function confirmPhoneOtp(userId: string, phoneInput: string, codeInput: string) {
  const phone = normalizePhone(phoneInput)
  await assertPhoneAvailable(phone, userId)
  await verifyPhoneOtpCode(userId, phone, codeInput)
  const sql = getSql()

  const [user] = await sql`
    update ${sql(schema)}.users
    set phone = ${phone},
        phone_verified = true,
        phone_verified_at = now(),
        updated_at = now()
    where id = ${userId}
    returning *
  `

  return user
}

export async function assertPhoneVerified(userId: string) {
  const sql = getSql()
  const [user] = await sql`
    select phone_verified
    from ${sql(schema)}.users
    where id = ${userId}
    limit 1
  `

  if (!user?.phoneVerified) {
    throw new HttpError('휴대폰 인증 후 이용할 수 있습니다.', 403)
  }
}
