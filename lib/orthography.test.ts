import { describe, expect, test } from 'bun:test'
import { canonicalizeWord, sameSpelling } from './orthography'
import { isValidWord } from './validation'
import { lexemeKey, wordPagePath } from './languages'
import { parseWiktionaryText } from './etymologyParser'
import { enrichAncestryGraph, pruneUngroundedStages } from './etymologyEnricher'
import { extractRootsCpu } from './research'
import { cleanWiktionaryHtml } from './wiktionaryEntryGroups'
import type { AncestryGraph } from './types'

describe('lexical spelling identity', () => {
  test.each([
    ['cote', 'côte'],
    ['e', 'é'],
    ['ano', 'año'],
    ['avó', 'avô'],
    ['malum', 'mālum'],
    ['*bher-', '*bʰer-'],
    ['h2', 'h₂'],
    ['f', 'ﬀ'],
    ["l'amour", 'l’amour'],
  ])('%s and %s stay distinct', (left, right) => {
    expect(sameSpelling(left, right)).toBe(false)
    expect(lexemeKey('fr', left)).not.toBe(lexemeKey('fr', right))
    expect(wordPagePath(left, 'fr')).not.toBe(wordPagePath(right, 'fr'))
  })

  test('canonical encodings share identity and route', () => {
    expect(canonicalizeWord(' E\u0301 ')).toBe('é')
    expect(lexemeKey('fr', 'café')).toBe(lexemeKey('fr', 'cafe\u0301'))
    expect(wordPagePath('café')).toBe(wordPagePath('cafe\u0301'))
  })

  test.each(['q\u0301', 'l’amour', "l'amour", 'porte-monnaie', 'co‐op', 'φωνή'])(
    'accepts %s',
    (word) => {
      expect(isValidWord(canonicalizeWord(word))).toBe(true)
    }
  )
  test.each(['\u0301e', "'word", 'word-', 'a--b', 'a-\u0301b', 'a\u200bb'])(
    'rejects malformed %s',
    (word) => {
      expect(isValidWord(canonicalizeWord(word))).toBe(false)
    }
  )
})

describe('historical forms and confidence', () => {
  test.each(['phōnē', 'pho\u0304ne\u0304', 'φωνή', '*bʰer-', '*h₂', 'q\u0301', 'télé-'])(
    'parses the whole form %s',
    (form) => {
      expect(parseWiktionaryText(`from Greek ${form} "meaning"`, 'example').links[0].form).toBe(
        form.normalize('NFC')
      )
    }
  )

  test('retains source root marks and affix boundaries', () => {
    expect(
      extractRootsCpu('telephone', 'from télé- "far" + pho\u0304ne\u0304 "sound"', null, [])
    ).toEqual(['télé-', 'phōnē'])
  })

  const graph = (form: string, stage = 'French'): AncestryGraph => ({
    branches: [
      {
        root: form,
        stages: [
          {
            stage,
            form,
            note: '',
            confidence: 'high',
            evidence: [{ source: 'wiktionary', snippet: 'unsupported' }],
          },
        ],
      },
    ],
  })

  test.each([
    ['cote', 'côte'],
    ['malum', 'mālum'],
    ['tele', 'tele-'],
    ['phone', 'telephone'],
    ['*bher-', '*bʰer-'],
  ])('does not corroborate %s from %s', (form, evidence) => {
    const result = graph(form)
    enrichAncestryGraph(result, [parseWiktionaryText(`from French ${evidence}`, 'example')])
    expect(result.branches[0].stages[0]).toMatchObject({ confidence: 'low', evidence: [] })
  })

  test('accepts canonical equivalence and broad language labels', () => {
    const chains = [parseWiktionaryText('from French côte', 'example')]
    const exact = graph('co\u0302te')
    enrichAncestryGraph(exact, chains)
    expect(exact.branches[0].stages[0].confidence).toBe('medium')
    const foreign = graph('côte', 'Latin')
    enrichAncestryGraph(foreign, chains)
    expect(foreign.branches[0].stages[0].confidence).toBe('low')

    for (const [broad, specific] of [
      ['Latin', 'Late Latin'],
      ['Greek', 'Ancient Greek'],
    ]) {
      const periodChains = [parseWiktionaryText(`from ${specific} forma`, 'example')]
      const compatible = graph('forma', broad)
      enrichAncestryGraph(compatible, periodChains)
      expect(compatible.branches[0].stages[0].confidence).toBe('medium')
    }

    const lateLatin = [parseWiktionaryText('from Late Latin forma', 'example')]
    const differentPeriod = graph('forma', 'Medieval Latin')
    enrichAncestryGraph(differentPeriod, lateLatin)
    expect(differentPeriod.branches[0].stages[0].confidence).toBe('low')
  })

  test.each([
    ['Proto-Germanic', 'Proto-Germanic', 'bergaz'],
    ['Proto-Italic', 'Proto-Italic', 'forma'],
    ['protoindoeuropeo', 'PIE', 'bher-'],
    ['Latin', 'Latin', '*forma'],
  ])('retains attested reconstructed forms from %s', (sourceLanguage, stage, form) => {
    const result = graph(form, stage)
    const chain = parseWiktionaryText(`from ${sourceLanguage} ${form}`, 'example')
    expect(chain.links[0].isReconstructed).toBe(true)
    enrichAncestryGraph(result, [chain])
    pruneUngroundedStages(result)
    expect(result.branches[0]?.stages[0]).toMatchObject({
      isReconstructed: true,
      confidence: 'medium',
      evidence: [{ source: 'wiktionary', snippet: `from ${sourceLanguage} ${form}` }],
    })
  })

  test('an explicit source variant retains its supporting snippet', () => {
    const variantOnly = parseWiktionaryText('from Latin mālum (also malum)', 'example')
    const chains = [parseWiktionaryText('from Latin mālum (also malum) (apple)', 'example')]
    const result = graph('malum', 'Latin')
    enrichAncestryGraph(result, chains)
    expect(variantOnly.links[0].meaning).toBeUndefined()
    expect(chains[0].links[0].meaning).toBe('apple')
    expect(result.branches[0].stages[0].confidence).toBe('medium')
    expect(result.branches[0].stages[0].evidence?.[0].snippet).toContain('mālum (also malum)')
  })

  test('absence of parsed evidence cannot preserve model-supplied confidence', () => {
    const result = graph('cote')
    enrichAncestryGraph(result, [])
    expect(result.branches[0].stages[0]).toMatchObject({ confidence: 'low', evidence: [] })
  })

  test('HTML retains linguistic scripts and accents while dropping citations', () => {
    const text = cleanWiktionaryHtml(
      '<p>from Greek <i>p</i><sup>h</sup>ōnē, from PIE *h<sub>2</sub>é<sup class="reference">[1]</sup>; &eacute;; from Latin: m&amacr;lum; from Greek, &phi;&omacr;n&emacr;</p>'
    )
    expect(text).toBe('from Greek pʰōnē, from PIE *h₂é; é; from Latin: mālum; from Greek, φōnē')
    expect(parseWiktionaryText(text, 'example').links.map((link) => link.form)).toEqual([
      'pʰōnē',
      '*h₂é',
      'mālum',
      'φōnē',
    ])
  })
})
