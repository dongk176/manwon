import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearSession, fetchSession, getAccessToken, login, logout as apiLogout } from '@/api/client'
import type { Profile } from '@/types/manwon'

interface AuthContextValue {
  profile: Profile | null
  loading: boolean
  signedIn: boolean
  signIn: (input: { loginId: string; password: string }) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    const token = await getAccessToken()
    if (!token) {
      setProfile(null)
      return
    }
    const session = await fetchSession()
    setProfile(session.authenticated ? session.profile : null)
    if (!session.authenticated) await clearSession()
  }

  useEffect(() => {
    let cancelled = false
    refresh()
      .catch(() => {
        if (!cancelled) setProfile(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    profile,
    loading,
    signedIn: Boolean(profile),
    signIn: async (input) => {
      const result = await login(input)
      if (result.mode !== 'signed_in') throw new Error('가입이 완료되지 않은 계정입니다.')
      setProfile(result.profile)
    },
    signOut: async () => {
      await apiLogout()
      setProfile(null)
    },
    refresh,
  }), [loading, profile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider.')
  return value
}
