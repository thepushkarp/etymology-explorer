import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { JsonLd } from '@/components/JsonLd'
import { SITE_SHORT_NAME, SITE_ORIGIN } from '@/lib/site'
import './globals.css'

const libreBaskerville = localFont({
  variable: '--font-libre-baskerville',
  display: 'swap',
  src: [
    { path: '../public/fonts/LibreBaskerville-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/LibreBaskerville-Italic.woff2', weight: '400', style: 'italic' },
  ],
})

const alegreyaSans = localFont({
  variable: '--font-alegreya-sans',
  display: 'swap',
  src: [{ path: '../public/fonts/AlegreyaSans-Regular.woff2', weight: '400', style: 'normal' }],
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: `${SITE_SHORT_NAME} - Discover Word Origins`,
    template: `%s | ${SITE_SHORT_NAME}`,
  },
  description:
    'Trace any word back to its roots. EtymEx follows each word through the languages it passed through, with a lineage tree and the sources behind every step.',
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
    description: 'Trace any word back to its roots, one language at a time.',
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
    description: 'Trace any word back to its roots, one language at a time.',
    images: ['/og'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${libreBaskerville.variable} ${alegreyaSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme-preference');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col" suppressHydrationWarning>
        <JsonLd />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
