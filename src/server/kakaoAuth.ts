import { getSql } from '@/server/db'
import { HttpError } from '@/server/http'

const schema = 'manwon_happiness'

export interface KakaoProfile {
  kakaoId: string
  email: string | null
  nickname: string | null
  avatarUrl: string | null
}

function fallbackDisplayName(profile: KakaoProfile) {
  return profile.nickname?.trim() || `카카오 사용자 ${profile.kakaoId.slice(-4)}`
}

export async function signInWithKakao(profile: KakaoProfile) {
  if (!profile.kakaoId) throw new HttpError('카카오 계정 정보를 확인할 수 없습니다.', 400)

  const sql = getSql()
  const displayName = fallbackDisplayName(profile)

  const [user] = await sql`
    insert into ${sql(schema)}.users (
      kakao_id,
      kakao_email,
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
      ${displayName},
      ${displayName},
      ${profile.avatarUrl},
      true,
      now(),
      now()
    )
    on conflict (kakao_id) where withdrawn_at is null do update
    set kakao_email = excluded.kakao_email,
        avatar_url = coalesce(excluded.avatar_url, ${sql(schema)}.users.avatar_url),
        phone_verified = true,
        phone_verified_at = coalesce(${sql(schema)}.users.phone_verified_at, now()),
        last_login_at = now(),
        updated_at = now()
    returning *
  `

  if (!user) throw new HttpError('카카오 로그인 처리에 실패했습니다.', 500)
  return user
}
