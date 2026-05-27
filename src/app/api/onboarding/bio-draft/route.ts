import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { getOpenAiApiKey } from '@/server/openai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const openAiChatCompletionsUrl = 'https://api.openai.com/v1/chat/completions'
const minBioLength = 20
const maxBioLength = 60

function normalizeBio(value: unknown) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[#"“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxBioLength)
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request)
    const apiKey = getOpenAiApiKey()
    if (!apiKey) throw new Error('OPENAI_API_KEY가 설정되어 있지 않습니다.')

    const model = 'gpt-4.1-nano'
    const response = await fetch(openAiChatCompletionsUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        max_tokens: 80,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: '너는 "뭐든해줌" 이라는 부탁 거래앱에서 사용자의 소개를 써야해. 응답은 반드시 {"bio":"..."} 형식의 JSON 객체로만 한다.',
          },
          {
            role: 'user',
            content: [
              '친근한 존댓말로 써줘',
              '30~60자 정도로, 너무 딱딱하지 않게 자연스럽게 써줘.',
            ].join('\n'),
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI 요청에 실패했습니다. (${response.status})`)
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error('AI 응답이 비어 있습니다.')

    const parsed = JSON.parse(content) as { bio?: unknown }
    const bio = normalizeBio(parsed.bio)
    if (bio.length < minBioLength) throw new Error('AI 소개 문구를 만들지 못했습니다.')

    return ok({ bio })
  } catch (error) {
    return toHttpError(error)
  }
}
