import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  trailingSlash: false,
  outputFileTracingIncludes: {
    '/api/lexeme/resolve': ['./data/jmdict/**/*', './data/wold-ja.json'],
    '/api/etymology': ['./data/jmdict/**/*', './data/wold-ja.json'],
    '/api/pronunciation': ['./data/jmdict/**/*', './data/wold-ja.json'],
    '/word/**': ['./data/jmdict/**/*', './data/wold-ja.json'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
