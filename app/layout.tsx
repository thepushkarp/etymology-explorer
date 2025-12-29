import type { Metadata } from 'next'
import { Libre_Baskerville } from 'next/font/google'
import './globals.css'

const libreBaskerville = Libre_Baskerville({
  variable: '--font-libre-baskerville',
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  title: 'Etymology Explorer',
  description:
    'Discover the roots and origins of words. Explore Latin, Greek, and other etymological roots to deepen your vocabulary.',
  keywords: [
    'etymology',
    'word origins',
    'vocabulary',
    'GRE',
    'TOEFL',
    'word roots',
    'Latin',
    'Greek',
  ],
  authors: [{ name: 'Etymology Explorer' }],
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'Etymology Explorer',
    description: 'Discover the roots and origins of words',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Etymology Explorer',
    description: 'Discover the roots and origins of words',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${libreBaskerville.variable} min-h-screen`}>{children}</body>
    </html>
  )
}
