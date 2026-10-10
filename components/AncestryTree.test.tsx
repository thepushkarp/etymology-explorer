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
  })
})
