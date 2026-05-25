import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/auth'
import { ok, toHttpError } from '@/server/http'
import { setConversationAppointment } from '@/server/manwonService'
import { appointmentSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ id: z.string().uuid() })

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser(request)
    const { id } = paramsSchema.parse(await context.params)
    const input = appointmentSchema.parse(await request.json())
    return ok(await setConversationAppointment(userId, id, input))
  } catch (error) {
    return toHttpError(error)
  }
}
