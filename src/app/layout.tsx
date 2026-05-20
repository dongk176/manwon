import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '만원부탁소',
  description: '작은 부탁 거래앱',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
