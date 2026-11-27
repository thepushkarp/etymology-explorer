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
    <div aria-hidden="true" className="max-w-prose space-y-3">
      {widths.map((width, index) => (
        <div key={index} className={`shimmer h-3.5 rounded-sm ${width}`} />
      ))}
    </div>
  )
}

export function LineageSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col items-center">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex w-full flex-col items-center">
          {index > 0 && <div className="h-5 w-px bg-rule sm:h-7" />}
          <div className="flex w-full max-w-60 flex-col items-center gap-2 border border-rule bg-paper px-4 py-3">
            <div className="shimmer h-2.5 w-20 rounded-sm" />
            <div className="shimmer h-5 w-24 rounded-sm" />
            <div className="shimmer h-3 w-32 rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  )
}
