import type { AncestryGraph, AncestryStage } from '@/lib/types'
import { LANGUAGES, type LanguageCode } from '@/lib/languages'
import { sourceLabel } from '@/lib/sourceLabels'

interface AncestryTreeProps {
  graph: AncestryGraph
  word: string
  language?: LanguageCode
}

type Marker = 'attested' | 'inferred' | 'reconstructed' | 'final'

const MARKER_CLASS: Record<Marker, string> = {
  attested: 'bg-muted border-muted',
  inferred: 'bg-paper border-muted',
  reconstructed: 'bg-paper border-muted border-dashed',
  final: 'bg-accent border-accent',
}

const MARKER_LABEL: Record<Exclude<Marker, 'final'>, string> = {
  attested: 'found in sources',
  inferred: 'inferred',
  reconstructed: 'reconstructed',
}

function markerFor(stage: AncestryStage): Marker {
  if (stage.isReconstructed) return 'reconstructed'
  return stage.confidence === 'low' ? 'inferred' : 'attested'
}

/** One stop on the timeline: a dot on the rail, then language, form, and gloss. */
function Stop({
  marker,
  label,
  form,
  note,
  delay,
  children,
}: {
  marker: Marker
  label: string
  form: string
  note?: string
  delay: number
  children?: React.ReactNode
}) {
  return (
    <li
      className="animate-rise relative pb-7 pl-7 last:pb-0"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-[4.5px] top-3 w-px bg-faint/60 [li:last-child>&]:hidden"
      />
      <span
        aria-hidden="true"
        className={`absolute left-0 top-[0.4rem] size-2.5 rounded-full border ${MARKER_CLASS[marker]}`}
      />
      {marker !== 'final' && <span className="sr-only">{MARKER_LABEL[marker]}: </span>}
      <p className="label">{label}</p>
      <p
        className={`mt-1 font-serif text-lg ${marker === 'final' ? 'text-ink' : 'italic text-ink'}`}
      >
        {form}
      </p>
      {note && <p className="mt-0.5 max-w-md text-sm leading-relaxed text-muted">{note}</p>}
      {children}
    </li>
  )
}

function Evidence({ stage }: { stage: AncestryStage }) {
  if (!stage.evidence?.length) return null
  return (
    <details className="group mt-1.5">
      <summary className="inline cursor-pointer list-none text-xs text-muted underline decoration-faint underline-offset-4 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">evidence ({stage.evidence.length})</span>
        <span className="hidden group-open:inline">hide evidence</span>
      </summary>
      <ul className="animate-rise mt-2 max-w-md space-y-2 border-l border-rule pl-3">
        {stage.evidence.map((item, index) => (
          <li key={`${item.source}-${index}`} className="text-sm leading-snug">
            <span className="label mr-2">{sourceLabel(item.source)}</span>
            <q className="font-serif italic text-muted">{item.snippet}</q>
          </li>
        ))}
      </ul>
    </details>
  )
}

const STEP_MS = 60

export function AncestryTree({ graph, word, language = 'en' }: AncestryTreeProps) {
  const { branches, mergePoint, postMerge = [], convergencePoints = [] } = graph
  if (branches.length === 0) return null

  const split = branches.length > 1
  // Stops reveal top to bottom; the joined tail starts after the longest branch.
  const tailStart = Math.max(...branches.map((branch) => branch.stages.length))
  const tailDelay = (index: number) => (tailStart + index) * STEP_MS

  const markersUsed = new Set(
    [...branches.flatMap((branch) => branch.stages), ...postMerge].map(markerFor)
  )

  const stageStop = (stage: AncestryStage, key: string, stopDelay: number) => (
    <Stop
      key={key}
      marker={markerFor(stage)}
      label={stage.stage}
      form={stage.form}
      note={stage.note}
      delay={stopDelay}
    >
      <Evidence stage={stage} />
    </Stop>
  )

  // A single branch flows straight into the modern word; several branches
  // sit side by side and join below.
  const mergeStops = split && mergePoint ? 1 : 0
  const tail = [
    ...(split && mergePoint
      ? [
          <Stop
            key="merge"
            marker="attested"
            label="Combined"
            form={mergePoint.form}
            note={mergePoint.note}
            delay={tailDelay(0)}
          />,
        ]
      : []),
    ...postMerge.map((stage, index) =>
      stageStop(stage, `post-${index}`, tailDelay(mergeStops + index))
    ),
    <Stop
      key="final"
      marker="final"
      label={`Modern ${LANGUAGES[language].englishName}`}
      form={word}
      delay={tailDelay(mergeStops + postMerge.length)}
    />,
  ]

  return (
    <div>
      {convergencePoints.map((point, index) => (
        <p key={`${point.pieRoot}-${index}`} className="mb-6 font-serif text-sm italic text-muted">
          {point.branchIndices.map((i) => branches[i]?.root ?? '?').join(' and ')} share
          Proto-Indo-European <span className="text-ink">*{point.pieRoot.replace(/^\*/, '')}</span>{' '}
          &lsquo;{point.meaning}&rsquo;.
        </p>
      ))}

      {split ? (
        <>
          <div
            className={`grid gap-x-8 gap-y-8 ${branches.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
          >
            {branches.map((branch, branchIndex) => (
              <div key={`${branch.root}-${branchIndex}`}>
                <p className="mb-4 font-serif text-sm text-muted">
                  from <em className="text-ink">{branch.root}</em>
                </p>
                <ol>
                  {branch.stages.map((stage, index) =>
                    stageStop(stage, `${branchIndex}-${index}`, index * STEP_MS)
                  )}
                </ol>
              </div>
            ))}
          </div>
          <ol className="mt-8 border-t border-rule pt-8">{tail}</ol>
        </>
      ) : (
        <ol>
          {branches[0].stages.map((stage, index) =>
            stageStop(stage, `0-${index}`, index * STEP_MS)
          )}
          {tail}
        </ol>
      )}

      {markersUsed.size > 1 && (
        <p className="mt-8 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted" aria-hidden="true">
          {(['attested', 'inferred', 'reconstructed'] as const)
            .filter((marker) => markersUsed.has(marker))
            .map((marker) => (
              <span key={marker} className="inline-flex items-center gap-1.5">
                <span className={`size-2 rounded-full border ${MARKER_CLASS[marker]}`} />
                {MARKER_LABEL[marker]}
              </span>
            ))}
        </p>
      )}
    </div>
  )
}
