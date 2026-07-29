'use client'

import { memo } from 'react'
import { DisplayEtymologyResult } from '@/lib/types'
import type { BetaLanguageCode } from '@/lib/languages'
import {
  resultLabels,
  type DisplayHistoryChoice,
  type ResultLocale,
} from '@/lib/resultLocalization'
import HistoricalContext, { wikipediaSourceUrl } from './HistoricalContext'
import { AncestrySection } from './etymology-card/AncestrySection'
import { EntryHeader } from './etymology-card/EntryHeader'
import { KinSection } from './etymology-card/KinSection'
import { ModernUsageSection } from './etymology-card/ModernUsageSection'
import { RelatedWordsSection } from './etymology-card/RelatedWordsSection'
import { SourcesSection } from './etymology-card/SourcesSection'
import { StorySection } from './etymology-card/StorySection'
import { UsageSection, UsageUnavailable } from './etymology-card/UsageSection'
import { EntrySelector } from './etymology-card/EntrySelector'

interface EtymologyCardProps {
  result: DisplayEtymologyResult
  onWordClick: (word: string) => void
  headerActions?: React.ReactNode
  contentLocale?: ResultLocale
  historyChoices?: DisplayHistoryChoice[]
  activeHistoryId?: string
  onHistoryChange?: (historyId: string) => void
  usageUnavailable?: boolean
}

export const EtymologyCard = memo(function EtymologyCard({
  result,
  onWordClick,
  headerActions,
  contentLocale = 'en',
  historyChoices = [],
  activeHistoryId,
  onHistoryChange,
  usageUnavailable = false,
}: EtymologyCardProps) {
  const hasAncestry = Boolean(result.ancestryGraph?.branches?.length)
  const labels =
    result.language === 'en'
      ? undefined
      : resultLabels(result.language as BetaLanguageCode, contentLocale)
  return (
    <article className="editorial-shell animate-fadeIn p-4 sm:p-7 lg:p-9">
      <div className="relative">
        <EntryHeader
          result={result}
          headerActions={headerActions}
          historySelector={
            activeHistoryId && onHistoryChange ? (
              <EntrySelector
                word={result.word}
                entries={historyChoices}
                activeEntryId={activeHistoryId}
                onChange={onHistoryChange}
              />
            ) : undefined
          }
          usageUnavailable={usageUnavailable}
        />

        {hasAncestry && (
          <AncestrySection
            graph={result.ancestryGraph}
            word={result.word}
            language={result.language}
            title={labels?.ancestry}
          />
        )}

        <StorySection lore={result.lore} title={labels?.story} first={!hasAncestry} />

        {result.ngram && result.ngram.data.length > 0 && (
          <UsageSection ngram={result.ngram} title={labels?.usage} />
        )}

        {!result.ngram && usageUnavailable && (
          <UsageUnavailable
            title={labels?.usage}
            noteLabel={labels?.usageNote}
            message={labels?.usageUnavailable}
          />
        )}

        {result.modernUsage && result.modernUsage.hasSlangMeaning && (
          <ModernUsageSection modernUsage={result.modernUsage} title={labels?.modernUsage} />
        )}

        {result.suggestions && (
          <RelatedWordsSection
            suggestions={result.suggestions}
            onWordClick={onWordClick}
            title={labels?.related}
          />
        )}

        {result.rawSources?.wikipedia && (
          <HistoricalContext
            wikipediaExtract={result.rawSources.wikipedia}
            sourceUrl={wikipediaSourceUrl(result.sources)}
          />
        )}

        {result.roots.length > 0 && (
          <KinSection
            roots={result.roots}
            // Related terms in beta results are not language-tagged yet. Keep
            // them readable without guessing a route or spending on the wrong lexeme.
            onWordClick={result.language === 'en' ? onWordClick : undefined}
            title={labels?.kin}
          />
        )}

        <SourcesSection sources={result.sources} title={labels?.sources} />

        {result.language !== 'en' && (
          <ScholarlyReferences
            language={result.language as BetaLanguageCode}
            title={labels?.references ?? 'Further scholarly references'}
          />
        )}

        <div
          className="
            mt-6 flex items-center justify-center gap-2 pt-2 text-charcoal/25
          "
        >
          <span className="w-8 h-px bg-current" />
          <span className="text-xs font-serif italic select-none">§</span>
          <span className="w-8 h-px bg-current" />
        </div>
      </div>
    </article>
  )
})

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

function ScholarlyReferences({ language, title }: { language: BetaLanguageCode; title: string }) {
  return (
    <section className="mt-10 border-t border-border-soft pt-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-charcoal-light/66">
        {title}
      </p>
      <p className="mt-3 font-serif text-sm italic text-charcoal-light">
        Reference links only; these restricted dictionaries were not read by the synthesis.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {SCHOLARLY_REFERENCES[language].map((reference) => (
          <a
            key={reference.label}
            href={reference.url}
            target="_blank"
            rel="noopener noreferrer"
            className="editorial-chip"
          >
            {reference.label}
          </a>
        ))}
      </div>
    </section>
  )
}
