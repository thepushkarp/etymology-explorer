import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { LineageSkeleton, Section, Skeleton } from '@/components/etymology-card/Section'

export default function WordPageLoading() {
  return (
    <>
      <SiteHeader showSearch />
      <main className="mx-auto w-full max-w-3xl px-4 pt-14 sm:px-6 sm:pt-20">
        <article aria-busy="true" aria-label="Loading word entry">
          <header>
            <div aria-hidden="true" className="shimmer h-12 w-48 rounded-sm sm:h-16 sm:w-64" />
            <div aria-hidden="true" className="mt-4 flex items-center gap-3">
              <div className="shimmer h-4 w-24 rounded-sm" />
              <div className="shimmer h-4 w-14 rounded-sm" />
            </div>
            <div aria-hidden="true" className="mt-4 flex gap-8 border-b border-rule pb-3">
              <div className="shimmer h-3 w-16 rounded-sm" />
              <div className="shimmer h-3 w-14 rounded-sm" />
            </div>
            <div className="mt-5">
              <Skeleton widths={['w-11/12', 'w-2/3']} />
            </div>
          </header>

          <Section title="Lineage">
            <LineageSkeleton />
          </Section>

          <Section title="The story">
            <Skeleton widths={['w-full', 'w-11/12', 'w-full', 'w-3/5']} />
          </Section>
        </article>
      </main>
      <SiteFooter />
    </>
  )
}
