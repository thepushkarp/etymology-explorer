import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border-soft/75">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-4 py-8 text-sm sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <p className="font-serif leading-relaxed text-charcoal-light/76">
          Sources: Etymonline, Wiktionary, Wikipedia, Urban Dictionary, Free Dictionary
        </p>
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
    </footer>
  )
}
