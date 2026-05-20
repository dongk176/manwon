import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export class HttpError extends Error {
  status: number
  details?: unknown

  constructor(message: string, status = 400, details?: unknown) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.details = details
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init)
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, details }, { status })
}

export function toHttpError(error: unknown) {
  if (error instanceof HttpError) {
    return fail(error.message, error.status, error.details)
  }

  if (error instanceof Error && error.message === 'UNAUTHORIZED') {
    return fail('로그인이 필요합니다.', 401)
  }

  if (error instanceof ZodError) {
    return fail('입력값을 확인해주세요.', 400, error.flatten())
  }

  const message = error instanceof Error ? error.message : '요청 처리 중 오류가 발생했습니다.'
  return fail(message, 500)
}
