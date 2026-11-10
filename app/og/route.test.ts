import { describe, expect, mock, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

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
})
