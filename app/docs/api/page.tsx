import { PageFrame } from '@/components/PageFrame'

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/etymology?word=<word>[&language=it][&stream=true]',
    description: 'Grounded etymology synthesis with optional streaming mode.',
  },
  {
    method: 'GET',
    path: '/api/suggestions?q=<partial-word>[&language=it]',
    description: 'Spelling and typo suggestions for user input.',
  },
  {
    method: 'GET',
    path: '/api/random-word[?language=it]',
    description: 'Returns a random word from the selected language for exploration.',
  },
  {
    method: 'GET',
    path: '/api/pronunciation?word=<word>[&language=it]',
    description: 'Pronunciation audio for a word.',
  },
  {
    method: 'GET',
    path: '/api/ngram?word=<word>[&language=it]',
    description: 'Returns usage timeline data for charting.',
  },
  {
    method: 'GET',
    path: '/api/health',
    description: 'Lightweight health endpoint for service monitoring.',
  },
]

export const metadata = {
  title: 'API Docs | EtymEx',
}

export default function ApiDocsPage() {
  return (
    <PageFrame
      title="API"
      subtitle="The endpoints behind the explorer. Every response is { success, data?, error? }."
    >
      <dl className="space-y-8">
        {ENDPOINTS.map((endpoint) => (
          <div key={endpoint.path}>
            <dt className="break-all font-mono text-sm text-ink">
              <span className="mr-3 text-muted">{endpoint.method}</span>
              {endpoint.path}
            </dt>
            <dd className="mt-1 font-serif text-muted">{endpoint.description}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-12 text-sm text-muted">
        Machine-readable:{' '}
        <a href="/openapi.json" className="link">
          OpenAPI
        </a>
        {' · '}
        <a href="/.well-known/api-catalog" className="link">
          API catalog
        </a>
      </p>
    </PageFrame>
  )
}
