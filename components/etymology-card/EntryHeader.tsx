import type { ReactNode } from 'react'
import type { EtymologyEntry } from '@/lib/types'
import { languageFromName } from '@/lib/languages'
import { PronunciationButton } from '../PronunciationButton'
import { Skeleton } from './Section'
import { FormText } from './StoryText'

interface EntryHeaderProps {
  result: EtymologyEntry
  actions?: ReactNode
  subheader?: ReactNode
  pending?: boolean
}

function shortenMeaning(meaning: string): string {
  return meaning.split(/[;,]/)[0].trim()
}

function shortenOrigin(origin: string): string {
  return origin.replace(/^Ancient\s+/i, '').replace(/^Old\s+/i, 'O.')
}

/** One-line gloss of the word's parts, e.g. "From Latin fenestra (window)." */
function originHook(result: EtymologyEntry): ReactNode {
  const meaningful = result.roots.filter((root) => !root.root.startsWith('-')).slice(0, 3)
  if (meaningful.length === 0) return null
  const parts = meaningful.map((root, index) => (
    <span key={`${root.origin}-${root.root}`}>
      {index > 0 && ' + '}
      {shortenOrigin(root.origin)}{' '}
      <FormText text={root.root} language={languageFromName(root.origin)} /> (
      {shortenMeaning(root.meaning)})
    </span>
  ))
  return <>From {parts}.</>
}

export function EntryHeader({ result, actions, subheader, pending }: EntryHeaderProps) {
  const hook = originHook(result)
  const partsOfSpeech = [...new Set(result.partsOfSpeech?.map((part) => part.pos) ?? [])]
  const attested = result.rawSources?.dateAttested

  return (
    <header>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1
          lang={result.language}
          dir="auto"
          className="min-w-0 break-words font-serif text-[clamp(2.75rem,11vw,4.5rem)] leading-none tracking-tight text-ink"
        >
          {result.word}
        </h1>
        {actions && <div className="ml-auto self-center">{actions}</div>}
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
        {result.transliteration && (
          <span lang="en" dir="ltr" className="font-serif">
            {result.transliteration}
          </span>
        )}
        {result.pronunciation && (
          <span lang="en" dir="ltr" className="inline-flex items-center gap-1.5 font-serif">
            {result.pronunciation}
            <PronunciationButton word={result.word} language={result.language} />
          </span>
        )}
        {partsOfSpeech.length > 0 && (
          <span className="font-serif italic">{partsOfSpeech.join(', ')}</span>
        )}
        {attested && <span className="text-sm">first attested {attested}</span>}
      </p>

      {subheader}

      {result.definition ? (
        <p className="mt-8 max-w-2xl font-serif text-xl leading-relaxed text-ink">
          {result.definition}
        </p>
      ) : (
        pending && (
          <div className="mt-8">
            <Skeleton widths={['w-11/12', 'w-2/3']} />
          </div>
        )
      )}

      {hook && (
        <p className="mt-3 max-w-2xl font-serif italic leading-relaxed text-muted">{hook}</p>
      )}
    </header>
  )
}
