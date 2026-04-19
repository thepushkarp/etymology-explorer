import Link from 'next/link'
import { ReactNode } from 'react'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'

interface EditorialPageFrameProps {
  title: string
  eyebrow: string
  subtitle?: string
  children: ReactNode
}

export function EditorialPageFrame({
  title,
  eyebrow,
  subtitle,
  children,
}: EditorialPageFrameProps) {
  return (
    <div className="min-h-screen bg-cream text-charcoal">
      <SiteHeader compact />
      <main className="mx-auto max-w-[1180px] px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pt-14">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-charcoal-light/72 transition-colors hover:text-charcoal"
        >
          <span aria-hidden="true">←</span>
          <span>Back to explorer</span>
        </Link>

        <header className="mt-8 max-w-3xl pb-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/66">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-serif text-5xl tracking-[-0.05em] text-charcoal sm:text-6xl lg:text-[4.8rem]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-5 max-w-2xl font-serif text-xl italic leading-relaxed text-charcoal-light sm:text-[1.7rem]">
              {subtitle}
            </p>
          )}
          <div className="editorial-double-rule mt-8" />
        </header>

        <div className="pt-10">{children}</div>
      </main>
      <SiteFooter />
    </div>
  )
}
