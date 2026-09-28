import type { BetaLanguageCode } from '@/lib/languages'
import { sourceLabel } from '@/lib/sourceLabels'
import type { SourceReference } from '@/lib/types'
import { Section } from './Section'

function groupByOrigin(sources: SourceReference[]) {
  const groups = new Map<string, SourceReference[]>()
  for (const source of sources) {
    groups.set(source.name, [...(groups.get(source.name) ?? []), source])
  }
  return [...groups.entries()]
    .map(([name, entries]) => ({ label: sourceLabel(name), entries }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function SourcesSection({ sources, title }: { sources: SourceReference[]; title: string }) {
  if (sources.length === 0) return null
  return (
    <Section id="entry-sources" title={title}>
      <ul className="space-y-2 text-sm">
        {groupByOrigin(sources).map(({ label, entries }) => (
          <li key={label} className="flex flex-col gap-1 sm:flex-row sm:gap-6">
            <span className="w-32 shrink-0 text-muted">{label}</span>
            <span className="font-serif text-ink">
              {entries.map((source, index) => (
                <span key={`${source.word}-${source.url}-${index}`}>
                  {index > 0 && ', '}
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="link">
                      {source.word || label}
                    </a>
                  ) : (
                    <span>{source.word || label}</span>
                  )}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

const SCHOLARLY_REFERENCES: Record<BetaLanguageCode, Array<{ label: string; url: string }>> = {
  it: [
    { label: 'TLIO', url: 'https://tlio.ovi.cnr.it/TLIO/' },
    { label: 'GDLI / ArchiDATA', url: 'https://www.gdli.it/' },
    { label: 'Treccani', url: 'https://www.treccani.it/vocabolario/' },
  ],
  es: [
    { label: 'RAE DLE', url: 'https://dle.rae.es/' },
    { label: 'RAE DHLE', url: 'https://www.rae.es/dhle/' },
  ],
  fr: [
    { label: 'TLFi', url: 'https://www.cnrtl.fr/definition/' },
    { label: 'TLF-Étym', url: 'https://www.atilf.fr/ressources/tlf-etym/' },
    { label: 'DMF', url: 'http://www.atilf.fr/dmf/' },
    { label: 'DÉRom', url: 'http://www.atilf.fr/DERom/' },
  ],
  pt: [
    { label: 'DELPo', url: 'https://delpo.prp.usp.br/' },
    { label: 'Priberam', url: 'https://dicionario.priberam.org/' },
    { label: 'Academia das Ciências de Lisboa', url: 'https://dicionario.acad-ciencias.pt/' },
  ],
}

export function ScholarlyReferences({
  language,
  title,
}: {
  language: BetaLanguageCode
  title: string
}) {
  return (
    <Section title={title}>
      <p className="text-sm text-muted">
        Reference links only; these dictionaries were not read by the synthesis.
      </p>
      <p className="mt-3 font-serif text-ink">
        {SCHOLARLY_REFERENCES[language].map((reference, index) => (
          <span key={reference.label}>
            {index > 0 && ' · '}
            <a href={reference.url} target="_blank" rel="noopener noreferrer" className="link">
              {reference.label}
            </a>
          </span>
        ))}
      </p>
    </Section>
  )
}
