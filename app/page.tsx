import { Suspense } from 'react'
import { ExploreExperience } from '@/components/ExploreExperience'

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-cream">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-charcoal/20 border-t-charcoal" />
            <p className="font-serif italic text-charcoal-light">Loading the archive...</p>
          </div>
        </main>
      }
    >
      <ExploreExperience />
    </Suspense>
  )
}
