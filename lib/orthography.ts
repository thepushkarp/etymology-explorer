/**
 * Canonical Unicode encodings are interchangeable; accents, length marks,
 * modifier letters and compatibility characters are lexical information.
 * NFKC or accent folding here would also merge cache and evidence identities.
 */
// Only horizontal space separators may collapse. Controls and line separators
// stay in the string so input validation cannot silently erase malformed input.
export function canonicalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFC')
    .replace(/\p{Zs}+/gu, ' ')
    .replace(/^ +| +$/g, '')
}

export function sameSpelling(left: string, right: string): boolean {
  return canonicalizeWord(left) === canonicalizeWord(right)
}

/** Historical notation is broader than the public search syntax. */
export const HISTORICAL_FORM = String.raw`\*?[-‐‑]?[\p{L}][\p{L}\p{M}\p{N}'’ʼʹʺ‐‑-]*`
