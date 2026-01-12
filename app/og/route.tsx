import { ImageResponse } from 'next/og'

export const runtime = 'edge'

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
        backgroundColor: '#FDFBF7',
        fontFamily: 'serif',
      }}
    >
      {/* Decorative border */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          right: 24,
          bottom: 24,
          border: '2px solid #2C2C2C',
          borderRadius: 8,
          opacity: 0.1,
        }}
      />

      {/* Book icon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 32,
        }}
      >
        <svg width="80" height="80" viewBox="0 0 32 32" fill="none" style={{ opacity: 0.7 }}>
          <circle cx="16" cy="16" r="15" fill="#2C2C2C" />
          <path
            d="M8 10C8 9.44772 8.44772 9 9 9H14C14.5523 9 15 9.44772 15 10V22C15 22.5523 14.5523 23 14 23H9C8.44772 23 8 22.5523 8 22V10Z"
            fill="#FDFBF7"
          />
          <path
            d="M17 10C17 9.44772 17.4477 9 18 9H23C23.5523 9 24 9.44772 24 10V22C24 22.5523 23.5523 23 23 23H18C17.4477 23 17 22.5523 17 22V10Z"
            fill="#FDFBF7"
          />
          <path d="M15 10V23H17V10H15Z" fill="#2C2C2C" opacity="0.3" />
          <line x1="10" y1="12" x2="13" y2="12" stroke="#2C2C2C" strokeWidth="0.5" opacity="0.3" />
          <line x1="10" y1="14" x2="13" y2="14" stroke="#2C2C2C" strokeWidth="0.5" opacity="0.3" />
          <line x1="10" y1="16" x2="12" y2="16" stroke="#2C2C2C" strokeWidth="0.5" opacity="0.3" />
          <line x1="19" y1="12" x2="22" y2="12" stroke="#2C2C2C" strokeWidth="0.5" opacity="0.3" />
          <line x1="19" y1="14" x2="22" y2="14" stroke="#2C2C2C" strokeWidth="0.5" opacity="0.3" />
          <line x1="19" y1="16" x2="21" y2="16" stroke="#2C2C2C" strokeWidth="0.5" opacity="0.3" />
        </svg>
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 64,
          fontWeight: 700,
          color: '#2C2C2C',
          marginBottom: 16,
          letterSpacing: '-0.02em',
        }}
      >
        Etymology Explorer
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: 28,
          color: '#2C2C2C',
          opacity: 0.6,
          fontStyle: 'italic',
        }}
      >
        Discover the roots and origins of words
      </div>

      {/* URL */}
      <div
        style={{
          position: 'absolute',
          bottom: 48,
          fontSize: 18,
          color: '#2C2C2C',
          opacity: 0.4,
        }}
      >
        etymology.thepushkarp.com
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    }
  )
}
