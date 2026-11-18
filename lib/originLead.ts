// Keep source wording and uncertainty intact rather than inferring a borrowing route from roots.
const sentences = new Intl.Segmenter('en', { granularity: 'sentence' })
export function splitOriginStory(lore: string) {
  const text = lore.trim()
  const first = text.split(/\n\s*\n/, 1)[0]
  const lead = Array.from(sentences.segment(first))
    .slice(0, 2)
    .map((s) => s.segment)
    .join('')
    .trimEnd()
  return { lead, rest: text.slice(lead.length).trimStart() }
}
