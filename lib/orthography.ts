/**
 * Canonical Unicode encodings are interchangeable; accents, length marks,
 * modifier letters and compatibility characters are lexical information.
 * NFKC or accent folding here would also merge cache and evidence identities.
 */
export function canonicalizeWord(raw: string): string {
  return raw.trim().toLowerCase().normalize('NFC')
}

export function sameSpelling(left: string, right: string): boolean {
  return canonicalizeWord(left) === canonicalizeWord(right)
}

/** Historical notation is broader than the public single-word search syntax. */
export const HISTORICAL_FORM = String.raw`\*?[-‐‑]?[\p{L}][\p{L}\p{M}\p{N}'’ʼʹʺ‐‑-]*`
