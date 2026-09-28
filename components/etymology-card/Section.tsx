import type { ReactNode } from 'react'

interface SectionProps {
  id?: string
  title: string
  children: ReactNode
}

export function Section({ id, title, children }: SectionProps) {
  return (
    <section id={id} className="animate-rise mt-16 scroll-mt-8">
      <h2 className="label mb-6">{title}</h2>
      {children}
    </section>
  )
}

/** Placeholder lines for a section that is still streaming in. */
export function Skeleton({ widths }: { widths: string[] }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      {widths.map((width, index) => (
        <div key={index} className={`h-3.5 animate-pulse rounded-sm bg-wash ${width}`} />
      ))}
    </div>
  )
}
