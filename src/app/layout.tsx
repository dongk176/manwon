import type { Metadata, Viewport } from 'next'
import './globals.css'
import { NativeIOSBridge } from '@/components/NativeIOSBridge'

export const metadata: Metadata = {
  title: '뭐든해줌',
  description: '작은 부탁 거래앱',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body>
        <NativeIOSBridge />
        {children}
      </body>
    </html>
  )
}
