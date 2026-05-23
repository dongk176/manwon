import { getSql } from '@/server/db'
import { HttpError } from '@/server/http'

const schema = 'manwon_happiness'

export interface KakaoProfile {
  kakaoId: string
  email: string | null
  nickname: string | null
  avatarUrl: string | null
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
    profile?: {
      nickname?: string
      profile_image_url?: string
      thumbnail_image_url?: string
    }
  }
}

function fallbackDisplayName(profile: KakaoProfile) {
  return profile.nickname?.trim() || `카카오 사용자 ${profile.kakaoId.slice(-4)}`
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
    avatarUrl: user.kakao_account?.profile?.profile_image_url ?? user.properties?.profile_image ?? null,
  }
}

export async function signInWithKakao(profile: KakaoProfile) {
  if (!profile.kakaoId) throw new HttpError('카카오 계정 정보를 확인할 수 없습니다.', 400)

  const sql = getSql()
  const displayName = fallbackDisplayName(profile)

  const [user] = await sql`
    insert into ${sql(schema)}.users (
      kakao_id,
      kakao_email,
      kakao_nickname,
      kakao_avatar_url,
      nickname,
      display_name,
      avatar_url,
      phone_verified,
      phone_verified_at,
      last_login_at
    )
    values (
      ${profile.kakaoId},
      ${profile.email},
      ${profile.nickname},
      ${profile.avatarUrl},
      ${displayName},
      ${displayName},
      ${profile.avatarUrl},
      false,
      null,
      now()
    )
    on conflict (kakao_id) where kakao_id is not null and withdrawn_at is null do update
    set kakao_email = excluded.kakao_email,
        kakao_nickname = excluded.kakao_nickname,
        kakao_avatar_url = excluded.kakao_avatar_url,
        nickname = case
          when ${sql(schema)}.users.profile_onboarding_completed then ${sql(schema)}.users.nickname
          else coalesce(excluded.kakao_nickname, ${sql(schema)}.users.nickname)
        end,
        display_name = case
          when ${sql(schema)}.users.profile_onboarding_completed then ${sql(schema)}.users.display_name
          else coalesce(excluded.display_name, ${sql(schema)}.users.display_name)
        end,
        avatar_url = case
          when ${sql(schema)}.users.profile_onboarding_completed then ${sql(schema)}.users.avatar_url
          else coalesce(excluded.kakao_avatar_url, ${sql(schema)}.users.avatar_url)
        end,
        last_login_at = now(),
        updated_at = now()
    returning *
  `

  if (!user) throw new HttpError('카카오 로그인 처리에 실패했습니다.', 500)
  return user
}
