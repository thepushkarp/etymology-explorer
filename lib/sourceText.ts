import { decodeHTML as decodeHtmlEntities } from 'entities'

export { decodeHtmlEntities }

const SUPER: Record<string, string> = Object.fromEntries(
  Array.from('0123456789abcdefghijklmnoprstuvwxyz').map((letter, i) => [
    letter,
    Array.from('⁰¹²³⁴⁵⁶⁷⁸⁹ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ')[i],
  ])
)
const SUB: Record<string, string> = Object.fromEntries(
  Array.from('0123456789').map((letter, i) => [letter, Array.from('₀₁₂₃₄₅₆₇₈₉')[i]])
)

/** Drop citation superscripts, but retain phonetic modifiers and laryngeal indices. */
export function preserveLinguisticNotation(html: string): string {
  return (
    html
      .replace(/<sup\b([^>]*)>([\s\S]*?)<\/sup>/gi, (_, attributes: string, body: string) => {
        if (
          /\b(?:reference|citation|cite_ref)\b/i.test(attributes) ||
          /#cite_note/i.test(body) ||
          /^\s*\[\d+\]\s*$/.test(body)
        )
          return ''
        return scriptText(body, SUPER, '^')
      })
      .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, (_, body: string) => scriptText(body, SUB, '_'))
      // Inline typography must not split a single form into separate tokens.
      .replace(/<\/?(?:i|b|em|strong|span|a)\b[^>]*>/gi, '')
  )
}

function scriptText(body: string, alphabet: Record<string, string>, marker: string): string {
  const text = decodeHtmlEntities(body.replace(/<[^>]+>/g, '')).trim()
  const characters = Array.from(text)
  return characters.every((character) => alphabet[character])
    ? characters.map((character) => alphabet[character]).join('')
    : `${marker}{${text}}`
}
