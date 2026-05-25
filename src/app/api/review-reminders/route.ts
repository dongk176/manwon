import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await requireUser(request)
    return ok(null)
  } catch (error) {
    return toHttpError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request)
    await request.json().catch(() => null)
    return ok(null, { status: 201 })
  } catch (error) {
    return toHttpError(error)
  }
}
