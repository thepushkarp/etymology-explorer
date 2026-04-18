import { createHash } from 'crypto'
import { NextResponse } from 'next/server'

const BASE_URL = 'https://etymology.thepushkarp.com'

const skills = [
  {
    name: 'etymology-search',
    type: 'http',
    description: 'Look up word origins using the public etymology endpoint.',
    url: `${BASE_URL}/api/etymology?word=example`,
  },
  {
    name: 'api-catalog',
    type: 'discovery',
    description: 'Discover API metadata and documentation links.',
    url: `${BASE_URL}/.well-known/api-catalog`,
  },
]

function withDigest(entry: (typeof skills)[number]) {
  const digest = createHash('sha256').update(JSON.stringify(entry)).digest('hex')
  return { ...entry, sha256: digest }
}

export async function GET() {
  const payload = {
    $schema: 'https://agentskills.io/schemas/skill-index-v0.2.0.json',
    skills: skills.map(withDigest),
  }

  return NextResponse.json(payload)
}
