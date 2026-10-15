/** Node --import hook: controlled ElevenLabs HTTP boundary for production browser checks. */
import { readFileSync } from 'node:fs'

const path = process.env.AUDIO_PERF_FIXTURE
if (!path) throw new Error('AUDIO_PERF_FIXTURE must point to a local MP3')
const audio = readFileSync(path)
const originalFetch = globalThis.fetch
const requests = new Map()
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.hostname !== 'api.elevenlabs.io') return originalFetch(input, init)
  const { text } = JSON.parse(String(init?.body))
  const attempt = (requests.get(text) ?? 0) + 1
  requests.set(text, attempt)
  await new Promise((resolve) => setTimeout(resolve, 300))
  if (text === 'audiofailure' && attempt === 1)
    return Response.json({ detail: { message: 'Fixture unavailable' } }, { status: 503 })
  let offset = 0
  return new Response(
    new ReadableStream({
      async pull(controller) {
        if (init?.signal?.aborted) {
          controller.error(init.signal.reason)
          return
        }
        if (offset >= audio.length) {
          controller.close()
          return
        }
        if (offset > 0) await new Promise((resolve) => setTimeout(resolve, 150))
        if (text === 'audiobroken' && attempt === 1 && offset > 0) {
          controller.error(new Error('Fixture interrupted the MP3 stream'))
          return
        }
        const chunk = audio.subarray(offset, offset + 4096)
        offset += chunk.length
        controller.enqueue(chunk)
      },
    }),
    { headers: { 'Content-Type': 'audio/mpeg' } }
  )
}
