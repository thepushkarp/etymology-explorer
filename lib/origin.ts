import { headers } from 'next/headers'
import { SITE_ORIGIN } from '@/lib/site'

const FALLBACK_ORIGIN = SITE_ORIGIN

function normalizeOrigin(value: string): string {
  return value.replace(/\/$/, '')
}

function firstForwardedValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null
}

function normalizeProtocol(value: string | null): 'http' | 'https' {
  return value === 'http' || value === 'https' ? value : 'https'
}

export async function getRequestOrigin(): Promise<string> {
  const h = await headers()
  const forwardedHost = firstForwardedValue(h.get('x-forwarded-host'))
  const host = forwardedHost ?? firstForwardedValue(h.get('host'))
  const protocol = normalizeProtocol(firstForwardedValue(h.get('x-forwarded-proto')))

  if (!host) return FALLBACK_ORIGIN

  return normalizeOrigin(`${protocol}://${host}`)
}
