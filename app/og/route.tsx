import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { SITE_HOST, SITE_SHORT_NAME } from '@/lib/site'
import { canonicalizeWord, isValidWord } from '@/lib/validation'

const fontDirectory = join(process.cwd(), 'public/fonts')

// Lazy + memoized so a failed read rejects inside the request handler
// (500 for that request) instead of as an unhandled rejection at module load
let brandFontData: Promise<[Buffer, Buffer]> | null = null

function loadBrandFonts(): Promise<[Buffer, Buffer]> {
  brandFontData ??= Promise.all([
    readFile(join(fontDirectory, 'LibreBaskerville-Regular.ttf')),
    readFile(join(fontDirectory, 'LibreBaskerville-Italic.ttf')),
  ]).catch((error) => {
    brandFontData = null // allow retry on transient failures
    throw error
  })
  return brandFontData
}

const IMAGE_OPTIONS = { width: 1200, height: 630 }

/** Split off the first grapheme (accent-colored) without breaking surrogate
 *  pairs or detaching combining diacritics from their base letter. */
function splitLeadingGrapheme(word: string): [string, string] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const graphemes = Array.from(segmenter.segment(word), (segment) => segment.segment)
  return [graphemes[0] ?? '', graphemes.slice(1).join('')]
}

function wordFontSize(word: string): number {
  if (word.length <= 10) return 148
  if (word.length <= 16) return 112
  if (word.length <= 24) return 84
  return 62
}

function BrandCard() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F6F1E6',
        fontFamily: 'Libre Baskerville',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          lineHeight: 1,
          marginBottom: 34,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 96,
            fontStyle: 'italic',
            fontWeight: 400,
            color: '#1B1A17',
            letterSpacing: '-0.06em',
            lineHeight: 1,
          }}
        >
          <span style={{ color: '#7E2A1F' }}>Etym</span>ology
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 96,
            fontStyle: 'italic',
            fontWeight: 400,
            color: '#1B1A17',
            letterSpacing: '-0.06em',
            lineHeight: 1,
            marginTop: -18,
          }}
        >
          <span style={{ color: '#7E2A1F' }}>Ex</span>plorer
        </div>
      </div>
      <div
        style={{
          fontSize: 28,
          color: '#1B1A17',
          opacity: 0.68,
          fontStyle: 'italic',
          marginBottom: 20,
        }}
      >
        Discover the roots and origins of words
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 48,
          fontSize: 18,
          color: '#1B1A17',
          opacity: 0.48,
        }}
      >
        {`${SITE_SHORT_NAME} · ${SITE_HOST}`}
      </div>
    </div>
  )
}

function WordCard({ word }: { word: string }) {
  const [initial, rest] = splitLeadingGrapheme(word)
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F6F1E6',
        fontFamily: 'Libre Baskerville',
        padding: 80,
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: 26,
          textTransform: 'uppercase',
          letterSpacing: '0.24em',
          color: '#1B1A17',
          opacity: 0.6,
          marginBottom: 34,
        }}
      >
        the etymology of
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: wordFontSize(word),
          fontStyle: 'italic',
          color: '#1B1A17',
          letterSpacing: '-0.04em',
          lineHeight: 1.05,
          maxWidth: 1040,
        }}
      >
        <span style={{ color: '#7E2A1F' }}>{initial}</span>
        <span>{rest}</span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginTop: 44,
          color: '#1B1A17',
          opacity: 0.35,
        }}
      >
        <div style={{ width: 48, height: 1, backgroundColor: '#1B1A17' }} />
        <div style={{ fontSize: 22, fontStyle: 'italic' }}>§</div>
        <div style={{ width: 48, height: 1, backgroundColor: '#1B1A17' }} />
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 48,
          fontSize: 18,
          color: '#1B1A17',
          opacity: 0.48,
        }}
      >
        {`${SITE_SHORT_NAME} · ${SITE_HOST}`}
      </div>
    </div>
  )
}

export async function GET(request: Request) {
  const [regularFont, italicFont] = await loadBrandFonts()

  const fonts = [
    {
      name: 'Libre Baskerville',
      data: regularFont,
      weight: 400 as const,
      style: 'normal' as const,
    },
    {
      name: 'Libre Baskerville',
      data: italicFont,
      weight: 400 as const,
      style: 'italic' as const,
    },
  ]

  const rawWord = new URL(request.url).searchParams.get('word')
  const word = rawWord ? canonicalizeWord(rawWord) : ''

  if (word && isValidWord(word)) {
    return new ImageResponse(<WordCard word={word} />, { ...IMAGE_OPTIONS, fonts })
  }

  return new ImageResponse(<BrandCard />, { ...IMAGE_OPTIONS, fonts })
}
