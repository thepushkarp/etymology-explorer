import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { TraceHeader } from './TraceHeader'
import type { PartialEtymology } from '@/lib/streamReducer'

describe('TraceHeader', () => {
  test('renders a shimmer skeleton before the definition arrives', () => {
    const markup = renderToStaticMarkup(<TraceHeader word="perfidious" sections={{}} />)

    expect(markup).toContain('perfidious')
    expect(markup).toContain('animate-pulse')
    // The real header's definition-driven nav is absent while skeletal.
    expect(markup).not.toContain('#entry-sources')
  })

  test('promotes to the real header once the definition is present', () => {
    const sections: PartialEtymology = {
      word: 'perfidious',
      pronunciation: '/pərˈfɪdiəs/',
      definition: 'Deceitful and untrustworthy.',
    }
    const markup = renderToStaticMarkup(<TraceHeader word="perfidious" sections={sections} />)

    expect(markup).toContain('Deceitful and untrustworthy.')
    expect(markup).toContain('/pərˈfɪdiəs/')
    expect(markup).toContain('#entry-sources')
    expect(markup).not.toContain('animate-pulse')
  })

  test('projects bilingual streamed prose before rendering a beta header', () => {
    const sections = {
      word: 'exemple',
      pronunciation: '/ɛɡ.zɑ̃pl/',
      definition: { en: 'A representative instance.', local: 'Un cas représentatif.' },
      roots: [
        {
          root: 'exemplum',
          origin: 'Latin',
          meaning: { en: 'sample', local: 'modèle' },
          relatedWords: [],
        },
      ],
    } as unknown as PartialEtymology

    const markup = renderToStaticMarkup(
      <TraceHeader word="exemple" language="fr" sections={sections} />
    )

    expect(markup).toContain('Un cas représentatif.')
    expect(markup).toContain('Latin exemplum (modèle)')
    expect(markup).not.toContain('A representative instance.')
    expect(markup).not.toContain('[object Object]')
  })

  test('renders the summary slot beneath the header', () => {
    const markup = renderToStaticMarkup(
      <TraceHeader word="perfidious" sections={{}} summary={<p>6 sources · 2.3s</p>} />
    )

    expect(markup).toContain('6 sources · 2.3s')
  })
})
