import { describe, expect, mock, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { WordEntry } from '@/lib/types'

const getCachedEntry = mock(async (): Promise<{ entry: WordEntry; stale: boolean } | null> => null)
mock.module('@/lib/cache', () => ({ getCachedEntry }))

mock.module('next/og', () => ({
  ImageResponse: class extends Response {
    constructor(element: ReactNode) {
      super(renderToStaticMarkup(element))
    }
  },
}))

const { GET } = await import('./route')

describe('word OG labels', () => {
  test('primary pages use general wording while explicit language pages name their language', async () => {
    const primary = await GET(new Request('https://etymex.test/og?word=chat'))
    expect(await primary.text()).toContain('the etymology of')
    const english = await GET(new Request('https://etymex.test/og?word=chat&language=en'))
    expect(await english.text()).toContain('the English etymology of')
    const french = await GET(new Request('https://etymex.test/og?word=chat&language=fr'))
    expect(await french.text()).toContain('the French etymology of')
  })

  test('uses cached romanization for native scripts and names the selected language beneath', async () => {
    getCachedEntry.mockResolvedValueOnce({
      stale: false,
      entry: {
        word: 'धर्म',
        languages: ['hi', 'sa'],
        entries: {
          hi: { transliteration: 'dharm' },
          sa: { transliteration: 'dharma' },
        },
      } as WordEntry,
    })
    const response = await GET(
      new Request('https://etymex.test/og?word=%E0%A4%A7%E0%A4%B0%E0%A5%8D%E0%A4%AE&language=sa')
    )
    const markup = await response.text()
    expect(getCachedEntry).toHaveBeenLastCalledWith('धर्म')
    expect(markup).toContain('>d</span><span>harma</span>')
    expect(markup).toContain('>Sanskrit</div>')
    expect(markup.indexOf('harma</span>')).toBeLessThan(markup.indexOf('>Sanskrit</div>'))
    expect(markup).not.toContain('धर्म')
  })

  test('uses a language label when a source romanization is unavailable', async () => {
    const response = await GET(
      new Request('https://etymex.test/og?word=%DA%A9%D8%AA%D8%A7%D8%A8&language=ur')
    )
    const markup = await response.text()
    expect(markup).toContain('>U</span><span>rdu</span>')
    expect(markup).not.toContain('کتاب')
  })
})
