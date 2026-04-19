import { EditorialPageFrame } from '@/components/EditorialPageFrame'

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/etymology?word=<word>[&stream=true]',
    description: 'Grounded etymology synthesis with optional streaming mode.',
  },
  {
    method: 'GET',
    path: '/api/suggestions?q=<partial-word>',
    description: 'Spelling and typo suggestions for user input.',
  },
  {
    method: 'GET',
    path: '/api/random-word',
    description: 'Returns a random GRE word for exploration.',
  },
  {
    method: 'GET',
    path: '/api/pronunciation?word=<word>',
    description: 'Returns pronunciation audio metadata for a word.',
  },
  {
    method: 'GET',
    path: '/api/ngram?word=<word>',
    description: 'Returns usage timeline data for charting.',
  },
  {
    method: 'GET',
    path: '/api/health',
    description: 'Lightweight health endpoint for service monitoring.',
  },
]

export const metadata = {
  title: 'API Docs | Etymology Explorer',
}

export default function ApiDocsPage() {
  return (
    <EditorialPageFrame
      eyebrow="developer reference"
      title="Etymology Explorer API"
      subtitle="Machine-friendly documentation for the core endpoints behind the explorer."
    >
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="editorial-panel h-fit p-6">
          <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">notes</p>
          <p className="mt-4 text-sm leading-relaxed text-charcoal-light">
            You can also inspect the OpenAPI-compatible descriptor at{' '}
            <code className="rounded bg-cream-dark/70 px-1.5 py-0.5 text-charcoal">
              /openapi.json
            </code>
            .
          </p>
        </aside>

        <ul className="space-y-4">
          {ENDPOINTS.map((endpoint) => (
            <li key={endpoint.path} className="editorial-panel p-5">
              <p className="text-xs uppercase tracking-widest text-charcoal-light">
                {endpoint.method}
              </p>
              <p className="mt-2 font-mono text-sm">{endpoint.path}</p>
              <p className="mt-2 text-sm text-charcoal-light">{endpoint.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </EditorialPageFrame>
  )
}
