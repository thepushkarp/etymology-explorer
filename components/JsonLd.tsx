/**
 * JSON-LD Structured Data for Schema.org
 *
 * Renders WebApplication schema with SearchAction for sitelinks search box.
 * Content is static/hardcoded - no user input, safe for dangerouslySetInnerHTML.
 */
export function JsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Etymology Explorer',
    description:
      'Interactive tool for exploring word origins, etymological trees, and linguistic connections',
    url: 'https://etymology.thepushkarp.com',
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
        urlTemplate: 'https://etymology.thepushkarp.com/?q={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
  }

  // Safe: schema is static/hardcoded, not user input
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
