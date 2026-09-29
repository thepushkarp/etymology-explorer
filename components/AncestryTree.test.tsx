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
  test('renders each stage as a collapsed, expandable node', () => {
    const markup = renderToStaticMarkup(
      <AncestryTree
        word="window"
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
    expect(markup).not.toContain('from Old Norse vindauga')
  })
})
