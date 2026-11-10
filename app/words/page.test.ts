import { describe, expect, mock, test } from 'bun:test'
import { Children, isValidElement, type ReactNode } from 'react'
import { WordLink } from '@/components/WordLink'
import { SITE_ORIGIN } from '@/lib/site'

const tracedWords = [{ word: 'école' }, { word: 'chat' }, { word: 'नमस्ते' }, { word: 'سلام' }]
mock.module('@/lib/tracedWords', () => ({ getTracedWords: async () => tracedWords }))

const { default: WordsIndexPage } = await import('./page')
const { default: sitemap } = await import('../sitemap')

function elements(node: ReactNode): Array<{ type: unknown; props: Record<string, unknown> }> {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return []
    return [
      child as { type: unknown; props: Record<string, unknown> },
      ...elements(child.props.children),
    ]
  })
}

describe('merged corpus discovery pages', () => {
  test('the index folds Latin accents, groups other scripts, and links only primary pages', async () => {
    const tree = elements(await WordsIndexPage())
    const headings = tree.filter((element) => element.type === 'h2')
    expect(headings.map((heading) => heading.props.children)).toEqual([
      'C',
      'E',
      'Arabic',
      'Devanagari',
    ])
    const links = tree.filter((element) => element.type === WordLink)
    expect(links.map((link) => link.props.word).sort()).toEqual(
      tracedWords.map(({ word }) => word).sort()
    )
    expect(links.every((link) => link.props.language === undefined)).toBe(true)
  })

  test('the sitemap contains one primary URL for each corpus word', async () => {
    const entries = await sitemap()
    const urls = entries.map(({ url }) => url)
    for (const { word } of tracedWords) {
      expect(urls).toContain(`${SITE_ORIGIN}/word/${encodeURIComponent(word)}`)
    }
    expect(urls.filter((url) => url.includes('/word/'))).toHaveLength(tracedWords.length)
  })
})
