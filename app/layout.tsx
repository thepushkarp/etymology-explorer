import type { Metadata } from 'next'
import { Libre_Baskerville } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { JsonLd } from '@/components/JsonLd'
import './globals.css'

const libreBaskerville = Libre_Baskerville({
  variable: '--font-libre-baskerville',
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  metadataBase: new URL('https://etymology.thepushkarp.com'),
  title: {
    default: 'Etymology Explorer - Discover Word Origins',
    template: '%s | Etymology Explorer',
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
    title: 'Etymology Explorer - Discover Word Origins',
    description:
      'Visual etymology explorer with word history, linguistic roots, and historical connections.',
    url: '/',
    siteName: 'Etymology Explorer',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: '/og',
        width: 1200,
        height: 630,
        alt: 'Etymology Explorer - Discover Word Origins',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Etymology Explorer - Discover Word Origins',
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
            __html: `(function(){try{var t=localStorage.getItem('theme-preference');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);if(d){var r=document.documentElement;r.classList.add('dark');var p=localStorage.getItem('dark-palette');if(p==='slate'||p==='neutral'||p==='warm')r.classList.add('dark-'+p);else r.classList.add('dark-warm')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${libreBaskerville.variable} min-h-screen`}>
        <JsonLd />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
