import { canTraceLookup, compareLookupSupport } from './lookupEvidence'
import { lexemeKey } from './languages'
import type {
  ApiResponse,
  LookupGroup,
  WordEntry,
  StreamEvent,
  LexicalHistory,
  ScriptTarget,
} from './types'

import { historyChoice } from './resultHistories'
import { lookupGroupForWord, matchesLookupReading } from './lookupGroups'
import { rememberCompletedEntry } from './completedEntries'

export type LookupPreview = {
  word: string
  language: ScriptTarget['language']
  histories: LexicalHistory[]
}
// The application emits one JSON data line per event. A chunk can split a line or a UTF-8 character.
async function readDestination(
  response: Response,
  target: ScriptTarget,
  onEvent: (event: StreamEvent) => void
): Promise<{ payload: ApiResponse<WordEntry>; status: number }> {
  if (!response.headers.get('content-type')?.startsWith('text/event-stream'))
    return { payload: await response.json(), status: response.status }
  if (!response.body) throw new Error('Empty stream for ' + target.word)
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) throw new Error('Incomplete stream for ' + target.word)
      buffer += value
      let end
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 1)
        if (!line.startsWith('data:')) continue
        const event: StreamEvent = JSON.parse(line.slice(5))
        onEvent(event)
        if (event.type === 'result')
          return { payload: { success: true, data: event.data }, status: 200 }
        if (event.type === 'error')
          return {
            payload: { success: false, error: event.message, errorType: event.errorType },
            status:
              event.errorType === 'typo' || event.errorType === 'nonsense'
                ? 404
                : event.errorType === 'rate_limit'
                  ? 429
                  : 503,
          }
      }
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}

/** Cache-only navigation refresh, shared by passive refreshes and explicit research. */
export async function fetchLookupGroup(word: string, signal: AbortSignal) {
  const response = await fetch(`/api/lookup-group?word=${encodeURIComponent(word)}`, { signal })
  if (!response.ok)
    throw new Error(`Lookup navigation for “${word}” returned HTTP ${response.status}`)
  const data: { group: LookupGroup | null } = await response.json()
  signal.throwIfAborted()
  return data.group ?? undefined
}

/** Run only for an explicit search. Each distinct destination retains its normal
 * server budget, cache and lock. Source-linked candidates qualify regardless of count.
 * Never refresh saved entries or retry a failed request automatically. */
export async function traceLookupAlternatives(
  word: string,
  entry: WordEntry,
  signal: AbortSignal,
  publish: (group: LookupGroup | undefined) => void,
  report?: (status: string, preview?: LookupPreview) => void
): Promise<string | undefined> {
  const seen = new Set(entry.languages.map((language) => lexemeKey(language, entry.word)))
  let failure: string | undefined
  async function readGroup() {
    const group = await fetchLookupGroup(word, signal)
    const validated = entry.word === word ? group : lookupGroupForWord(entry.word, group)
    publish(validated)
    return validated
  }
  let group = await readGroup()
  if (!group) return
  while (group) {
    signal.throwIfAborted()
    const target = [...group.members]
      .filter(
        (candidate) =>
          // A default redirect already passed through the saved Japanese index.
          !(
            entry.word !== word &&
            candidate.language === 'ja' &&
            candidate.word === group?.reading
          ) &&
          candidate.lookupSupport !== 'verified' &&
          canTraceLookup(candidate.lookupSupport)
      )
      .sort((a, b) => compareLookupSupport(a.lookupSupport, b.lookupSupport))
      .find(
        (candidate) =>
          !seen.has(lexemeKey(candidate.language, candidate.word)) &&
          !group?.choices.some(
            (choice) => choice.word === candidate.word && choice.language === candidate.language
          )
      )
    if (!target) break
    seen.add(lexemeKey(target.language, target.word))
    const params = new URLSearchParams({ word: target.word, language: target.language })
    params.set('stream', 'true')
    report?.('Consulting sources for “' + target.word + '”…')
    const savedGroup = group
    try {
      const response = await fetch(`/api/etymology?${params}`, { signal, cache: 'no-store' })
      let canonical = target.word
      const { payload, status } = await readDestination(response, target, (event) => {
        signal.throwIfAborted()
        if (event.type === 'entry_identity') canonical = event.word
        if (event.type === 'synthesis_started') report?.('Tracing “' + target.word + '”…')
        if (
          event.type !== 'synthesis_section' ||
          event.language !== target.language ||
          canonical !== target.word
        )
          return
        if (event.section === 'synthesis_reset') {
          publish(savedGroup)
          report?.('Tracing “' + target.word + '”…')
          return
        }
        if (
          event.section !== 'readyHistories' ||
          !Array.isArray(event.data) ||
          target.language !== 'ja'
        )
          return
        const histories = (event.data as LexicalHistory[]).filter((h) =>
          matchesLookupReading(h, target.word, savedGroup.reading, savedGroup.romanizations ?? [])
        )
        if (!histories.length) return
        report?.('Tracing “' + target.word + '”…', { ...target, histories })
        publish({
          ...savedGroup,
          choices: [
            ...savedGroup.choices,
            ...histories.map((h) => ({
              ...target,
              historyId: h.id,
              label: target.word + ' — ' + (historyChoice(h, target.word).label || h.definition),
              details: historyChoice(h).details,
            })),
          ],
        })
      })
      signal.throwIfAborted()
      if (!response.ok || !payload.success || !payload.data?.entries[target.language]) {
        // Confirmed absence stays hidden. Outages and limits remain retryable,
        // and global/rate limits stop the batch instead of starting more work.
        publish(savedGroup)
        if (status !== 404)
          failure = `Could not load related entry “${target.word}”: ${payload.error ?? `HTTP ${status}`}`
        if ([402, 429, 503].includes(status)) break
      } else {
        if (payload.data.word) rememberCompletedEntry(payload.data, target.word, target.language)
        group = await readGroup()
      }
    } catch (error) {
      signal.throwIfAborted()
      publish(savedGroup)
      throw new Error(`Could not load related entry “${target.word}”`, { cause: error })
    }
  }
  // API-declared failures are recoverable UI state, not client exceptions.
  // The caller keeps published entries visible and offers an explicit retry.
  return failure
}
