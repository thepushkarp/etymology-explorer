import Anthropic from '@anthropic-ai/sdk'
import { EtymologyResult, RawSourceData, SourceReference } from './types'
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts'

/**
 * Call Claude Haiku to synthesize etymology from source data
 */
export async function synthesizeEtymology(
  word: string,
  sourceData: RawSourceData,
  apiKey: string
): Promise<EtymologyResult> {
  const client = new Anthropic({
    apiKey,
  })

  // Extract text for the prompt
  const etymonlineText = sourceData.etymonline?.text ?? null
  const wiktionaryText = sourceData.wiktionary?.text ?? null

  const userPrompt = buildUserPrompt(word, etymonlineText, wiktionaryText)

  const response = await client.messages.create({
    model: 'claude-3-5-haiku-latest',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  })

  // Extract text content from response
  const textContent = response.content.find((block) => block.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  // Parse JSON response
  try {
    const result = JSON.parse(textContent.text) as EtymologyResult

    // Build sources array with URLs
    const sources: SourceReference[] = []
    if (sourceData.etymonline) {
      sources.push({ name: 'etymonline', url: sourceData.etymonline.url })
    }
    if (sourceData.wiktionary) {
      sources.push({ name: 'wiktionary', url: sourceData.wiktionary.url })
    }
    if (sources.length === 0) {
      sources.push({ name: 'synthesized' })
    }
    result.sources = sources

    return result
  } catch (error) {
    console.error('Failed to parse Claude response:', textContent.text, error)
    throw new Error('Invalid JSON response from Claude')
  }
}
