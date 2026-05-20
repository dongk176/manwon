import { fail } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function POST() {
  return fail('아이디와 비밀번호로 로그인해주세요.', 410)
}
