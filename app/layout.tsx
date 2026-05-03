import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { JsonLd } from '@/components/JsonLd'
import { SITE_SHORT_NAME, SITE_ORIGIN } from '@/lib/site'
import './globals.css'

const libreBaskerville = localFont({
  variable: '--font-libre-baskerville',
  src: [
    {
      path: '../public/fonts/LibreBaskerville-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/LibreBaskerville-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../public/fonts/LibreBaskerville-Italic.ttf',
      weight: '400',
      style: 'italic',
    },
  ],
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: `${SITE_SHORT_NAME} - Discover Word Origins`,
    template: `%s | ${SITE_SHORT_NAME}`,
  },
  description:
    'Explore the fascinating origins and history of English words. Visual etymology trees, linguistic connections, and historical context for thousands of words.',
  keywords: [
    'etymology',
    'word origins',
    'vocabulary',
    'GRE',
    'TOEFL',
    'word roots',
    'Latin',
    'Greek',
    'linguistics',
    'language history',
  ],
  authors: [{ name: 'Pushkar Patel', url: 'https://thepushkarp.com' }],
  creator: 'Pushkar Patel',
  icons: {
    icon: '/favicon.svg',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: `${SITE_SHORT_NAME} - Discover Word Origins`,
    description:
      'Visual etymology explorer with word history, linguistic roots, and historical connections.',
    url: '/',
    siteName: SITE_SHORT_NAME,
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: '/og',
        width: 1200,
        height: 630,
        alt: `${SITE_SHORT_NAME} - Discover Word Origins`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_SHORT_NAME} - Discover Word Origins`,
    description:
      'Visual etymology explorer with word history, linguistic roots, and historical connections.',
    images: ['/og'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme-preference');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${libreBaskerville.variable} min-h-screen`} suppressHydrationWarning>
        <JsonLd />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
