'use client'

import { useRouter } from 'next/navigation'
import { OfferRegistrationFlow } from '@/components/RegisterScreens'

export default function OfferRegisterPage() {
  const router = useRouter()

  return <OfferRegistrationFlow onExit={() => router.push('/register')} onRegistered={() => router.push('/')} />
}
