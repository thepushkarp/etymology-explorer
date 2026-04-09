import { describe, expect, test } from 'bun:test'
import { buildResearchPrompt, extractRelatedTerms } from '@/lib/research'
import { extractEtymonlineRelatedEntries } from '@/lib/etymonline'
import { ResearchContext } from '@/lib/types'

describe('research breadth', () => {
  test('extractEtymonlineRelatedEntries finds linked relation entries from escaped page payloads', () => {
    const html = String.raw`{\"word\":\"contradict\",\"desc\":\"assert the contrary\"},{\"word\":\"contra\",\"desc\":\"Latin preposition meaning against\"},{\"word\":\"*deik-\",\"desc\":\"PIE root meaning to show\"},{\"key\":\"syn_ant\",\"word\":\"contravene\",\"desc\":\"from Latin contra + venire\"},{\"word\":\"gainsay\",\"desc\":\"literally say against\"},{\"word\":\"contradictory\"}`

    expect(extractEtymonlineRelatedEntries(html, 'contradict')).toEqual([
      'contra',
      '*deik-',
      'contravene',
      'gainsay',
    ])
  })

  test('extractRelatedTerms combines derivational formulas with seeded source hints', () => {
    const text = `
Derived from Latin contradictus.
Equivalent to contra + dict.
Ultimately from Proto-Indo-European *deik-.
Compare gainsay.
    `

    expect(extractRelatedTerms(text, ['contradict'], ['contra', '*deik-', 'contravene'])).toEqual([
      'contra',
      '*deik-',
      'contravene',
      'dict',
    ])
  })

  test('buildResearchPrompt includes linked entries and fetched related-term sections', () => {
    const context: ResearchContext = {
      mainWord: {
        word: 'contradict',
        etymonline: {
          text: '1580s, from Latin contradictus.',
          url: 'https://www.etymonline.com/word/contradict',
          relatedEntries: ['contra', '*deik-', 'contravene'],
        },
        wiktionary: {
          text: 'Derived from Latin contradictus.',
          url: 'https://en.wiktionary.org/wiki/contradict',
        },
      },
      identifiedRoots: ['contra', 'dict'],
      rootResearch: [
        {
          root: 'contra',
          etymonlineData: null,
          wiktionaryData: null,
          relatedTerms: ['oppose', 'contravene'],
        },
      ],
      relatedResearch: [
        {
          term: 'contravene',
          etymonlineData: {
            text: 'From Latin contra + venire.',
            url: 'https://www.etymonline.com/word/contravene',
          },
          wiktionaryData: null,
        },
      ],
      totalSourcesFetched: 8,
    }

    const prompt = buildResearchPrompt(context)

    expect(prompt).toContain('Etymonline linked entries: contra, *deik-, contravene')
    expect(prompt).toContain('=== Related Term: "contravene" ===')
    expect(prompt).toContain('Related terms found: oppose, contravene')
  })
})
