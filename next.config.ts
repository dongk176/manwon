import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    imageSizes: [16, 24, 32, 40, 48, 64, 80, 96, 128],
    qualities: [75, 100],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000,
    localPatterns: [
      {
        pathname: '/api/uploads/image',
      },
      {
        pathname: '/home%20icon/**',
      },
      {
        pathname: '/registration/**',
      },
    ],
  },
  serverExternalPackages: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner', 'postgres'],
}

export default nextConfig
