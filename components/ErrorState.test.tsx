import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorState } from './ErrorState'

describe('ErrorState script offers', () => {
  test('offers source spellings when the original query has no result', () => {
    const html = renderToStaticMarkup(
      <ErrorState
        language="en"
        error={{
          type: 'nonsense',
          message: 'No supported entry was found.',
          suggestions: [],
          otherScripts: [{ word: 'किताब', language: 'hi' }],
        }}
      />
    )
    expect(html).toContain('No supported entry was found.')
    expect(html).toContain('Hindi entries')
    expect(html).toContain(`href="/word/hi/${encodeURIComponent('किताब')}"`)
    expect(html).not.toContain('Perhaps')
  })

  test('does not invent script offers without source targets', () => {
    const html = renderToStaticMarkup(
      <ErrorState language="en" error={{ type: 'nonsense', message: '', suggestions: [] }} />
    )
    expect(html).not.toContain('entries</p>')
    expect(html).not.toContain('href=')
  })
})
