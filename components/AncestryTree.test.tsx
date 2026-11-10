import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AncestryTree, ancestryLinkTarget } from './AncestryTree'
import type { AncestryStage } from '@/lib/types'

describe('ancestry links', () => {
  const hindi: AncestryStage = {
    stage: 'Hindi',
    form: 'जंगल',
    note: 'forest',
    confidence: 'medium',
  }

  test('links an attested ancestor to its explicit supported language', () => {
    expect(ancestryLinkTarget(hindi)).toEqual({ word: 'जंगल', language: 'hi' })
    expect(
      ancestryLinkTarget({
        ...hindi,
        confidence: undefined,
        evidence: [{ source: 'wiktionary', snippet: 'From Hindi जंगल.' }],
      })
    ).toEqual({ word: 'जंगल', language: 'hi' })
  })

  test('keeps unsupported periods, unattested forms, roots, and affixes as text', () => {
    for (const change of [
      { stage: 'Old Hindi' },
      { stage: 'Middle Chinese' },
      { stage: 'Latin' },
      { isReconstructed: true },
      {
        confidence: 'low' as const,
        evidence: [{ source: 'wiktionary' as const, snippet: 'जंगल' }],
      },
      { confidence: undefined },
      { confidence: undefined, evidence: [{ source: 'wiktionary' as const, snippet: ' ' }] },
      { form: '*जंगल' },
      { form: '√जंगल' },
      { form: '-जंगल' },
      { form: 'जंगल-' },
      { form: 'जंगल/वन' },
    ]) {
      expect(ancestryLinkTarget({ ...hindi, ...change })).toBeUndefined()
    }
  })
})

describe('AncestryTree language identity', () => {
  test('separates Japonic and Sinitic historical stages', () => {
    const markup = renderToStaticMarkup(
      <AncestryTree
        language="ja"
        word="茶"
        graph={{
          branches: [
            {
              root: '茶',
              stages: [
                { stage: 'Middle Chinese', form: '茶', note: 'tea' },
                { stage: 'Old Japanese', form: '茶', note: 'borrowed reading' },
              ],
            },
          ],
        }}
      />
    )
    expect(markup).toContain('border-t-lang-japonic')
    expect(markup).toContain('border-t-lang-sinitic')
    expect(markup).toContain('>Japonic</span>')
    expect(markup).toContain('>Sinitic</span>')
    expect(markup).toContain('lang="und-Hani" dir="auto"')
    expect(markup).toContain('lang="ja" dir="auto"')
  })

  test('shows source romanizations and separates Indo-Iranian ancestry from Dravidian', () => {
    const markup = renderToStaticMarkup(
      <AncestryTree
        language="hi"
        word="पानी"
        transliteration="pānī"
        graph={{
          branches: [
            {
              root: 'पानीय',
              stages: [
                { stage: 'Tamil', form: 'நீர்', note: 'comparison' },
                { stage: 'Sanskrit', form: 'पानीय', transliteration: 'pānīya', note: 'drinkable' },
                { stage: 'Old Hindi', form: 'पाणी', transliteration: 'pāṇī', note: 'water' },
              ],
            },
          ],
        }}
      />
    )
    expect(markup).toContain('border-t-lang-indo-iranian')
    expect(markup).toContain('border-t-lang-other')
    expect(markup).toContain('lang="sa" dir="auto"')
    expect(markup).toContain('>pānīya</span>')
    expect(markup).toContain('lang="hi" dir="auto"')
    expect(markup).toContain('>pānī</span>')
    expect(markup).toContain('>Indo-Iranian</span>')
  })

  test('labels the final form with the explicitly selected language', () => {
    const markup = renderToStaticMarkup(
      <AncestryTree
        language="it"
        word="casa"
        graph={{
          branches: [
            {
              root: 'casa',
              stages: [{ stage: 'Latin', form: 'casa', note: 'hut' }],
            },
          ],
        }}
      />
    )

    expect(markup).toContain('>Italian</span>')
    expect(markup).not.toContain('>English</span>')
  })
})

describe('AncestryTree nodes', () => {
  test('expands the final definition while earlier stages stay collapsed', () => {
    const markup = renderToStaticMarkup(
      <AncestryTree
        word="window"
        definition="An opening in a wall to admit light or air."
        graph={{
          branches: [
            {
              root: 'vindauga',
              stages: [
                {
                  stage: 'Old Norse',
                  form: 'vindauga',
                  note: 'wind-eye',
                  confidence: 'high',
                  evidence: [{ source: 'etymonline', snippet: 'from Old Norse vindauga' }],
                },
              ],
            },
          ],
        }}
      />
    )

    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('aria-expanded="true" aria-controls="tree-details"')
    expect(markup).toContain('An opening in a wall to admit light or air.')
    expect(markup).not.toContain('from Old Norse vindauga')
    expect(markup).not.toContain('href=')
  })
})
