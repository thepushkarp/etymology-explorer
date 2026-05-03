/**
 * JSON-LD Structured Data for Schema.org
 *
 * Renders WebApplication schema with SearchAction for sitelinks search box.
 * Content is static/hardcoded - no user input, safe for dangerouslySetInnerHTML.
 */
import { SITE_ORIGIN, SITE_SEARCH_URL_TEMPLATE, SITE_SHORT_NAME } from '@/lib/site'

export function JsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_SHORT_NAME,
    description:
      'Interactive tool for exploring word origins, etymological trees, and linguistic connections',
    url: SITE_ORIGIN,
    applicationCategory: 'WebApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    author: {
      '@type': 'Person',
      name: 'Pushkar Patel',
      url: 'https://thepushkarp.com',
    },
    inLanguage: 'en',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: SITE_SEARCH_URL_TEMPLATE,
      },
      'query-input': 'required name=search_term_string',
    },
  }

  // Safe: schema is static/hardcoded, not user input
  // XSS sanitization: replace < with unicode equivalent per Next.js docs
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schema).replace(/</g, '\\u003c'),
      }}
    />
  )
}
