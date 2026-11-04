import Image from 'next/image'
import { sourceKey } from '@/lib/sourceLabels'

const ICONS: Record<string, string> = {
  etymonline: 'etymonline.png',
  wiktionary: 'wiktionary.png',
  wiktionaryenglish: 'wiktionary.png',
  wiktionarynative: 'wiktionary.png',
  wikipedia: 'wikipedia.png',
  incelswiki: 'incelswiki.png',
  wikidatalexeme: 'wikidata.png',
  multilingualdictionary: 'freedictionary.png',
  americanheritage: 'americanheritage.jpg',
  demauro: 'demauro.png',
  dle: 'dle.png',
  americanismos: 'americanismos.png',
  cnrtl: 'cnrtl.png',
  tlfi: 'cnrtl.png',
  littre: 'cnrtl.png',
  academie: 'academie.png',
  priberam: 'priberam.png',
  michaelis: 'michaelis.png',
  bosworthtoller: 'bosworthtoller.png',
  lewisshort: 'logeion.png',
  lsj: 'logeion.png',
  exa: 'exa.png',
}

export function SourceIcon({ source }: { source: string }) {
  const icon = ICONS[sourceKey(source)]
  return icon ? (
    <Image
      src={`/source-icons/${icon}`}
      alt=""
      width={16}
      height={16}
      unoptimized
      className="size-4 shrink-0 object-contain opacity-75 grayscale dark:invert"
    />
  ) : (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      className="size-4 shrink-0"
    >
      <path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15" />
    </svg>
  )
}
