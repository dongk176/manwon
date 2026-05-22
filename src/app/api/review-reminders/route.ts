import { NextRequest } from 'next/server'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { getDueReviewReminder, scheduleReviewReminder } from '@/server/manwonService'
import { reviewReminderSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    return ok(await getDueReviewReminder(userId))
  } catch (error) {
    return toHttpError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request)
    const input = reviewReminderSchema.parse(await request.json())
    return ok(await scheduleReviewReminder(userId, input), { status: 201 })
  } catch (error) {
    return toHttpError(error)
  }
}
