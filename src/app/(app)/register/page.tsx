'use client'

import { useRouter } from 'next/navigation'
import { RegistrationTypeScreen, type RegisterKind } from '@/components/RegisterScreens'

export default function RegisterPage() {
  const router = useRouter()

  function openFlow(kind: RegisterKind) {
    router.push(`/register/${kind}`)
  }

  return <RegistrationTypeScreen onSelect={openFlow} />
}
