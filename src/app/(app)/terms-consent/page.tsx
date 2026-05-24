import { Suspense } from 'react'
import { TermsConsentScreen } from '@/components/TermsConsentScreen'

export default function TermsConsentPage() {
  return (
    <Suspense fallback={<section className="screen terms-consent-screen" />}>
      <TermsConsentScreen />
    </Suspense>
  )
}
