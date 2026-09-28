import type { ModernUsage } from '@/lib/types'
import { Section } from './Section'

export function ModernUsageSection({
  modernUsage,
  title,
}: {
  modernUsage: ModernUsage
  title: string
}) {
  const { slangDefinition, popularizedBy, contexts, notableReferences } = modernUsage
  return (
    <Section title={title}>
      {slangDefinition && (
        <p className="max-w-2xl font-serif text-lg leading-relaxed text-ink">{slangDefinition}</p>
      )}
      <dl className="mt-4 space-y-2 text-sm text-muted">
        {popularizedBy && <Row term="Popularized by">{popularizedBy}</Row>}
        {contexts && contexts.length > 0 && <Row term="Heard in">{contexts.join(' · ')}</Row>}
        {notableReferences && notableReferences.length > 0 && (
          <Row term="See">{notableReferences.slice(0, 3).join('; ')}</Row>
        )}
      </dl>
    </Section>
  )
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0">{term}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  )
}
