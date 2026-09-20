const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  aacute: 'á',
  agrave: 'à',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  aring: 'å',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  iacute: 'í',
  igrave: 'ì',
  icirc: 'î',
  iuml: 'ï',
  oacute: 'ó',
  ograve: 'ò',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  oslash: 'ø',
  uacute: 'ú',
  ugrave: 'ù',
  ucirc: 'û',
  uuml: 'ü',
  ccedil: 'ç',
  ntilde: 'ñ',
  yacute: 'ý',
  yuml: 'ÿ',
  aelig: 'æ',
  oelig: 'œ',
  szlig: 'ß',
  eth: 'ð',
  thorn: 'þ',
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith('#')) {
      const hex = name[1]?.toLowerCase() === 'x'
      const point = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10)
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : entity
    }
    const decoded = NAMED_ENTITIES[name.toLowerCase()]
    return decoded && /^[A-Z]/.test(name) ? decoded.toUpperCase() : (decoded ?? entity)
  })
}

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
