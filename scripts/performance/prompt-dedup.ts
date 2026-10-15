/** Conservative benchmark variant: keep scoped evidence verbatim and reference exact duplicates. */
import assert from 'node:assert/strict'

export function deduplicatePrompt(input: string) {
  const blocks = [...input.matchAll(/<source_data([^>]*)>\n([\s\S]*?)\n<\/source_data>/g)].map(
    (match) => ({
      attributes: Object.fromEntries(
        [...match[1].matchAll(/([a-z_]+)="([^"]*)"/g)].map((attribute) => [
          attribute[1],
          attribute[2],
        ])
      ),
      body: match[2],
      start: match.index! + match[0].indexOf('\n') + 1,
    })
  )
  const sourceName = (name: string) =>
    ({
      wiktionaryNative: 'wiktionary_native_edition',
      wiktionaryEnglish: 'wiktionary_english_selected_language',
    })[name] ?? name
  const scoped = blocks.filter((block) => block.attributes.history_id)
  const seenSources = new Set<string>()
  const replacements: Array<{
    start: number
    end: number
    text: string
    reference: string
    historyId: string
    evidenceScopeId: string
    charactersSaved: number
  }> = []
  for (const block of blocks) {
    if (block.attributes.history_id || seenSources.has(block.attributes.name)) continue
    seenSources.add(block.attributes.name)
    const candidates = scoped.filter(
      (history) => sourceName(history.attributes.name) === block.attributes.name
    )
    const intervals: Array<{ start: number; end: number }> = []
    for (const history of [...candidates].sort((a, b) => b.body.length - a.body.length)) {
      const start = block.body.indexOf(history.body)
      const end = start + history.body.length
      if (
        history.body.length < 512 ||
        start === -1 ||
        block.body.indexOf(history.body, start + 1) !== -1 ||
        candidates.some((other) => other !== history && other.body === history.body) ||
        intervals.some((interval) => start < interval.end && end > interval.start)
      )
        continue
      const historyId = history.attributes.history_id
      const evidenceScopeId = history.attributes.evidence_scope_id
      const reference = `<source_text_reference history_id="${historyId}" evidence_scope_id="${evidenceScopeId}" />`
      assert.ok(!input.includes(reference), 'Reference must not occur in the original prompt')
      intervals.push({ start, end })
      replacements.push({
        start: block.start + start,
        end: block.start + end,
        text: history.body,
        reference,
        historyId,
        evidenceScopeId,
        charactersSaved: history.body.length - reference.length,
      })
    }
  }
  let prompt = input
  for (const replacement of [...replacements].sort((a, b) => b.start - a.start))
    prompt =
      prompt.slice(0, replacement.start) + replacement.reference + prompt.slice(replacement.end)
  let restored = prompt
  for (const replacement of replacements)
    restored = restored.replace(replacement.reference, replacement.text)
  assert.equal(restored, input, 'Every original source byte and history scope must be recoverable')
  return { prompt, replacements }
}
