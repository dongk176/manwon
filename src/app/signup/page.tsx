import { Suspense } from 'react'
import { SignupScreen } from '@/components/LoginScreen'

export default function SignupPage() {
  return (
    <main className="app-shell auth-shell signup-shell">
      <div className="app-content">
        <Suspense fallback={<div className="screen signup-screen" />}>
          <SignupScreen />
        </Suspense>
      </div>
    </main>
  )
}
