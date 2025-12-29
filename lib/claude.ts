import Anthropic from '@anthropic-ai/sdk'
import { EtymologyResult, RawSourceData } from './types'
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

  const userPrompt = buildUserPrompt(
    word,
    sourceData.etymonline ?? null,
    sourceData.wiktionary ?? null
  )

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

    // Determine sources used
    result.sources = []
    if (sourceData.etymonline) result.sources.push('etymonline')
    if (sourceData.wiktionary) result.sources.push('wiktionary')
    if (result.sources.length === 0) result.sources.push('synthesized')

    return result
  } catch (error) {
    console.error('Failed to parse Claude response:', textContent.text, error)
    throw new Error('Invalid JSON response from Claude')
  }
}
