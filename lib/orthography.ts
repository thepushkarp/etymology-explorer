/**
 * Canonical Unicode encodings are interchangeable; accents, length marks,
 * modifier letters and compatibility characters are lexical information.
 * Global NFKC or accent folding would merge distinct cache and evidence identities.
 * Half-width Japanese forms alone fold to their ordinary full-width spelling.
 */
// Only horizontal space separators may collapse. Controls and line separators
// stay in the string so input validation cannot silently erase malformed input.
export function canonicalizeWord(raw: string): string {
  return raw
    .replace(/[\uFF61-\uFF9F]+/g, (part) => part.normalize('NFKC'))
    .toLowerCase()
    .normalize('NFC')
    .replace(/\p{Zs}+/gu, ' ')
    .replace(/^ +| +$/g, '')
}

export function sameSpelling(left: string, right: string): boolean {
  return canonicalizeWord(left) === canonicalizeWord(right)
}

/** Historical notation is broader than the public search syntax. */
export const HISTORICAL_FORM = String.raw`\*?[-‐‑]?\p{L}\p{M}*(?:[\p{L}\p{M}\p{N}'’ʼʹʺ‐‑-]|(?<=\p{L}\p{M}*)[\u200C\u200D](?=\p{L}))*`
