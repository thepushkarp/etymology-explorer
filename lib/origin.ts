import { headers } from 'next/headers'

const FALLBACK_ORIGIN = 'https://etymology.thepushkarp.com'

function normalizeOrigin(value: string): string {
  return value.replace(/\/$/, '')
}

export async function getRequestOrigin(): Promise<string> {
  const h = await headers()
  const forwardedHost = h.get('x-forwarded-host')
  const host = forwardedHost ?? h.get('host')
  const protocol = h.get('x-forwarded-proto') ?? 'https'

  if (!host) return FALLBACK_ORIGIN

  return normalizeOrigin(`${protocol}://${host}`)
}
