import Link from 'next/link'

const FOOTER_LINKS = [
  { href: '/learn/what-is-etymology', label: 'Learn' },
  { href: '/faq', label: 'FAQ' },
]

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border-soft/75">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 py-8 text-sm sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <p className="font-serif leading-relaxed text-charcoal-light/76">
          Sources: Etymonline, Wiktionary, Wikipedia, Urban Dictionary, Free Dictionary
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6 lg:justify-end">
          <nav className="flex gap-5" aria-label="Footer navigation">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[10.5px] uppercase tracking-[0.24em] text-charcoal-light/72 transition-colors hover:text-charcoal"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="font-serif italic text-charcoal-light/72">
            built with curiosity by{' '}
            <Link
              href="https://thepushkarp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="editorial-link transition-colors hover:text-charcoal"
            >
              pushkar
            </Link>
          </p>
        </div>
      </div>
    </footer>
  )
}
