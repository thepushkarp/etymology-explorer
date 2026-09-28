import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'

interface PageFrameProps {
  title: string
  subtitle?: string
  children: ReactNode
}

export function PageFrame({ title, subtitle, children }: PageFrameProps) {
  return (
    <>
      <SiteHeader searchLanguage="en" />
      <main className="mx-auto w-full max-w-3xl px-4 pt-16 sm:px-6 sm:pt-20">
        <header className="animate-rise mb-12">
          <h1 className="font-serif text-4xl leading-tight tracking-tight text-ink sm:text-5xl">
            {title}
          </h1>
          {subtitle && <p className="mt-4 font-serif text-lg italic text-muted">{subtitle}</p>}
        </header>
        {children}
      </main>
      <SiteFooter />
    </>
  )
}
