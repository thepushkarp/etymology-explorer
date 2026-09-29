import Link from 'next/link'

const LINKS = [
  { href: '/words', label: 'Index' },
  { href: '/learn/what-is-etymology', label: 'Learn' },
  { href: '/faq', label: 'FAQ' },
]

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-auto flex w-full max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 pb-8 pt-20 text-sm text-muted sm:px-6">
      <nav className="flex gap-5" aria-label="Footer">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="transition-colors hover:text-ink">
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="ml-auto">
        Made by{' '}
        <a
          href="https://thepushkarp.com"
          target="_blank"
          rel="noopener noreferrer"
          className="link"
        >
          pushkar
        </a>
      </p>
    </footer>
  )
}
