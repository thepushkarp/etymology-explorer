export interface DeinflectionCandidate {
  lemma: string
  explanation: string
  confidence: number
}

const MASU_STEM_ENDINGS: Record<string, string> = {
  い: 'う',
  き: 'く',
  ぎ: 'ぐ',
  し: 'す',
  ち: 'つ',
  に: 'ぬ',
  び: 'ぶ',
  み: 'む',
  り: 'る',
}

const A_ROW_ENDINGS: Record<string, string> = {
  わ: 'う',
  か: 'く',
  が: 'ぐ',
  さ: 'す',
  た: 'つ',
  な: 'ぬ',
  ば: 'ぶ',
  ま: 'む',
  ら: 'る',
}

const E_ROW_ENDINGS: Record<string, string> = {
  え: 'う',
  け: 'く',
  げ: 'ぐ',
  せ: 'す',
  て: 'つ',
  ね: 'ぬ',
  べ: 'ぶ',
  め: 'む',
  れ: 'る',
}

function replaceFinal(text: string, table: Record<string, string>): string | null {
  const final = text.at(-1)
  return final && table[final] ? `${text.slice(0, -1)}${table[final]}` : null
}

function add(
  output: Map<string, DeinflectionCandidate>,
  lemma: string | null,
  explanation: string,
  confidence: number
) {
  if (!lemma || lemma.length === 0) return
  const current = output.get(lemma)
  if (!current || current.confidence < confidence) {
    output.set(lemma, { lemma, explanation, confidence })
  }
}

function deinflectTeOrPast(
  stemAndEnding: string,
  output: Map<string, DeinflectionCandidate>,
  explanation: string
) {
  const rules: Array<[RegExp, string[]]> = [
    [/(?:った|って)$/, ['う', 'つ', 'る']],
    [/(?:んだ|んで)$/, ['ぬ', 'ぶ', 'む']],
    [/(?:いた|いて)$/, ['く']],
    [/(?:いだ|いで)$/, ['ぐ']],
    [/(?:した|して)$/, ['す']],
  ]
  for (const [pattern, endings] of rules) {
    if (!pattern.test(stemAndEnding)) continue
    const stem = stemAndEnding.replace(pattern, '')
    for (const ending of endings) add(output, `${stem}${ending}`, explanation, 0.78)
  }
  if (/[たて]$/.test(stemAndEnding)) {
    add(output, `${stemAndEnding.slice(0, -1)}る`, explanation, 0.75)
  }
}

/**
 * Generate a deliberately bounded set of common Japanese dictionary forms.
 * The resolver accepts none of these unless the generated lemma exists in JMdict.
 */
export function deinflectJapanese(surface: string): DeinflectionCandidate[] {
  const text = surface.normalize('NFKC').trim()
  const output = new Map<string, DeinflectionCandidate>()

  const suruForms: Record<string, string> = {
    します: 'suru polite form',
    しました: 'suru polite past form',
    しません: 'suru polite negative form',
    しませんでした: 'suru polite negative past form',
    して: 'suru て-form',
    している: 'suru progressive form',
    してる: 'suru progressive form',
    しない: 'suru negative form',
    しなかった: 'suru negative past form',
  }
  const suruExplanation = suruForms[text]
  if (suruExplanation) {
    add(output, 'する', suruExplanation, 1)
  }
  if (text === 'きました' || text === '来ました') add(output, '来る', 'polite past form', 1)
  if (text === 'きて' || text === '来て') add(output, '来る', 'て-form', 1)

  const politeSuffixes: Array<[string, string]> = [
    ['ませんでした', 'polite negative past form'],
    ['ました', 'polite past form'],
    ['ません', 'polite negative form'],
    ['ます', 'polite form'],
  ]
  for (const [suffix, explanation] of politeSuffixes) {
    if (suruExplanation) continue
    if (!text.endsWith(suffix) || text.length <= suffix.length) continue
    const stem = text.slice(0, -suffix.length)
    add(output, `${stem}る`, explanation, 0.9)
    add(output, replaceFinal(stem, MASU_STEM_ENDINGS), explanation, 0.86)
  }

  for (const progressive of ['ている', 'でいる', 'てる', 'でる']) {
    if (suruExplanation) continue
    if (text.endsWith(progressive)) {
      deinflectTeOrPast(
        `${text.slice(0, -progressive.length)}${progressive.startsWith('で') ? 'で' : 'て'}`,
        output,
        'progressive form'
      )
    }
  }
  if (!suruExplanation) {
    deinflectTeOrPast(
      text,
      output,
      text.endsWith('て') || text.endsWith('で') ? 'て-form' : 'past form'
    )
  }

  const negativeSuffixes: Array<[string, string]> = [
    ['なかった', 'negative past form'],
    ['ない', 'negative form'],
  ]
  for (const [suffix, explanation] of negativeSuffixes) {
    if (!text.endsWith(suffix) || text.length <= suffix.length) continue
    const stem = text.slice(0, -suffix.length)
    add(output, `${stem}る`, explanation, 0.82)
    add(output, replaceFinal(stem, A_ROW_ENDINGS), explanation, 0.85)
  }

  if (text.endsWith('られる') && text.length > 3) {
    add(output, `${text.slice(0, -3)}る`, 'potential or passive form', 0.8)
  }
  if (text.endsWith('る') && text.length > 1) {
    add(output, replaceFinal(text.slice(0, -1), E_ROW_ENDINGS), 'potential form', 0.72)
  }

  const irregularIi = /^よ(?:かった|くない|くなかった|くありません(?:でした)?)$/.test(text)
  const adjectiveRules: Array<[string, string, string]> = [
    ['くありませんでした', 'い', 'polite negative past adjective form'],
    ['くなかった', 'い', 'negative past adjective form'],
    ['かった', 'い', 'past adjective form'],
    ['くありません', 'い', 'polite negative adjective form'],
    ['くない', 'い', 'negative adjective form'],
  ]
  for (const [suffix, replacement, explanation] of adjectiveRules) {
    if (!irregularIi && text.endsWith(suffix) && text.length > suffix.length) {
      add(output, `${text.slice(0, -suffix.length)}${replacement}`, explanation, 0.92)
    }
  }
  if (!irregularIi && text.endsWith('いです') && text.length > 3) {
    add(output, text.slice(0, -2), 'polite adjective form', 0.94)
  }
  if (!irregularIi && text.endsWith('かったです') && text.length > 5) {
    add(output, `${text.slice(0, -5)}い`, 'polite past adjective form', 0.94)
  }
  if (irregularIi) {
    add(output, 'いい', 'irregular adjective form', 1)
  }

  return [...output.values()].sort((left, right) => right.confidence - left.confidence).slice(0, 24)
}
