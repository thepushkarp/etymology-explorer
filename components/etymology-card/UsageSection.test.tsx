import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { UsageUnavailable } from './UsageSection'

describe('UsageUnavailable', () => {
  test('renders a restrained localized corpus note', () => {
    const markup = renderToStaticMarkup(
      <UsageUnavailable
        title="Uso ao longo do tempo"
        noteLabel="Nota do corpus"
        message="Os dados históricos de uso ainda não estão disponíveis para este corpus."
      />
    )

    expect(markup).toContain('Uso ao longo do tempo')
    expect(markup).toContain('Nota do corpus')
    expect(markup).toContain('Os dados históricos de uso ainda não estão disponíveis')
    expect(markup).toContain('border-l-2')
  })
})
