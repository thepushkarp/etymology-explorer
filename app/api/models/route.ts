import { NextRequest, NextResponse } from 'next/server'

interface AnthropicModel {
  id: string
  display_name: string
  created_at: string
  type: string
}

interface AnthropicModelsResponse {
  data: AnthropicModel[]
  has_more: boolean
  first_id: string
  last_id: string
}

// Models that support structured outputs (beta: structured-outputs-2025-11-13)
// Using prefixes to auto-support future dated versions (e.g., claude-sonnet-4-5-20260101)
// Reference: https://docs.anthropic.com/en/docs/build-with-claude/structured-outputs
const STRUCTURED_OUTPUT_MODEL_PREFIXES = [
  'claude-sonnet-4-5',
  'claude-opus-4-1',
  'claude-opus-4-5',
  'claude-haiku-4-5',
]

export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json()

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json({ success: false, error: 'API key is required' }, { status: 400 })
    }

    const response = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    })

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 401 })
      }
      const errorText = await response.text()
      return NextResponse.json(
        { success: false, error: `Failed to fetch models: ${errorText}` },
        { status: response.status }
      )
    }

    const data: AnthropicModelsResponse = await response.json()

    // Filter to only include models supporting structured outputs, sorted by created_at desc
    const chatModels = data.data
      .filter((model) =>
        STRUCTURED_OUTPUT_MODEL_PREFIXES.some((prefix) => model.id.startsWith(prefix))
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({
      success: true,
      data: chatModels.map((model) => ({
        id: model.id,
        displayName: model.display_name,
      })),
    })
  } catch (error) {
    console.error('Models API error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch models' }, { status: 500 })
  }
}
