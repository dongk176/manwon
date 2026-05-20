import { SolapiMessageService } from 'solapi'
import { getSolapiEnv } from '@/server/env'

let service: SolapiMessageService | null = null

function getClient() {
  if (!service) {
    const { apiKey, apiSecret } = getSolapiEnv()
    service = new SolapiMessageService(apiKey, apiSecret)
  }

  return service
}

export async function sendSms(toDigits: string, text: string, customFields?: Record<string, string>) {
  const { senderNumber } = getSolapiEnv()
  const to = toDigits.replace(/\D/g, '')

  if (to.length < 10 || senderNumber.length < 10) {
    throw new Error('INVALID_PHONE_NUMBER')
  }

  try {
    return await getClient().send({
      to,
      from: senderNumber,
      text,
      ...(customFields ? { customFields } : {}),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SOLAPI_SEND_FAILED'
    console.error('[solapi.send] failed:', message)
    throw new Error('SMS_SEND_FAILED')
  }
}
