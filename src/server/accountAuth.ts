import { getSql } from '@/server/db'
import { HttpError } from '@/server/http'
import { hashPassword, verifyPassword } from '@/server/password'
import { confirmPhoneOtp, normalizePhone, requestPhoneOtp } from '@/server/phoneVerification'
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
  const [profile] = await sql`
    select *
    from ${sql(schema)}.profiles
    where login_id = ${input.loginId}
      and withdrawn_at is null
    limit 1
  `

  if (!profile) return { mode: 'signup_required' as const }

  if (!verifyPassword(input.password, profile.passwordHash)) {
    throw new HttpError('아이디 또는 비밀번호를 확인해주세요.', 401)
  }

  if (!profile.phoneVerified) {
    return { mode: 'signup_required' as const, resume: true }
  }

  const [updated] = await sql`
    update ${sql(schema)}.profiles
    set last_login_at = now(),
        updated_at = now()
    where id = ${profile.id}
    returning *
  `

  return {
    mode: 'signed_in' as const,
    profile: updated,
  }
}

export async function checkSignupLoginId(input: SignupLoginIdCheckInput) {
  const sql = getSql()
  const [profile] = await sql`
    select id
    from ${sql(schema)}.profiles
    where login_id = ${input.loginId}
      and withdrawn_at is null
    limit 1
  `

  return { available: !profile }
}

export async function requestSignupOtp(input: SignupOtpRequestInput, request: Request) {
  assertRequiredAgreements(input.agreements)

  const phone = normalizePhone(input.phone)
  const birthDate = parseBirthDate(input.birthDate)
  const sql = getSql()

  const userId = await sql.begin(async (tx) => {
    const [existingLogin] = await tx`
      select id, password_hash, phone_verified
      from ${sql(schema)}.profiles
      where login_id = ${input.loginId}
        and withdrawn_at is null
      limit 1
    `

    if (existingLogin && !verifyPassword(input.password, existingLogin.passwordHash)) {
      throw new HttpError('이미 사용 중인 아이디입니다.', 409)
    }

    const [phoneOwner] = await tx`
      select id
      from ${sql(schema)}.profiles
      where phone = ${phone}
        and (${existingLogin?.id ?? null}::uuid is null or id <> ${existingLogin?.id ?? null})
        and withdrawn_at is null
      limit 1
    `
    if (phoneOwner) throw new HttpError('이미 가입된 휴대폰 번호입니다.', 409)

    const agreementTimestamp = new Date()
    const passwordHash = existingLogin?.passwordHash && verifyPassword(input.password, existingLogin.passwordHash)
      ? existingLogin.passwordHash
      : hashPassword(input.password)

    const [profile] = existingLogin
      ? await tx`
          update ${sql(schema)}.profiles
          set nickname = ${input.name},
              display_name = ${input.name},
              gender = ${input.gender}::manwon_happiness.gender_type,
              login_id = ${input.loginId},
              password_hash = ${passwordHash},
              birth_date = ${birthDate}::date,
              phone = ${phone},
              terms_agreed_at = coalesce(terms_agreed_at, ${agreementTimestamp}),
              privacy_agreed_at = coalesce(privacy_agreed_at, ${agreementTimestamp}),
              marketing_agreed_at = case when ${input.agreements.marketing} then coalesce(marketing_agreed_at, ${agreementTimestamp}) else marketing_agreed_at end,
              updated_at = now()
          where id = ${existingLogin.id}
          returning id
        `
      : await tx`
          insert into ${sql(schema)}.profiles (
            nickname,
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

    return String(profile.id)
  })

  return requestPhoneOtp(userId, phone, request)
}

export async function confirmSignupOtp(input: SignupOtpConfirmInput) {
  const phone = normalizePhone(input.phone)
  const sql = getSql()
  const [profile] = await sql`
    select id, password_hash
    from ${sql(schema)}.profiles
    where login_id = ${input.loginId}
      and phone = ${phone}
      and withdrawn_at is null
    limit 1
  `

  if (!profile || !verifyPassword(input.password, profile.passwordHash)) {
    throw new HttpError('가입 정보를 확인해주세요.', 401)
  }

  const verifiedProfile = await confirmPhoneOtp(String(profile.id), phone, input.code)

  const [updated] = await sql`
    update ${sql(schema)}.profiles
    set last_login_at = now(),
        updated_at = now()
    where id = ${profile.id}
    returning *
  `

  return updated ?? verifiedProfile
}
