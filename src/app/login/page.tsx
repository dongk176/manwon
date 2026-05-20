import { Suspense } from 'react'
import { LoginScreen } from '@/components/LoginScreen'

export default function LoginPage() {
  return (
    <main className="app-shell auth-shell login-shell">
      <div className="app-content">
        <Suspense fallback={<div className="screen login-screen" />}>
          <LoginScreen />
        </Suspense>
      </div>
    </main>
  )
}
