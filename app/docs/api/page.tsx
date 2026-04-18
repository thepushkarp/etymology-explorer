import Link from 'next/link'

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
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12 text-charcoal">
      <h1 className="font-serif text-4xl tracking-tight">Etymology Explorer API</h1>
      <p className="mt-4 text-charcoal-light">
        Machine-friendly documentation for core API endpoints. You can also inspect the
        OpenAPI-compatible descriptor at <code>/openapi.json</code>.
      </p>

      <ul className="mt-10 space-y-4">
        {ENDPOINTS.map((endpoint) => (
          <li key={endpoint.path} className="rounded-xl border border-border-soft bg-surface p-5">
            <p className="text-xs uppercase tracking-widest text-charcoal-light">
              {endpoint.method}
            </p>
            <p className="mt-2 font-mono text-sm">{endpoint.path}</p>
            <p className="mt-2 text-sm text-charcoal-light">{endpoint.description}</p>
          </li>
        ))}
      </ul>

      <div className="mt-8 text-sm text-charcoal-light">
        <Link href="/" className="underline decoration-border-strong underline-offset-4">
          Return to homepage
        </Link>
      </div>
    </main>
  )
}
