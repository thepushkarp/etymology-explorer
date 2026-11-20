import type { ReactNode } from 'react'
import type { EtymologyEntry } from '@/lib/types'
import { type EtymologyStratum } from '@/lib/languages'
import { PronunciationButton } from '../PronunciationButton'
import { Skeleton } from './Section'
import { emphasize, FormText } from './StoryText'
import { pronunciationReadings } from '@/lib/pronunciation'

interface EntryHeaderProps {
  result: EtymologyEntry
  actions?: ReactNode
  navigation?: ReactNode
  lead?: string
  subheader?: ReactNode
  pending?: boolean
  pronunciationWord?: string
}

const STRATUM_LABELS: Record<EtymologyStratum, string> = {
  wago: 'Wago · native Japanese',
  kango: 'Kango · Sino-Japanese',
  gairaigo: 'Gairaigo · loanword',
  'wasei-eigo': 'Wasei-eigo · Japanese coinage from English',
  'wasei-kango': 'Wasei-kango · Japanese coinage from Chinese elements',
  hybrid: 'Hybrid',
}

export function EntryHeader({
  result,
  actions,
  navigation,
  lead,
  subheader,
  pending,
  pronunciationWord,
}: EntryHeaderProps) {
  const partsOfSpeech = [...new Set(result.partsOfSpeech?.map((part) => part.pos) ?? [])]
  const readings = pronunciationReadings(result.pronunciation ?? '')
  const spellings = [
    ...new Set(
      result.spellingVariants
        ?.filter((variant) => !variant.entryOnly)
        .map((variant) => variant.word)
    ),
  ]

  return (
    <header>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1
          lang={result.language}
          dir="auto"
          className="min-w-0 break-words font-serif text-[clamp(2.75rem,11vw,4.5rem)] leading-none tracking-tight text-ink"
        >
          {result.sourceTitle ?? result.word}
        </h1>
        {actions && <div className="ml-auto self-center">{actions}</div>}
      </div>

      <p className="mt-4 flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1 text-muted">
        {result.transliteration && (
          <span lang="en" dir="ltr" className="font-serif">
            {result.transliteration}
          </span>
        )}
        {result.pronunciation && (
          <span lang="en" dir="ltr" className="inline-flex items-center gap-1.5 font-serif">
            {result.pronunciation}
            {(readings.length ? readings : [undefined]).map((ipa, index) => (
              <PronunciationButton
                key={ipa ?? 'word'}
                word={pronunciationWord ?? result.word}
                language={result.language}
                ipa={ipa}
                hotkey={index === 0}
              />
            ))}
          </span>
        )}
        {partsOfSpeech.length > 0 && (
          <span className="font-serif italic">{partsOfSpeech.join(', ')}</span>
        )}
        {result.stratum && <span className="label">{STRATUM_LABELS[result.stratum]}</span>}
      </p>

      {navigation}
      {spellings.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          Also written <bdi lang={result.language}>{spellings.join(', ')}</bdi>.
        </p>
      )}
      {(lead || result.definition || result.formOf) && (
        <div id="entry-origin" lang="en" dir="ltr" className="mt-5 max-w-2xl">
          <p className="font-serif text-xl leading-relaxed text-ink">
            {emphasize(lead || result.definition)}
          </p>
          {!lead && result.formOf && (
            <p className="mt-2 font-serif">
              A grammatical form of <FormText text={result.formOf.word} />.
            </p>
          )}
          {!lead && !result.formOf && !pending && !result.ancestryGraph.branches.length && (
            <p className="mt-2 text-sm text-muted">
              {result.originCoverage?.sources.some((row) =>
                ['blocked', 'unavailable', 'budget_skipped'].includes(row.status)
              )
                ? 'Some sources could not be loaded. No origin account is available for this meaning.'
                : 'No origin account is available for this meaning.'}
            </p>
          )}
          {lead && result.definition && lead !== result.definition && (
            <p className="mt-2 text-sm text-muted">
              <span className="font-medium">Meaning: </span>
              <span>{emphasize(result.definition)}</span>
            </p>
          )}
          {result.sources.some((source) => source.url) && (
            <a href="#entry-sources" className="link mt-2 inline-block text-sm text-muted">
              Sources for this meaning
            </a>
          )}
        </div>
      )}
      {!lead && !result.definition && pending && (
        <div className="mt-5">
          <Skeleton widths={['w-11/12', 'w-2/3']} />
        </div>
      )}
      {subheader}
    </header>
  )
}
