import { redirect } from 'next/navigation'
import { HomeScreen } from '@/components/HomeScreen'

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const tab = getParam(params, 'tab')
  const register = getParam(params, 'register')

  if (tab === 'chat') redirect('/chat')
  if (tab === 'register' && register === 'ask') redirect('/register/request')
  if (tab === 'register' && register === 'offer') redirect('/register/offer')
  if (tab === 'register') redirect('/register')
  if (tab === 'nearby' || tab === 'activity') redirect('/activity')
  if (tab === 'my') redirect('/my')

  return <HomeScreen showOnboardingWelcome={getParam(params, 'welcome') === '1'} />
}

function getParam(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = params?.[key]
  return Array.isArray(value) ? value[0] : value
}
