import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { getRequestOrigin } from '@/lib/origin'

type SkillEntry = {
  name: string
  type: 'http' | 'discovery'
  description: string
  url: string
}

function withDigest(entry: SkillEntry) {
  const digest = createHash('sha256').update(JSON.stringify(entry)).digest('hex')
  return { ...entry, sha256: digest }
}

export async function GET() {
  const baseUrl = await getRequestOrigin()
  const skills = [
    {
      name: 'etymology-search',
      type: 'http',
      description: 'Look up word origins using the public etymology endpoint.',
      url: `${baseUrl}/api/etymology?word=example`,
    },
    {
      name: 'api-catalog',
      type: 'discovery',
      description: 'Discover API metadata and documentation links.',
      url: `${baseUrl}/.well-known/api-catalog`,
    },
  ] as const

  const payload = {
    $schema: 'https://agentskills.io/schemas/skill-index-v0.2.0.json',
    skills: skills.map(withDigest),
  }

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
