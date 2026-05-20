import { AppShell } from '@/components/AppShell'

export default function AppRouteLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <AppShell>{children}</AppShell>
}
