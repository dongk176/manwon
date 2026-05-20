'use client'

import { useRouter } from 'next/navigation'
import { RequestRegistrationFlow } from '@/components/RegisterScreens'

export default function RequestRegisterPage() {
  const router = useRouter()

  return <RequestRegistrationFlow onExit={() => router.push('/register')} onRegistered={() => router.push('/')} />
}
