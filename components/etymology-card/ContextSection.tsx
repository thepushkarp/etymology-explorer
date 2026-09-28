import { Section } from './Section'

export function ContextSection({ extract, url }: { extract: string; url?: string }) {
  if (!extract.trim()) return null
  return (
    <Section id="entry-context" title="Context">
      <details className="group">
        <summary className="cursor-pointer list-none text-sm text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Read the Wikipedia summary</span>
          <span className="hidden group-open:inline">Hide the Wikipedia summary</span>
        </summary>
        <div className="animate-rise mt-4 max-w-2xl">
          <p className="font-serif leading-relaxed text-ink">{extract}</p>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="link mt-3 inline-block text-sm text-muted"
            >
              Wikipedia
            </a>
          )}
        </div>
      </details>
    </Section>
  )
}
