import { ImageResponse } from 'next/og'
import { SITE_HOST, SITE_SHORT_NAME } from '@/lib/site'

export async function GET() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F6F1E6',
        fontFamily: 'serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          lineHeight: 0.88,
          marginBottom: 34,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 96,
            fontWeight: 700,
            color: '#1B1A17',
            letterSpacing: '-0.06em',
          }}
        >
          <span style={{ color: '#7E2A1F' }}>Etym</span>ology
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 96,
            fontWeight: 700,
            color: '#1B1A17',
            letterSpacing: '-0.06em',
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
          display: 'flex',
          position: 'absolute',
          bottom: 48,
          fontSize: 18,
          color: '#1B1A17',
          opacity: 0.48,
        }}
      >
        {SITE_SHORT_NAME} · {SITE_HOST}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    }
  )
}
