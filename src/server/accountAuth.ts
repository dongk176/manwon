import { getSql } from '@/server/db'
import { HttpError } from '@/server/http'
import { hashPassword, verifyPassword } from '@/server/password'
import { normalizePhone, requestSignupPhoneOtp, verifySignupPhoneOtp } from '@/server/phoneVerification'
import type { loginCheckSchema, signupLoginIdCheckSchema, signupOtpConfirmSchema, signupOtpRequestSchema } from '@/server/validation'
import type { z } from 'zod'

type LoginCheckInput = z.infer<typeof loginCheckSchema>
type SignupLoginIdCheckInput = z.infer<typeof signupLoginIdCheckSchema>
type SignupOtpRequestInput = z.infer<typeof signupOtpRequestSchema>
type SignupOtpConfirmInput = z.infer<typeof signupOtpConfirmSchema>

const schema = 'manwon_happiness'

function parseBirthDate(value: string) {
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6))
  const day = Number(value.slice(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day))

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new HttpError('생년월일을 확인해주세요.', 400)
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function assertRequiredAgreements(input: SignupOtpRequestInput['agreements']) {
  if (!input.terms || !input.privacy) {
    throw new HttpError('필수 약관에 동의해주세요.', 400)
  }
}

export async function checkLoginCredential(input: LoginCheckInput) {
  const sql = getSql()
  const [user] = await sql`
    select *
    from ${sql(schema)}.users
    where login_id = ${input.loginId}
      and withdrawn_at is null
    limit 1
  `

  if (!user) return { mode: 'signup_required' as const }

  if (!verifyPassword(input.password, user.passwordHash)) {
    throw new HttpError('아이디 또는 비밀번호를 확인해주세요.', 401)
  }

  if (!user.phoneVerified) {
    return { mode: 'signup_required' as const, resume: true }
  }

  const [updated] = await sql`
    update ${sql(schema)}.users
    set last_login_at = now(),
        updated_at = now()
    where id = ${user.id}
    returning *
  `

  return {
    mode: 'signed_in' as const,
    profile: updated,
  }
}

export async function checkSignupLoginId(input: SignupLoginIdCheckInput) {
  const sql = getSql()
  const [user] = await sql`
    select id
    from ${sql(schema)}.users
    where login_id = ${input.loginId}
      and withdrawn_at is null
    limit 1
  `

  return { available: !user }
}

export async function requestSignupOtp(input: SignupOtpRequestInput, request: Request) {
  assertRequiredAgreements(input.agreements)

  const phone = normalizePhone(input.phone)
  const birthDate = parseBirthDate(input.birthDate)
  const sql = getSql()

  const draftId = await sql.begin(async (tx) => {
    await tx`
      delete from ${sql(schema)}.signup_drafts
      where expires_at <= now()
        or login_id = ${input.loginId}
        or phone = ${phone}
    `

    const [existingLogin] = await tx`
      select id
      from ${sql(schema)}.users
      where login_id = ${input.loginId}
        and withdrawn_at is null
      limit 1
    `
    if (existingLogin) throw new HttpError('이미 사용 중인 아이디입니다.', 409)

    const [phoneOwner] = await tx`
      select id
      from ${sql(schema)}.users
      where phone = ${phone}
        and withdrawn_at is null
      limit 1
    `
    if (phoneOwner) throw new HttpError('이미 가입된 휴대폰 번호입니다.', 409)

    const agreementTimestamp = new Date()
    const passwordHash = hashPassword(input.password)

    const [draft] = await tx`
      insert into ${sql(schema)}.signup_drafts (
        display_name,
        gender,
        login_id,
        password_hash,
        birth_date,
        phone,
        terms_agreed_at,
        privacy_agreed_at,
        marketing_agreed_at
      )
      values (
        ${input.name},
        ${input.gender}::manwon_happiness.gender_type,
        ${input.loginId},
        ${passwordHash},
        ${birthDate}::date,
        ${phone},
        ${agreementTimestamp},
        ${agreementTimestamp},
        ${input.agreements.marketing ? agreementTimestamp : null}
      )
      returning id
    `

    return String(draft.id)
  })

  return requestSignupPhoneOtp(draftId, phone, request)
}

async function getSignupDraft(input: SignupOtpRequestInput) {
  const phone = normalizePhone(input.phone)
  const sql = getSql()
  const [draft] = await sql`
    select *
    from ${sql(schema)}.signup_drafts
    where login_id = ${input.loginId}
      and phone = ${phone}
      and expires_at > now()
    order by created_at desc
    limit 1
  `

  if (!draft || !verifyPassword(input.password, draft.passwordHash)) {
    throw new HttpError('가입 정보를 확인해주세요.', 401)
  }

  return { phone, draft }
}

export async function verifySignupOtp(input: SignupOtpConfirmInput) {
  const { phone, draft } = await getSignupDraft(input)
  return verifySignupPhoneOtp(String(draft.id), phone, input.code)
}

export async function completeSignup(input: SignupOtpRequestInput) {
  const { phone, draft } = await getSignupDraft(input)
  const sql = getSql()

  const [verifiedOtp] = await sql`
    select id
    from ${sql(schema)}.phone_otps
    where signup_draft_id = ${draft.id}
      and phone = ${phone}
      and verified_at is not null
    order by verified_at desc
    limit 1
  `
  if (!verifiedOtp) throw new HttpError('인증번호 확인을 먼저 완료해주세요.', 400)

  const user = await sql.begin(async (tx) => {
    const [existingLogin] = await tx`
      select id
      from ${sql(schema)}.users
      where login_id = ${input.loginId}
        and withdrawn_at is null
      limit 1
    `
    if (existingLogin) throw new HttpError('이미 사용 중인 아이디입니다.', 409)

    const [phoneOwner] = await tx`
      select id
      from ${sql(schema)}.users
      where phone = ${phone}
        and withdrawn_at is null
      limit 1
    `
    if (phoneOwner) throw new HttpError('이미 가입된 휴대폰 번호입니다.', 409)

    const [created] = await tx`
      insert into ${sql(schema)}.users (
        nickname,
        display_name,
        gender,
        login_id,
        password_hash,
        birth_date,
        phone,
        phone_verified,
        phone_verified_at,
        terms_agreed_at,
        privacy_agreed_at,
        marketing_agreed_at,
        last_login_at
      )
      values (
        ${draft.displayName},
        ${draft.displayName},
        ${draft.gender}::manwon_happiness.gender_type,
        ${draft.loginId},
        ${draft.passwordHash},
        ${draft.birthDate}::date,
        ${phone},
        true,
        now(),
        ${draft.termsAgreedAt},
        ${draft.privacyAgreedAt},
        ${draft.marketingAgreedAt},
        now()
      )
      returning *
    `

    await tx`
      update ${sql(schema)}.phone_otps
      set user_id = ${created.id},
          signup_draft_id = null
      where signup_draft_id = ${draft.id}
    `

    await tx`
      delete from ${sql(schema)}.signup_drafts
      where id = ${draft.id}
    `

    return created
  })

  return user
}

export async function confirmSignupOtp(input: SignupOtpConfirmInput) {
  await verifySignupOtp(input)
  return completeSignup(input)
}
