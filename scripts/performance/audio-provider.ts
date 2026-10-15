/** Paired ElevenLabs transport timings with the production voice, model and audio settings. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { generatePronunciation } from '@/lib/elevenlabs'
import { safeError } from '@/lib/errorUtils'

const { values } = parseArgs({ options: { label: { type: 'string' } } })
if (!values.label || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values.label))
  throw new Error('Pass a path-safe --label')
const directory = `bench-results/audio-performance/${values.label}`
mkdirSync(directory, { recursive: true })
const originalFetch = globalThis.fetch
const rows = []
try {
  for (const [index, [word, language]] of (
    [
      ['etymology', 'en'],
      ['fenêtre', 'fr'],
      ['pomme de terre', 'fr'],
    ] as const
  ).entries()) {
    for (const variant of index % 2 ? ['stream', 'buffered'] : ['buffered', 'stream']) {
      const start = performance.now()
      let headersMs = 0
      let contentLength: string | null = null
      let firstByteMs: number | undefined
      let requestBody: unknown
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const target = new URL(input instanceof Request ? input.url : String(input))
        if (target.hostname !== 'api.elevenlabs.io')
          throw new Error('Unexpected benchmark destination')
        target.pathname = target.pathname.replace(/\/stream$/, '')
        if (variant === 'stream') target.pathname += '/stream'
        requestBody = JSON.parse(String(init?.body))
        const response = await originalFetch(target, init)
        headersMs = performance.now() - start
        contentLength = response.headers.get('content-length')
        if (!response.ok || !response.body) return response
        return new Response(
          response.body.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                firstByteMs ??= performance.now() - start
                controller.enqueue(chunk)
              },
            })
          ),
          { status: response.status, headers: response.headers }
        )
      }) as typeof fetch
      const audio = await new Response(await generatePronunciation(word, language)).arrayBuffer()
      const row = {
        word,
        language,
        variant,
        headersMs,
        contentLength,
        firstByteMs,
        completeMs: performance.now() - start,
        bytes: audio.byteLength,
        requestBody,
      }
      rows.push(row)
      writeFileSync(`${directory}/${index}-${variant}.mp3`, Buffer.from(audio))
      writeFileSync(`${directory}/summary.json`, JSON.stringify(rows, null, 2))
      console.log(row)
    }
  }
} catch (error) {
  const message = safeError(error).replaceAll(
    process.env.ELEVENLABS_VOICE_ID ?? '__unset_voice__',
    '[voice]'
  )
  writeFileSync(`${directory}/failure.json`, JSON.stringify({ error: message }, null, 2))
  throw new Error(message)
} finally {
  globalThis.fetch = originalFetch
}
