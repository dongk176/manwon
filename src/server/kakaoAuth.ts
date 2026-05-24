import { getSql } from '@/server/db'
import { HttpError } from '@/server/http'

const schema = 'manwon_happiness'

export interface KakaoProfile {
  kakaoId: string
  email: string | null
  nickname: string | null
  avatarUrl: string | null
  name: string | null
  gender: 'male' | 'female' | null
  birthDate: string | null
  phoneNumber: string | null
}

interface KakaoUserResponse {
  id?: number | string
  properties?: {
    nickname?: string
    profile_image?: string
    thumbnail_image?: string
  }
  kakao_account?: {
    email?: string
    name?: string
    gender?: string
    birthday?: string
    birthyear?: string
    phone_number?: string
    profile?: {
      nickname?: string
      profile_image_url?: string
      thumbnail_image_url?: string
    }
  }
}

function fallbackDisplayName(profile: KakaoProfile) {
  return profile.nickname?.trim() || profile.name?.trim() || `카카오 사용자 ${profile.kakaoId.slice(-4)}`
}

function normalizeKakaoImageUrl(value?: string | null) {
  const imageUrl = value?.trim()
  if (!imageUrl) return null

  try {
    const url = new URL(imageUrl)
    const host = url.hostname.toLowerCase()
    if (url.protocol === 'http:' && (host === 'k.kakaocdn.net' || host.endsWith('.kakaocdn.net'))) {
      url.protocol = 'https:'
      return url.toString()
    }
  } catch {
    return imageUrl
  }

  return imageUrl
}

function normalizeKakaoGender(value?: string) {
  if (value === 'male' || value === 'female') return value
  return null
}

function normalizeKakaoPhone(value?: string) {
  if (!value) return null
  const compact = value.replace(/[\s-]/g, '')
  const local = compact.startsWith('+82') ? `0${compact.slice(3)}` : compact.startsWith('82') ? `0${compact.slice(2)}` : compact
  const digits = local.replace(/\D/g, '')
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null
}

function normalizeKakaoBirthDate(birthyear?: string, birthday?: string) {
  if (!/^\d{4}$/.test(birthyear ?? '') || !/^\d{4}$/.test(birthday ?? '')) return null
  const value = `${birthyear}${birthday}`
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6))
  const day = Number(value.slice(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

export async function getKakaoProfile(accessToken: string): Promise<KakaoProfile> {
  const response = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  })

  if (!response.ok) throw new HttpError('카카오 계정 정보를 가져오지 못했습니다.', 502)
  const user = await response.json() as KakaoUserResponse
  if (user.id === undefined || user.id === null) throw new HttpError('카카오 계정 식별값이 없습니다.', 502)

  return {
    kakaoId: String(user.id),
    email: user.kakao_account?.email ?? null,
    nickname: user.kakao_account?.profile?.nickname ?? user.properties?.nickname ?? null,
    avatarUrl: normalizeKakaoImageUrl(user.kakao_account?.profile?.profile_image_url ?? user.properties?.profile_image),
    name: user.kakao_account?.name ?? null,
    gender: normalizeKakaoGender(user.kakao_account?.gender),
    birthDate: normalizeKakaoBirthDate(user.kakao_account?.birthyear, user.kakao_account?.birthday),
    phoneNumber: normalizeKakaoPhone(user.kakao_account?.phone_number),
  }
}

export async function signInWithKakao(profile: KakaoProfile) {
  if (!profile.kakaoId) throw new HttpError('카카오 계정 정보를 확인할 수 없습니다.', 400)

  const sql = getSql()
  const displayName = fallbackDisplayName(profile)
  const [existingUser] = await sql`
    select id
    from ${sql(schema)}.users
    where kakao_id = ${profile.kakaoId}
      and withdrawn_at is null
    limit 1
  `
  const [phoneOwner] = profile.phoneNumber
    ? await sql`
        select id
        from ${sql(schema)}.users
        where phone = ${profile.phoneNumber}
          and withdrawn_at is null
        limit 1
      `
    : []
  const canUsePhoneForVerification = Boolean(profile.phoneNumber && (!phoneOwner || String(phoneOwner.id) === String(existingUser?.id)))
  const verifiedPhone = canUsePhoneForVerification ? profile.phoneNumber : null

  const [user] = await sql`
    insert into ${sql(schema)}.users (
      kakao_id,
      kakao_email,
      nickname,
      display_name,
      avatar_url,
      gender,
      birth_date,
      phone,
      phone_verified,
      phone_verified_at,
      last_login_at
    )
    values (
      ${profile.kakaoId},
      ${profile.email},
      ${displayName},
      ${displayName},
      ${profile.avatarUrl},
      ${profile.gender ?? 'unknown'},
      ${profile.birthDate}::date,
      ${verifiedPhone},
      ${Boolean(verifiedPhone)},
      ${verifiedPhone ? new Date() : null},
      now()
    )
    on conflict (kakao_id) where kakao_id is not null and withdrawn_at is null do update
    set kakao_email = excluded.kakao_email,
        nickname = case
          when ${sql(schema)}.users.profile_onboarding_completed then ${sql(schema)}.users.nickname
          else coalesce(${sql(schema)}.users.nickname, excluded.nickname)
        end,
        display_name = case
          when ${sql(schema)}.users.profile_onboarding_completed then ${sql(schema)}.users.display_name
          else coalesce(${sql(schema)}.users.display_name, excluded.display_name)
        end,
        avatar_url = case
          when ${sql(schema)}.users.profile_onboarding_completed then coalesce(${sql(schema)}.users.avatar_url, excluded.avatar_url)
          else coalesce(${sql(schema)}.users.avatar_url, excluded.avatar_url)
        end,
        gender = case
          when ${sql(schema)}.users.profile_onboarding_completed then ${sql(schema)}.users.gender
          when ${sql(schema)}.users.gender::text = 'unknown' and excluded.gender::text <> 'unknown' then excluded.gender
          else ${sql(schema)}.users.gender
        end,
        birth_date = case
          when ${sql(schema)}.users.profile_onboarding_completed then ${sql(schema)}.users.birth_date
          else coalesce(${sql(schema)}.users.birth_date, excluded.birth_date)
        end,
        phone = case
          when ${verifiedPhone}::text is not null and (${sql(schema)}.users.phone is null or ${sql(schema)}.users.phone = ${verifiedPhone}) then ${verifiedPhone}
          else ${sql(schema)}.users.phone
        end,
        phone_verified = case
          when ${verifiedPhone}::text is not null and (${sql(schema)}.users.phone is null or ${sql(schema)}.users.phone = ${verifiedPhone}) then true
          else ${sql(schema)}.users.phone_verified
        end,
        phone_verified_at = case
          when ${verifiedPhone}::text is not null and (${sql(schema)}.users.phone is null or ${sql(schema)}.users.phone = ${verifiedPhone}) then coalesce(${sql(schema)}.users.phone_verified_at, now())
          else ${sql(schema)}.users.phone_verified_at
        end,
        last_login_at = now(),
        updated_at = now()
    returning *
  `

  if (!user) throw new HttpError('카카오 로그인 처리에 실패했습니다.', 500)
  return user
}
