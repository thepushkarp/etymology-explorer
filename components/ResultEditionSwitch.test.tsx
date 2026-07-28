import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResultEditionSwitch } from './ResultEditionSwitch'

describe('ResultEditionSwitch', () => {
  test('identifies the selected reading edition without changing the lexeme', () => {
    const markup = renderToStaticMarkup(
      <ResultEditionSwitch language="it" locale="local" onChange={() => undefined} />
    )

    expect(markup).toContain('aria-label="Reading edition"')
    expect(markup).toContain('English')
    expect(markup).toContain('Italiano')
    expect(markup).toContain('aria-pressed="true"')
  })
})
