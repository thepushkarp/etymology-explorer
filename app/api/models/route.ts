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

    // Filter to only include chat models (claude-*) and sort by created_at desc
    const chatModels = data.data
      .filter((model) => model.id.startsWith('claude-'))
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
