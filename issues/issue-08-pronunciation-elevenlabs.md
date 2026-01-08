# Issue #8: Add pronunciation examples using ElevenLabs

**Status:** Open
**Labels:** `enhancement`, `help wanted`
**Created:** 2026-01-05
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/8

---

## Problem

Use ElevenLabs (check [docs](https://elevenlabs.io/docs/overview/intro)) to add a pronunciation for the word.

## Implementation Context

### Current State

The `EtymologyResult` in `lib/types.ts` already includes a `pronunciation` field that contains IPA notation (e.g., `/ˈtɛl.ə.foʊn/`). This is displayed in `components/EtymologyCard.tsx`.

What's missing is **audio playback** of the pronunciation.

### Proposed Implementation

**1. Create ElevenLabs API wrapper (`lib/elevenlabs.ts`):**

```typescript
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1'

interface PronunciationResult {
  audioUrl: string // Base64 or blob URL
  audioBlob?: Blob // For client-side playback
}

export async function generatePronunciation(
  word: string,
  ipa?: string // Optional IPA to ensure correct pronunciation
): Promise<PronunciationResult> {
  const response = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: word,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.75,
        similarity_boost: 0.75,
      },
    }),
  })

  const audioBlob = await response.blob()
  const audioUrl = URL.createObjectURL(audioBlob)

  return { audioUrl, audioBlob }
}
```

**2. Add API route (`app/api/pronunciation/route.ts`):**

```typescript
import { generatePronunciation } from '@/lib/elevenlabs'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const word = searchParams.get('word')

  if (!word) {
    return Response.json({ error: 'Word required' }, { status: 400 })
  }

  const { audioBlob } = await generatePronunciation(word)

  return new Response(audioBlob, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
    },
  })
}
```

**3. Add Play button to EtymologyCard (`components/EtymologyCard.tsx`):**

```tsx
function PronunciationButton({ word }: { word: string }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playPronunciation = async () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(`/api/pronunciation?word=${encodeURIComponent(word)}`)
      audioRef.current.onended = () => setIsPlaying(false)
    }

    setIsPlaying(true)
    await audioRef.current.play()
  }

  return (
    <button
      onClick={playPronunciation}
      disabled={isPlaying}
      className="pronunciation-btn"
      aria-label={`Play pronunciation of ${word}`}
    >
      {isPlaying ? <SpeakerWaveIcon /> : <SpeakerIcon />}
    </button>
  )
}
```

**4. Extend EtymologyResult type (optional):**

```typescript
interface EtymologyResult {
  // ... existing fields
  pronunciation: string // IPA notation
  pronunciationAudioUrl?: string // Pre-generated audio URL if cached
}
```

### Caching Strategy

Audio generation is expensive. Consider:

1. **Cache audio in Upstash/R2**: Store generated audio with word as key
2. **Generate on-demand**: Only generate when user clicks play button
3. **Pre-generate for GRE words**: Batch generate audio for `data/gre-words.json`

### Environment Variables

```env
ELEVENLABS_API_KEY=sk-xxx
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM  # Default "Rachel" voice
```

### Files to Create/Modify

- `lib/elevenlabs.ts` - New ElevenLabs API wrapper
- `app/api/pronunciation/route.ts` - New API endpoint
- `components/EtymologyCard.tsx` - Add play button next to IPA
- `components/PronunciationButton.tsx` - New component (optional)
- `package.json` - No new deps needed (using fetch)
- `.env.example` - Document ElevenLabs keys

### Cost Considerations

ElevenLabs pricing (as of 2025):

- Free tier: 10,000 characters/month
- Paid: ~$0.30 per 1,000 characters

Average word = 7 characters → ~1,400 free pronunciations/month
