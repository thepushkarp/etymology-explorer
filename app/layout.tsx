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

// Script-only faces stay dormant on Latin pages, including their preload links.
const notoSerifDevanagari = localFont({
  variable: '--font-noto-serif-devanagari',
  src: '../public/fonts/NotoSerifDevanagari-Regular.woff2',
  weight: '400',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0900-097F, U+1CD0-1CF4, U+1CF7-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF, U+11B00-11B0A',
    },
  ],
})

const notoNastaliqUrdu = localFont({
  variable: '--font-noto-nastaliq-urdu',
  src: '../public/fonts/NotoNastaliqUrdu-Regular.woff2',
  weight: '400',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0600-06FF, U+0750-077F, U+0870-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC, U+102E0-102FB, U+10E60-10E7E, U+10EC2-10EC7, U+10EC9-10EEE, U+10EF0-10EFF, U+1EE00-1EE03, U+1EE05-1EE1F, U+1EE21-1EE22, U+1EE24, U+1EE27, U+1EE29-1EE32, U+1EE34-1EE37, U+1EE39, U+1EE3B, U+1EE42, U+1EE47, U+1EE49, U+1EE4B, U+1EE4D-1EE4F, U+1EE51-1EE52, U+1EE54, U+1EE57, U+1EE59, U+1EE5B, U+1EE5D, U+1EE5F, U+1EE61-1EE62, U+1EE64, U+1EE67-1EE6A, U+1EE6C-1EE72, U+1EE74-1EE77, U+1EE79-1EE7C, U+1EE7E, U+1EE80-1EE89, U+1EE8B-1EE9B, U+1EEA1-1EEA3, U+1EEA5-1EEA9, U+1EEAB-1EEBB, U+1EEF0-1EEF1',
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
      className={`${libreBaskerville.variable} ${alegreyaSans.variable} ${notoSerifDevanagari.variable} ${notoNastaliqUrdu.variable}`}
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
