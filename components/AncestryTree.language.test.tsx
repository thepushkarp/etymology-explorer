import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AncestryTree } from './AncestryTree'

describe('AncestryTree language identity', () => {
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

    expect(markup).toContain('Modern Italian')
    expect(markup).not.toContain('Modern English')
  })
})
