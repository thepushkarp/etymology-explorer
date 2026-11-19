'use client'

import { useEffect, useState } from 'react'
import { WordLink } from './WordLink'
import { isValidWord } from '@/lib/validation'
import type { TrendsResponse } from '@/lib/trends'

export function TrendingSearches() {
  const [feed, setFeed] = useState<TrendsResponse | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      const response = await fetch('/api/trends', { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data: TrendsResponse = await response.json()
      if (!controller.signal.aborted) setFeed(data)
    }
    void load().catch((error) => {
      if (!controller.signal.aborted) console.warn('[Trends] Feed unavailable:', error)
    })
    return () => controller.abort()
  }, [])
  if (!feed?.trends.length || !feed.updatedAt) return null
  const updated = new Date(feed.updatedAt)
  return (
    <section className="mt-16" aria-labelledby="trends-heading">
      <h2 id="trends-heading" className="label">
        Trending across countries
      </h2>
      <p className="mt-2 text-sm text-muted">
        From{' '}
        <a href="https://trends.google.com/trending" className="link">
          Google Trends
        </a>{' '}
        · Updated{' '}
        <time dateTime={updated.toISOString()}>
          {updated.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
        </time>
      </p>
      <ul className="mt-4 border-t border-rule">
        {feed.trends.map(({ query, countryCount }) => (
          <li key={query} className="border-b border-rule py-4">
            <a
              className="font-serif text-xl text-ink hover:text-accent"
              href={`https://trends.google.com/trends/explore?${new URLSearchParams({ date: 'now 1-d', q: query })}`}
            >
              <bdi>{query}</bdi>
            </a>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 text-sm text-muted">
              <span>{countryCount} countries</span>
              {isValidWord(query) && (
                <WordLink word={query} title={`Look up ${query} in EtymEx`}>
                  Look up in EtymEx
                </WordLink>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
